import { AWSService } from '../services/aws-service.js';
import { SSHService } from '../services/ssh-service.js';
import { DNSService } from '../services/dns-service.js';
import { EncryptionService } from '../services/encryption.js';
import { sessionManager } from '../utils/session-manager.js';
import { DeploymentConfig } from '../types/deployment.js';

export async function createVm(config: DeploymentConfig): Promise<{ sessionId: string; message: string }> {
  const sessionId = sessionManager.createSession(config);
  
  // Start the deployment process asynchronously
  deployVmAsync(sessionId, config).catch(error => {
    sessionManager.emitError(sessionId, error.message);
  });

  return {
    sessionId,
    message: 'VM deployment started. Use the session ID to track progress via SSE.',
  };
}

async function deployVmAsync(sessionId: string, config: DeploymentConfig): Promise<void> {
  const encryptionService = new EncryptionService();
  let awsService: AWSService | null = null;
  let sshService: SSHService | null = null;
  let dnsService: DNSService | null = null;

  try {
    sessionManager.emitProgress(sessionId, 'Initializing deployment...');

    // Initialize services
    awsService = new AWSService(config);
    sshService = new SSHService();
    dnsService = new DNSService(config);

    // Generate instance name from repository
    const repoName = config.githubRepoUrl
      .split('/')
      .pop()
      ?.replace(/\.git$/, '') || config.projectName;
    const instanceName = repoName;

    sessionManager.emitProgress(sessionId, `Creating Lightsail instance: ${instanceName}`);

    // Create Lightsail instance
    await awsService.createInstance(instanceName, config);
    sessionManager.updateSession(sessionId, { instanceName });

    sessionManager.emitProgress(sessionId, 'Waiting for instance to be ready...');

    // Wait for instance to be running and get public IP
    const publicIp = await awsService.waitForInstanceRunning(instanceName);
    sessionManager.updateSession(sessionId, { publicIp });

    sessionManager.emitProgress(sessionId, `Instance ready at IP: ${publicIp}`);

    // Open all ports
    sessionManager.emitProgress(sessionId, 'Opening firewall ports...');
    await awsService.openAllPorts(instanceName);

    // Wait a bit for the instance to fully initialize
    sessionManager.emitProgress(sessionId, 'Waiting for instance initialization...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Connect via SSH
    sessionManager.emitProgress(sessionId, 'Connecting via SSH...');
    await sshService.connect(publicIp, config.awsSshKey);

    // Execute setup commands
    sessionManager.emitProgress(sessionId, 'Setting up environment and deploying application...');
    const setupLogs = await sshService.executeSetupCommands(config, instanceName);
    
    // Emit each log
    for (const log of setupLogs) {
      sessionManager.emitLog(sessionId, log);
    }

    // Disconnect SSH
    sshService.disconnect();

    // Create DNS record
    sessionManager.emitProgress(sessionId, 'Creating DNS record...');
    const dnsName = await dnsService.createDnsRecord(instanceName, publicIp);
    sessionManager.updateSession(sessionId, { dnsName });

    // Complete deployment
    const deploymentInfo = {
      instanceName,
      publicIp,
      dnsName,
      url: `https://${dnsName}`,
      status: 'success',
    };

    sessionManager.emitComplete(sessionId, deploymentInfo);
    sessionManager.emitProgress(sessionId, `Deployment complete! Your application is available at: https://${dnsName}`);

  } catch (error) {
    const errorMessage = (error as Error).message;
    sessionManager.emitError(sessionId, errorMessage);

    // Cleanup on error
    try {
      const session = sessionManager.getSession(sessionId);
      if (session?.instanceName && awsService) {
        sessionManager.emitProgress(sessionId, 'Cleaning up failed deployment...');
        await awsService.deleteInstance(session.instanceName);
        
        if (dnsService && session.dnsName) {
          await dnsService.deleteDnsRecord(session.instanceName);
        }
      }
    } catch (cleanupError) {
      sessionManager.emitError(sessionId, `Cleanup failed: ${(cleanupError as Error).message}`);
    }

    // Disconnect SSH if connected
    if (sshService) {
      sshService.disconnect();
    }
  }
}
