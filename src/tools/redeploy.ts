import { SSHService } from '../services/ssh-service.js';
import { sessionManager } from '../utils/session-manager.js';

export async function redeployProject(sessionId: string): Promise<{ message: string }> {
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    throw new Error('Session not found');
  }

  if (!session.instanceName || !session.publicIp) {
    throw new Error('Deployment information not found in session');
  }

  // Update session status
  sessionManager.updateSession(sessionId, { 
    status: 'redeploying',
    lastDeployedAt: new Date()
  });

  // Start the redeployment process asynchronously
  redeployAsync(sessionId, session).catch(error => {
    sessionManager.emitError(sessionId, error.message);
  });

  return {
    message: 'Redeployment started. Track progress via SSE.',
  };
}

async function redeployAsync(sessionId: string, session: any): Promise<void> {
  let sshService: SSHService | null = null;

  try {
    sessionManager.emitProgress(sessionId, 'Starting redeployment...');

    // Initialize SSH service
    sshService = new SSHService();

    // Connect via SSH
    sessionManager.emitProgress(sessionId, 'Connecting to server...');
    await sshService.connect(session.publicIp, session.config.awsSshKey);

    // Execute redeployment commands
    sessionManager.emitProgress(sessionId, 'Pulling latest code and restarting services...');
    const redeployLogs = await sshService.executeRedeployCommands(session.instanceName);
    
    // Emit each log
    for (const log of redeployLogs) {
      sessionManager.emitLog(sessionId, log);
    }

    // Disconnect SSH
    sshService.disconnect();

    // Complete redeployment
    const redeploymentInfo = {
      instanceName: session.instanceName,
      publicIp: session.publicIp,
      dnsName: session.dnsName,
      url: `https://${session.dnsName}`,
      status: 'success',
      redeployedAt: new Date(),
    };

    sessionManager.updateSession(sessionId, { 
      status: 'success',
      lastDeployedAt: new Date()
    });

    sessionManager.emitComplete(sessionId, redeploymentInfo);
    sessionManager.emitProgress(sessionId, `Redeployment complete! Your application is available at: https://${session.dnsName}`);

  } catch (error) {
    const errorMessage = (error as Error).message;
    sessionManager.emitError(sessionId, errorMessage);

    // Disconnect SSH if connected
    if (sshService) {
      sshService.disconnect();
    }
  }
}
