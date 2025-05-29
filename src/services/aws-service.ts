import AWS from 'aws-sdk';
import { DeploymentConfig } from '../types/deployment.js';

export class AWSService {
  private lightsail: AWS.Lightsail;

  constructor(config: DeploymentConfig) {
    AWS.config.update({
      accessKeyId: config.awsAccessKey,
      secretAccessKey: config.awsSecretKey,
      region: config.awsRegion,
    });

    this.lightsail = new AWS.Lightsail();
  }

  async createInstance(instanceName: string, config: DeploymentConfig): Promise<void> {
    try {
      await this.lightsail.createInstances({
        instanceNames: [instanceName],
        availabilityZone: config.availabilityZone,
        blueprintId: config.blueprintId,
        bundleId: config.bundleId,
      }).promise();
    } catch (error) {
      throw new Error(`Failed to create Lightsail instance: ${(error as Error).message}`);
    }
  }

  async waitForInstanceRunning(instanceName: string, maxAttempts: number = 24): Promise<string> {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const instanceInfo = await this.lightsail.getInstance({
          instanceName: instanceName,
        }).promise();

        if (instanceInfo.instance?.state?.name === 'running' && instanceInfo.instance?.publicIpAddress) {
          return instanceInfo.instance.publicIpAddress.split(':')[0].trim();
        }

        // Wait 5 seconds between checks
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      } catch (error) {
        throw new Error(`Failed to check instance status: ${(error as Error).message}`);
      }
    }

    throw new Error('Timeout waiting for instance to be ready');
  }

  async openAllPorts(instanceName: string): Promise<void> {
    try {
      await this.lightsail.openInstancePublicPorts({
        instanceName: instanceName,
        portInfo: {
          fromPort: 0,
          toPort: 65535,
          protocol: 'ALL',
        },
      }).promise();
    } catch (error) {
      throw new Error(`Failed to open ports: ${(error as Error).message}`);
    }
  }

  async deleteInstance(instanceName: string): Promise<void> {
    try {
      await this.lightsail.deleteInstance({
        instanceName: instanceName,
      }).promise();
    } catch (error) {
      throw new Error(`Failed to delete instance: ${(error as Error).message}`);
    }
  }

  async getInstanceInfo(instanceName: string): Promise<any> {
    try {
      const result = await this.lightsail.getInstance({
        instanceName: instanceName,
      }).promise();
      return result.instance;
    } catch (error) {
      throw new Error(`Failed to get instance info: ${(error as Error).message}`);
    }
  }
}
