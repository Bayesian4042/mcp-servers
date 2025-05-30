import { SSHService } from '../services/ssh-service.js';
import { sessionManager } from '../utils/session-manager.js';

export async function redeployProject(vmIpAddress: string, projectName: string): Promise<{ message: string }> {
  // Validate environment variables for SSH key
  const sshKey = process.env.OPENGIG_AWS_SSH_KEY;
  if (!sshKey) {
    throw new Error('Missing SSH key. Please set OPENGIG_AWS_SSH_KEY environment variable.');
  }

  // Start the redeployment process asynchronously
  redeployAsync(vmIpAddress, projectName, sshKey).catch(error => {
    console.error('Redeployment error:', error.message);
  });

  return {
    message: 'Redeployment started.',
  };
}

async function redeployAsync(vmIpAddress: string, projectName: string, sshKey: string): Promise<void> {
  let sshService: SSHService | null = null;

  try {
    console.log('Starting redeployment...');

    // Initialize SSH service
    sshService = new SSHService();

    // Connect via SSH
    console.log('Connecting to server...');
    await sshService.connect(vmIpAddress, sshKey);

    // Execute redeployment commands
    console.log('Pulling latest code and restarting services...');
    const redeployLogs = await sshService.executeRedeployCommands(projectName);
    
    // Log each command result
    for (const log of redeployLogs) {
      console.log('Redeploy log:', log);
    }

    // Disconnect SSH
    sshService.disconnect();

    console.log(`Redeployment complete for project: ${projectName} at IP: ${vmIpAddress}`);

  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error('Redeployment error:', errorMessage);

    // Disconnect SSH if connected
    if (sshService) {
      sshService.disconnect();
    }
    
    throw error;
  }
}
