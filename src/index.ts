import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpTransport } from './transport.js';
import { createVm } from './tools/create-vm.js';
import { redeployProject } from './tools/redeploy.js';
import { getVmStatus, getAllDeployments } from './tools/status.js';
import { deleteVm, forceDeleteVm } from './tools/delete-vm.js';
import { 
  DeploymentConfigSchema, 
  RedeployConfigSchema, 
  StatusConfigSchema, 
  DeleteVmConfigSchema 
} from './types/deployment.js';
import 'dotenv/config';

// Create MCP server
const server = new McpServer({
  name: 'lightsail-deployment-server',
  version: '1.0.0',
});

// Tool: Create VM and deploy project
server.tool(
  'create_vm',
  {
    description: 'Create a new Lightsail VM and deploy a GitHub project with Caddy and Cloudflare DNS',
    properties: {
      awsAccessKey: { type: 'string', description: 'AWS Access Key ID' },
      awsSecretKey: { type: 'string', description: 'AWS Secret Access Key' },
      awsRegion: { type: 'string', description: 'AWS Region (e.g., us-east-1)' },
      availabilityZone: { type: 'string', description: 'AWS Availability Zone (e.g., us-east-1a)' },
      awsSshKey: { type: 'string', description: 'AWS SSH Private Key (PEM format)' },
      bundleId: { type: 'string', description: 'Lightsail bundle ID (e.g., nano_2_0)' },
      blueprintId: { type: 'string', description: 'Lightsail blueprint ID (e.g., ubuntu_20_04)' },
      githubRepoUrl: { type: 'string', description: 'GitHub repository URL' },
      githubPat: { type: 'string', description: 'GitHub Personal Access Token' },
      cloudflareZoneId: { type: 'string', description: 'Cloudflare Zone ID' },
      cloudflareApiToken: { type: 'string', description: 'Cloudflare API Token' },
      projectName: { type: 'string', description: 'Project name for the deployment' },
      domain: { type: 'string', description: 'Domain name (optional, defaults to opengig.work)' },
      accountType: { type: 'string', enum: ['og', 'custom'], description: 'Account type' },
    },
    required: [
      'awsAccessKey', 'awsSecretKey', 'awsRegion', 'availabilityZone', 'awsSshKey',
      'bundleId', 'blueprintId', 'githubRepoUrl', 'githubPat', 
      'cloudflareZoneId', 'cloudflareApiToken', 'projectName'
    ],
  },
  async (args) => {
    try {
      const config = DeploymentConfigSchema.parse(args);
      const result = await createVm(config);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
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

// Tool: Redeploy project
server.tool(
  'redeploy_project',
  {
    description: 'Redeploy an existing project by pulling latest code and restarting services',
    properties: {
      sessionId: { type: 'string', description: 'Session ID from the original deployment' },
    },
    required: ['sessionId'],
  },
  async (args) => {
    try {
      const { sessionId } = RedeployConfigSchema.parse(args);
      const result = await redeployProject(sessionId);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
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

// Tool: Get VM status
server.tool(
  'get_vm_status',
  {
    description: 'Get the status of a deployed VM and its services',
    properties: {
      sessionId: { type: 'string', description: 'Session ID from the deployment' },
    },
    required: ['sessionId'],
  },
  async (args) => {
    try {
      const { sessionId } = StatusConfigSchema.parse(args);
      return await getVmStatus(sessionId);
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

// Tool: Get all deployments
server.tool(
  'get_all_deployments',
  {
    description: 'Get a list of all active deployments',
    properties: {},
    required: [],
  },
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

// Tool: Delete VM
server.tool(
  'delete_vm',
  {
    description: 'Delete a VM and clean up all associated resources',
    properties: {
      sessionId: { type: 'string', description: 'Session ID from the deployment' },
    },
    required: ['sessionId'],
  },
  async (args) => {
    try {
      const { sessionId } = DeleteVmConfigSchema.parse(args);
      const result = await deleteVm(sessionId);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
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

// Tool: Force delete VM
server.tool(
  'force_delete_vm',
  {
    description: 'Force delete a VM session (use when normal delete fails)',
    properties: {
      sessionId: { type: 'string', description: 'Session ID from the deployment' },
    },
    required: ['sessionId'],
  },
  async (args) => {
    try {
      const { sessionId } = DeleteVmConfigSchema.parse(args);
      const result = await forceDeleteVm(sessionId);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
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

// Create HTTP transport and start server
const app = createHttpTransport(server);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 MCP Lightsail Deployment Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/sse/:sessionId`);
});
