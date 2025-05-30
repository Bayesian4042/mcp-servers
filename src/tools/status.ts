import { sessionManager } from '../utils/session-manager.js';
import { AWSService } from '../services/aws-service.js';

export async function getVmStatus(deploymentId: string): Promise<any> {
  const session = sessionManager.getSession(deploymentId);
  
  if (!session) {
    throw new Error('Deployment not found');
  }

  try {
    let instanceInfo = null;
    
    if (session.instanceName && session.config) {
      const awsService = new AWSService(session.config);
      instanceInfo = await awsService.getInstanceInfo(session.instanceName);
    }

    const status = {
      deploymentId: session.deploymentId,
      status: session.status,
      instanceName: session.instanceName,
      publicIp: session.publicIp,
      dnsName: session.dnsName,
      url: session.dnsName ? `https://${session.dnsName}` : null,
      createdAt: session.createdAt,
      lastDeployedAt: session.lastDeployedAt,
      error: session.error,
      logs: session.logs,
      awsInstanceState: instanceInfo?.state?.name || 'unknown',
      awsInstanceInfo: instanceInfo ? {
        name: instanceInfo.name,
        state: instanceInfo.state?.name,
        publicIpAddress: instanceInfo.publicIpAddress,
        privateIpAddress: instanceInfo.privateIpAddress,
        blueprintName: instanceInfo.blueprintName,
        bundleName: instanceInfo.bundleName,
        location: instanceInfo.location?.availabilityZone,
      } : null,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(status, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting status: ${(error as Error).message}`
        }
      ]
    };
  }
}

export async function getAllDeployments(): Promise<any> {
  try {
    const sessions = sessionManager.getAllSessions();
    
    const deployments = sessions.map(session => ({
      deploymentId: session.deploymentId,
      status: session.status,
      instanceName: session.instanceName,
      publicIp: session.publicIp,
      dnsName: session.dnsName,
      url: session.dnsName ? `https://${session.dnsName}` : null,
      createdAt: session.createdAt,
      lastDeployedAt: session.lastDeployedAt,
      error: session.error,
      projectName: session.config.projectName,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(deployments, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting deployments: ${(error as Error).message}`
        }
      ]
    };
  }
}
