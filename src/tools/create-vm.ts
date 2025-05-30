import { AWSService } from '../services/aws-service.js';
import { SSHService } from '../services/ssh-service.js';
import { DNSService } from '../services/dns-service.js';
import { EncryptionService } from '../services/encryption.js';
import { sessionManager } from '../utils/session-manager.js';
import { DeploymentConfig } from '../types/deployment.js';

export async function createVm(config: DeploymentConfig): Promise<{ deploymentId: string; message: string }> {
  const deploymentId = sessionManager.createSession(config, config.deploymentId);
  
  // Start the deployment process asynchronously
  deployVmAsync(deploymentId, config).catch(error => {
    sessionManager.emitError(deploymentId, error.message);
  });

  return {
    deploymentId,
    message: 'VM deployment started. Use the deployment ID to track progress via SSE.',
  };
}

async function deployVmAsync(deploymentId: string, config: DeploymentConfig): Promise<void> {
  const encryptionService = new EncryptionService();
  let awsService: AWSService | null = null;
  let sshService: SSHService | null = null;
  let dnsService: DNSService | null = null;

  try {
    sessionManager.emitProgress(deploymentId, 'Initializing deployment...');

    // Initialize services
    awsService = new AWSService(config);
    sshService = new SSHService();
    dnsService = new DNSService(config);

    // Use projectName if provided, otherwise extract from repository URL
    const repoName = config.githubRepoUrl
      .split('/')
      .pop()
      ?.replace(/\.git$/, '') || 'project';
    const instanceName = config.projectName || repoName;

    sessionManager.emitProgress(deploymentId, `Creating Lightsail instance: ${instanceName}`);

    // Create Lightsail instance
    await awsService.createInstance(instanceName, config);
    sessionManager.updateSession(deploymentId, { instanceName });

    sessionManager.emitProgress(deploymentId, 'Waiting for instance to be ready...');

    // Wait for instance to be running and get public IP
    const publicIp = await awsService.waitForInstanceRunning(instanceName);
    sessionManager.updateSession(deploymentId, { publicIp });

    sessionManager.emitProgress(deploymentId, `Instance ready at IP: ${publicIp}`);

    // Open all ports
    sessionManager.emitProgress(deploymentId, 'Opening firewall ports...');
    await awsService.openAllPorts(instanceName);

    // Wait a bit for the instance to fully initialize
    sessionManager.emitProgress(deploymentId, 'Waiting for instance initialization...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Connect via SSH
    sessionManager.emitProgress(deploymentId, 'Connecting via SSH...');
    await sshService.connect(publicIp, config.awsSshKey);

    // Execute setup commands
    sessionManager.emitProgress(deploymentId, 'Setting up environment and deploying application...');
    const setupLogs = await sshService.executeSetupCommands(config, instanceName);
    
    // Emit each log
    for (const log of setupLogs) {
      sessionManager.emitLog(deploymentId, log);
    }

    // Disconnect SSH
    sshService.disconnect();

    // Create DNS record
    sessionManager.emitProgress(deploymentId, 'Creating DNS record...');
    const dnsName = await dnsService.createDnsRecord(instanceName, publicIp);
    sessionManager.updateSession(deploymentId, { dnsName });

    // Complete deployment
    const deploymentInfo = {
      instanceName,
      publicIp,
      dnsName,
      url: `https://${dnsName}`,
      status: 'success',
      deploymentId: deploymentId,
      vmIpAddress: publicIp,
      projectName: instanceName,
    };

    sessionManager.emitComplete(deploymentId, deploymentInfo);
    sessionManager.emitProgress(deploymentId, `Deployment complete! Your application is available at: https://${dnsName}`);

  } catch (error) {
    const errorMessage = (error as Error).message;
    sessionManager.emitError(deploymentId, errorMessage);

    // Cleanup on error
    try {
      const session = sessionManager.getSession(deploymentId);
      if (session?.instanceName && awsService) {
        sessionManager.emitProgress(deploymentId, 'Cleaning up failed deployment...');
        await awsService.deleteInstance(session.instanceName);
        
        if (dnsService && session.dnsName) {
          await dnsService.deleteDnsRecord(session.instanceName);
        }
      }
    } catch (cleanupError) {
      sessionManager.emitError(deploymentId, `Cleanup failed: ${(cleanupError as Error).message}`);
    }

    // Disconnect SSH if connected
    if (sshService) {
      sshService.disconnect();
    }
  }
}
