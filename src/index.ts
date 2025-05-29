import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpTransport } from './transport.js';
import { createVm } from './tools/create-vm.js';
import { redeployProject } from './tools/redeploy.js';
import { getVmStatus, getAllDeployments } from './tools/status.js';
import { 
  DeploymentConfigSchema, 
} from './types/deployment.js';
import 'dotenv/config';
import z from 'zod';

// Create MCP server
const server = new McpServer({
  name: 'lightsail-deployment-server',
  version: '1.0.0',
});

// Tool: Create VM and deploy project (using environment credentials)
server.tool(
  'create_vm',
  {
    githubRepoUrl: z.string().describe('GitHub repository URL'),
    githubPat: z.string().optional().describe('GitHub Personal Access Token (optional, reads from GITHUB_PAT env var)'),
    projectName: z.string().optional().describe('Project name for the deployment (optional, defaults to repo name)'),
    domain: z.string().optional().describe('Domain name (optional, defaults to opengig.work)'),
  },
  async (args) => {
    try {
      console.log('🚀 CREATE_VM TOOL CALLED!');
      console.log('📥 Received args:', JSON.stringify(args, null, 2));
      
      // Extract project name from GitHub URL if not provided
      const extractProjectName = (url: string) => {
        if (!url) {
          console.error('❌ URL is undefined or null');
          return 'project';
        }
        console.log('📝 Extracting project name from:', url);
        const projectName = url.split('/').pop()?.replace(/\.git$/, '') || 'project';
        console.log('✅ Project name extracted:', projectName);
        return projectName;
      };
      
      console.log('🔧 Building deployment config...');
      const config = {
        githubRepoUrl: args.githubRepoUrl,
        githubPat: args.githubPat || process.env.GITHUB_PAT,
        projectName: args.projectName || extractProjectName(args.githubRepoUrl),
        domain: args.domain || 'opengig.work',
        accountType: 'og', // Use environment credentials
        awsAccessKey: process.env.OPENGIG_AWS_ACCESS_KEY_ID,
        awsSecretKey: process.env.OPENGIG_AWS_SECRET_ACCESS_KEY,
        awsRegion: process.env.OPENGIG_AWS_REGION || 'us-east-1',
        availabilityZone: process.env.OPENGIG_AVAILABILITY_ZONE || 'us-east-1a',
        awsSshKey: process.env.OPENGIG_AWS_SSH_KEY,
        bundleId: 'nano_3_1',
        blueprintId: 'ubuntu_22_04',
        cloudflareZoneId: process.env.OPENGIG_CLOUDFLARE_ZONE_ID,
        cloudflareApiToken: process.env.OPENGIG_CLOUDFLARE_API_TOKEN,
      };
      
      console.log('🔍 Validating environment variables...');
      if (!config.awsAccessKey || !config.awsSecretKey || !config.awsSshKey || !config.cloudflareZoneId || !config.cloudflareApiToken) {
        console.error('❌ Missing required environment variables');
        console.error('Missing:', {
          awsAccessKey: !config.awsAccessKey,
          awsSecretKey: !config.awsSecretKey,
          awsSshKey: !config.awsSshKey,
          cloudflareZoneId: !config.cloudflareZoneId,
          cloudflareApiToken: !config.cloudflareApiToken
        });
        throw new Error('Missing required environment variables. Please set OPENGIG_AWS_ACCESS_KEY_ID, OPENGIG_AWS_SECRET_ACCESS_KEY, OPENGIG_AWS_SSH_KEY, OPENGIG_CLOUDFLARE_ZONE_ID, and OPENGIG_CLOUDFLARE_API_TOKEN');
      }
      console.log('✅ All required environment variables are set');
      
      // GitHub PAT is optional for public repositories
      if (!config.githubPat) {
        console.warn('⚠️  No GitHub PAT provided. This will work for public repositories but may fail for private ones.');
      } else {
        console.log('✅ GitHub PAT provided');
      }
      
      console.log('🔄 Validating config schema...');
      const validatedConfig = DeploymentConfigSchema.parse(config);
      console.log('✅ Config validation passed');
      
      console.log('🚀 Starting VM deployment...');
      const result = await createVm(validatedConfig);
      console.log('✅ VM deployment initiated:', result);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              deploymentId: result.sessionId,
              status: 'deploying',
              message: 'Deployment started. Use the deploymentId to track progress.',
              progressUrl: `http://localhost:${process.env.PORT || 3000}/sse/${result.sessionId}`
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error('❌ CREATE_VM ERROR:', (error as Error).message);
      console.error('❌ Full error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  'redeploy_project',
  {
    deploymentId: z.string().describe('Deployment ID from the original deployment'),
  },
  async (args) => {
    try {
      const result = await redeployProject(args.deploymentId);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              deploymentId: args.deploymentId,
              status: 'redeploying',
              message: 'Redeployment started'
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  'get_deployment_status',
  {
    deploymentId: z.string().describe('Deployment ID to check status'),
  },
  async (args) => {
    try {
      const status = await getVmStatus(args.deploymentId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              deploymentId: args.deploymentId,
              ...status
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  'get_all_deployments',
  {},
  async () => {
    try {
      return await getAllDeployments();
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Delete VM (commented out for now)
/*
server.tool(
  'delete_deployment',
  {
    deploymentId: z.string().describe('Deployment ID to delete'),
  },
  async (args) => {
    try {
      const result = await deleteVm(args.deploymentId);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              deploymentId: args.deploymentId,
              status: 'deleted',
              message: 'Deployment deleted successfully'
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Force delete VM (commented out for now)
server.tool(
  'force_delete_deployment',
  {
    deploymentId: z.string().describe('Deployment ID to force delete'),
  },
  async (args) => {
    try {
      const result = await forceDeleteVm(args.deploymentId);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              deploymentId: args.deploymentId,
              status: 'force_deleted',
              message: 'Deployment force deleted'
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }
        ],
        isError: true
      };
    }
  }
);
*/

// Create HTTP transport and start server
const app = createHttpTransport(server);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 MCP Lightsail Deployment Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/sse/:sessionId`);
});
