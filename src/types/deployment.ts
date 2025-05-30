import { z } from 'zod';

// Zod schemas for validation
export const DeploymentConfigSchema = z.object({
  // AWS Configuration
  awsAccessKey: z.string().min(1, 'AWS Access Key is required'),
  awsSecretKey: z.string().min(1, 'AWS Secret Key is required'),
  awsRegion: z.string().min(1, 'AWS Region is required'),
  availabilityZone: z.string().min(1, 'Availability Zone is required'),
  awsSshKey: z.string().min(1, 'AWS SSH Key is required'),
  bundleId: z.string().min(1, 'Bundle ID is required'),
  blueprintId: z.string().min(1, 'Blueprint ID is required'),
  
  // GitHub Configuration
  githubRepoUrl: z.string().url('Invalid GitHub repository URL'),
  githubPat: z.string().min(1, 'GitHub Personal Access Token is required'),
  
  // Cloudflare Configuration
  cloudflareZoneId: z.string().min(1, 'Cloudflare Zone ID is required'),
  cloudflareApiToken: z.string().min(1, 'Cloudflare API Token is required'),
  
  // Project Configuration
  projectName: z.string().min(1, 'Project name is required'),
  domain: z.string().optional(),
  accountType: z.enum(['og', 'custom']).default('custom'),
  
  deploymentId: z.string().min(1, 'Deployment ID is required'),
});

export const RedeployConfigSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

export const StatusConfigSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

export const DeleteVmConfigSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

// TypeScript interfaces
export interface DeploymentConfig {
  awsAccessKey: string;
  awsSecretKey: string;
  awsRegion: string;
  availabilityZone: string;
  awsSshKey: string;
  bundleId: string;
  blueprintId: string;
  githubRepoUrl: string;
  githubPat: string;
  cloudflareZoneId: string;
  cloudflareApiToken: string;
  projectName: string;
  domain?: string;
  accountType: 'og' | 'custom';
  deploymentId: string;
}

export interface DeploymentState {
  deploymentId: string;
  status: 'deploying' | 'success' | 'failed' | 'redeploying';
  instanceName?: string;
  publicIp?: string;
  dnsName?: string;
  config: DeploymentConfig;
  logs: DeploymentLog[];
  createdAt: Date;
  lastDeployedAt?: Date;
  error?: string;
}

export interface DeploymentLog {
  timestamp: Date;
  type: 'info' | 'error' | 'command' | 'output';
  message: string;
  command?: string;
  result?: {
    stdout: string;
    stderr: string;
    code: number;
  };
}

export interface SSEEvent {
  type: 'progress' | 'log' | 'error' | 'complete' | 'status';
  data: any;
  timestamp: Date;
}

export interface VmInfo {
  instanceName: string;
  publicIp: string;
  dnsName: string;
  status: string;
  createdAt: Date;
  lastDeployedAt?: Date;
}
