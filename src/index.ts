import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createVm } from './tools/create-vm.js';
import { 
  DeploymentConfigSchema, 
} from './types/deployment.js';
import { sessionManager } from './utils/session-manager.js';
import 'dotenv/config';

const app = express();
app.use(express.json());

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

function createMCPServer(): McpServer {
  const server = new McpServer({
    name: 'lightsail-deployment-server',
    version: '1.0.0',
    capabilities: {
      tools: {}
    }
  });

  server.tool(
    'create_vm',
    'Create virtual machine for a new GitHub project',
    {
      githubRepoUrl: z.string().describe('GitHub repository URL to deploy'),
      githubPat: z.string().optional().describe('GitHub Personal Access Token (optional, reads from GITHUB_PAT env var)'),
      projectName: z.string().optional().describe('Project name for the deployment (optional, defaults to repo name)'),
      domain: z.string().optional().describe('Domain name (optional, defaults to opengig.work)')
    },
    async (args) => {
      console.log('🚀 CREATE_VM TOOL HANDLER STARTED');
      console.log('🚀 Raw args received:', args);
      
      if (!args || typeof args !== 'object') {
        throw new Error('Invalid arguments provided');
      }
      
      try {
        // Generate a unique deploymentId for this VM creation
        const deploymentId = randomUUID();
        console.log('📋 Generated deploymentId:', deploymentId);
        
        const extractProjectName = (url: string) => {
          if (!url) {
            console.error('URL is undefined or null');
            return 'project';
          }
          console.log('Extracting project name from:', url);
          const projectName = url.split('/').pop()?.replace(/\.git$/, '') || 'project';
          console.log('Project name extracted:', projectName);
          return projectName;
        };
        
        console.log('Building deployment config...');

        const argsObj = args as any;
        
        if (!argsObj.githubRepoUrl || typeof argsObj.githubRepoUrl !== 'string') {
          throw new Error('githubRepoUrl is required and must be a string');
        }
        
        const config = {
          githubRepoUrl: argsObj.githubRepoUrl,
          githubPat: argsObj.githubPat || process.env.GITHUB_PAT,
          projectName: argsObj.projectName || extractProjectName(argsObj.githubRepoUrl),
          domain: argsObj.domain || 'opengig.work',
          accountType: 'og',
          awsAccessKey: process.env.OPENGIG_AWS_ACCESS_KEY_ID,
          awsSecretKey: process.env.OPENGIG_AWS_SECRET_ACCESS_KEY,
          awsRegion: process.env.OPENGIG_AWS_REGION || 'us-east-1',
          availabilityZone: process.env.OPENGIG_AVAILABILITY_ZONE || 'us-east-1a',
          awsSshKey: process.env.OPENGIG_AWS_SSH_KEY,
          bundleId: 'medium_3_1',
          blueprintId: 'ubuntu_22_04',
          cloudflareZoneId: process.env.OPENGIG_CLOUDFLARE_ZONE_ID,
          cloudflareApiToken: process.env.OPENGIG_CLOUDFLARE_API_TOKEN,
          deploymentId: deploymentId
        };
        
        console.log('Validating environment variables...');

        if (!config.awsAccessKey || !config.awsSecretKey || !config.awsSshKey || !config.cloudflareZoneId || !config.cloudflareApiToken) {
          console.error('Missing required environment variables');
          console.error('Missing:', {
            awsAccessKey: !config.awsAccessKey,
            awsSecretKey: !config.awsSecretKey,
            awsSshKey: !config.awsSshKey,
            cloudflareZoneId: !config.cloudflareZoneId,
            cloudflareApiToken: !config.cloudflareApiToken
          });
          throw new Error('Missing required environment variables. Please set OPENGIG_AWS_ACCESS_KEY_ID, OPENGIG_AWS_SECRET_ACCESS_KEY, OPENGIG_AWS_SSH_KEY, OPENGIG_CLOUDFLARE_ZONE_ID, and OPENGIG_CLOUDFLARE_API_TOKEN');
        }
        console.log('All required environment variables are set');
        
        if (!config.githubPat) {
          console.warn('⚠️  No GitHub PAT provided. This will work for public repositories but may fail for private ones.');
        } else {
          console.log('✅ GitHub PAT provided');
        }
        
        console.log('Validating config schema...');
        const validatedConfig = DeploymentConfigSchema.parse(config);
        console.log('Config validation passed');
        
        console.log('Starting VM deployment with deploymentId:', deploymentId);
        const result = await createVm(validatedConfig);
        console.log('VM deployment initiated:', result);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                deploymentId: deploymentId,
                status: 'deploying',
                message: 'VM deployment started successfully. Use the deploymentId to track progress.',
                progressUrl: `http://localhost:${process.env.PORT || 3000}/status/${deploymentId}`,
                projectName: config.projectName,
                githubRepoUrl: config.githubRepoUrl,
                domain: config.domain,
                // Note: IP address will be available after deployment completes
                vmIpAddress: 'Will be available after deployment completes'
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

  return server;
}

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports[sessionId] = transport;
        console.log('🔗 New MCP session initialized:', sessionId);
      }
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        console.log('🔌 MCP session closed:', transport.sessionId);
        delete transports[transport.sessionId];
      }
    };

    const server = createMCPServer();

    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    console.log('session id not found!')
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

app.get('/mcp', handleSessionRequest);

app.delete('/mcp', handleSessionRequest);

app.get('/sse/:deploymentId', (req, res) => {
  const deploymentId = req.params.deploymentId;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    deploymentId,
    timestamp: new Date()
  })}\n\n`);

  // Listen for deployment events
  const eventHandler = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  sessionManager.on(`deployment:${deploymentId}`, eventHandler);

  // Clean up on client disconnect
  req.on('close', () => {
    sessionManager.removeListener(`deployment:${deploymentId}`, eventHandler);
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeSessions: Object.keys(transports).length,
    allSessions: sessionManager.getAllSessions().map(s => ({
      deploymentId: s.deploymentId,
      status: s.status,
      createdAt: s.createdAt,
      instanceName: s.instanceName,
      publicIp: s.publicIp
    }))
  });
});

app.get('/status/:deploymentId', (req, res) => {
  const deploymentId = req.params.deploymentId;
  const session = sessionManager.getSession(deploymentId);
  
  if (!session) {
    res.status(404).json({ error: 'Deployment not found' });
    return;
  }
  
  res.json({
    deploymentId: session.deploymentId,
    status: session.status,
    createdAt: session.createdAt,
    instanceName: session.instanceName,
    publicIp: session.publicIp,
    dnsName: session.dnsName,
    error: session.error,
    logs: session.logs
  });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`MCP Lightsail Deployment Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Active sessions: ${Object.keys(transports).length}`);
});
