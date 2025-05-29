import { AWSService } from '../services/aws-service.js';
import { DNSService } from '../services/dns-service.js';
import { sessionManager } from '../utils/session-manager.js';

export async function deleteVm(sessionId: string): Promise<{ message: string }> {
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    throw new Error('Session not found');
  }

  if (!session.instanceName) {
    throw new Error('No instance found to delete');
  }

  // Start the deletion process asynchronously
  deleteVmAsync(sessionId, session).catch(error => {
    sessionManager.emitError(sessionId, error.message);
  });

  return {
    message: 'VM deletion started. Track progress via SSE.',
  };
}

async function deleteVmAsync(sessionId: string, session: any): Promise<void> {
  let awsService: AWSService | null = null;
  let dnsService: DNSService | null = null;

  try {
    sessionManager.emitProgress(sessionId, 'Starting VM deletion...');

    // Initialize services
    awsService = new AWSService(session.config);
    dnsService = new DNSService(session.config);

    // Delete DNS record first
    if (session.dnsName) {
      sessionManager.emitProgress(sessionId, 'Deleting DNS record...');
      try {
        await dnsService.deleteDnsRecord(session.instanceName);
        sessionManager.emitProgress(sessionId, 'DNS record deleted successfully');
      } catch (error) {
        sessionManager.emitProgress(sessionId, `Warning: Failed to delete DNS record: ${(error as Error).message}`);
      }
    }

    // Delete Lightsail instance
    sessionManager.emitProgress(sessionId, 'Deleting Lightsail instance...');
    await awsService.deleteInstance(session.instanceName);
    sessionManager.emitProgress(sessionId, 'Lightsail instance deleted successfully');

    // Complete deletion
    const deletionInfo = {
      instanceName: session.instanceName,
      deletedAt: new Date(),
      status: 'deleted',
    };

    sessionManager.emitComplete(sessionId, deletionInfo);
    sessionManager.emitProgress(sessionId, `VM deletion complete! Instance ${session.instanceName} has been removed.`);

    // Clean up session after successful deletion
    setTimeout(() => {
      sessionManager.deleteSession(sessionId);
    }, 5000); // Give some time for the client to receive the completion event

  } catch (error) {
    const errorMessage = (error as Error).message;
    sessionManager.emitError(sessionId, errorMessage);
  }
}

export async function forceDeleteVm(sessionId: string): Promise<{ message: string }> {
  // Force delete removes the session regardless of AWS cleanup success
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    throw new Error('Session not found');
  }

  try {
    if (session.instanceName && session.config) {
      const awsService = new AWSService(session.config);
      const dnsService = new DNSService(session.config);

      // Try to cleanup AWS resources (but don't fail if it doesn't work)
      try {
        await awsService.deleteInstance(session.instanceName);
      } catch (error) {
        console.warn(`Failed to delete AWS instance: ${(error as Error).message}`);
      }

      try {
        await dnsService.deleteDnsRecord(session.instanceName);
      } catch (error) {
        console.warn(`Failed to delete DNS record: ${(error as Error).message}`);
      }
    }

    // Always remove the session
    sessionManager.deleteSession(sessionId);

    return {
      message: 'Session forcefully deleted. AWS resources may need manual cleanup.',
    };
  } catch (error) {
    // Even if cleanup fails, remove the session
    sessionManager.deleteSession(sessionId);
    throw error;
  }
}
