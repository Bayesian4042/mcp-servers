import axios from 'axios';
import { DeploymentConfig } from '../types/deployment.js';

export class DNSService {
  private config: DeploymentConfig;

  constructor(config: DeploymentConfig) {
    this.config = config;
  }

  async createDnsRecord(instanceName: string, publicIp: string): Promise<string> {
    try {
      const domain = this.config.domain || 'opengig.work';
      const recordName = `${instanceName}.${domain}`;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${this.config.cloudflareZoneId}/dns_records`,
        {
          comment: 'MCP Server deployment record',
          name: recordName,
          proxied: false,
          ttl: 86400,
          content: publicIp,
          type: 'A',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.cloudflareApiToken}`,
          },
        }
      );

      if (response.data.success) {
        return response.data.result.name;
      } else {
        throw new Error(`Cloudflare API error: ${JSON.stringify(response.data.errors)}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to create DNS record: ${error.response?.data?.errors?.[0]?.message || error.message}`);
      }
      throw new Error(`Failed to create DNS record: ${(error as Error).message}`);
    }
  }

  async deleteDnsRecord(instanceName: string): Promise<void> {
    try {
      const domain = this.config.domain || 'opengig.work';
      const recordName = `${instanceName}.${domain}`;

      // First, get the record ID
      const listResponse = await axios.get(
        `https://api.cloudflare.com/client/v4/zones/${this.config.cloudflareZoneId}/dns_records?name=${recordName}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.cloudflareApiToken}`,
          },
        }
      );

      if (listResponse.data.success && listResponse.data.result.length > 0) {
        const recordId = listResponse.data.result[0].id;

        // Delete the record
        const deleteResponse = await axios.delete(
          `https://api.cloudflare.com/client/v4/zones/${this.config.cloudflareZoneId}/dns_records/${recordId}`,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.config.cloudflareApiToken}`,
            },
          }
        );

        if (!deleteResponse.data.success) {
          throw new Error(`Cloudflare API error: ${JSON.stringify(deleteResponse.data.errors)}`);
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to delete DNS record: ${error.response?.data?.errors?.[0]?.message || error.message}`);
      }
      throw new Error(`Failed to delete DNS record: ${(error as Error).message}`);
    }
  }

  async updateDnsRecord(instanceName: string, newPublicIp: string): Promise<string> {
    try {
      // Delete existing record and create new one
      await this.deleteDnsRecord(instanceName);
      return await this.createDnsRecord(instanceName, newPublicIp);
    } catch (error) {
      throw new Error(`Failed to update DNS record: ${(error as Error).message}`);
    }
  }
}
