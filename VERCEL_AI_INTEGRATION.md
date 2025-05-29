# Vercel AI SDK Integration Guide

This guide shows how to integrate the MCP Lightsail Deployment Server with the Vercel AI SDK for seamless AI-powered deployments.

## Installation

```bash
npm install @modelcontextprotocol/sdk ai @ai-sdk/openai
```

## Setup

### 1. Configure MCP Client

```typescript
import { createMcpClient } from '@modelcontextprotocol/sdk/client/mcp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Create MCP client
const transport = new StdioClientTransport({
  command: 'node',
  args: ['path/to/mcp-lightsail-server/dist/index.js']
});

const mcpClient = createMcpClient({ transport });
await mcpClient.connect();
```

### 2. Define Tools for Vercel AI SDK

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const deploymentTools = {
  create_vm: {
    description: 'Create a new Lightsail VM and deploy a GitHub project with Caddy and Cloudflare DNS',
    parameters: {
      type: 'object',
      properties: {
        awsAccessKey: { 
          type: 'string', 
          description: 'AWS Access Key ID' 
        },
        awsSecretKey: { 
          type: 'string', 
          description: 'AWS Secret Access Key' 
        },
        awsRegion: { 
          type: 'string', 
          description: 'AWS Region (e.g., us-east-1)' 
        },
        availabilityZone: { 
          type: 'string', 
          description: 'AWS Availability Zone (e.g., us-east-1a)' 
        },
        awsSshKey: { 
          type: 'string', 
          description: 'AWS SSH Private Key (PEM format)' 
        },
        bundleId: { 
          type: 'string', 
          description: 'Lightsail bundle ID (e.g., nano_2_0)' 
        },
        blueprintId: { 
          type: 'string', 
          description: 'Lightsail blueprint ID (e.g., ubuntu_20_04)' 
        },
        githubRepoUrl: { 
          type: 'string', 
          description: 'GitHub repository URL' 
        },
        githubPat: { 
          type: 'string', 
          description: 'GitHub Personal Access Token' 
        },
        cloudflareZoneId: { 
          type: 'string', 
          description: 'Cloudflare Zone ID' 
        },
        cloudflareApiToken: { 
          type: 'string', 
          description: 'Cloudflare API Token' 
        },
        projectName: { 
          type: 'string', 
          description: 'Project name for the deployment' 
        },
        domain: { 
          type: 'string', 
          description: 'Domain name (optional, defaults to opengig.work)' 
        },
        accountType: { 
          type: 'string', 
          enum: ['og', 'custom'],
          description: 'Account type' 
        }
      },
      required: [
        'awsAccessKey', 'awsSecretKey', 'awsRegion', 'availabilityZone',
        'awsSshKey', 'bundleId', 'blueprintId', 'githubRepoUrl',
        'githubPat', 'cloudflareZoneId', 'cloudflareApiToken', 'projectName'
      ]
    },
    execute: async (params) => {
      const result = await mcpClient.callTool('create_vm', params);
      return JSON.stringify(result, null, 2);
    }
  },

  redeploy_project: {
    description: 'Redeploy an existing project by pulling latest code and restarting services',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { 
          type: 'string', 
          description: 'Session ID from the original deployment' 
        }
      },
      required: ['sessionId']
    },
    execute: async (params) => {
      const result = await mcpClient.callTool('redeploy_project', params);
      return JSON.stringify(result, null, 2);
    }
  },

  get_vm_status: {
    description: 'Get the status of a deployed VM and its services',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { 
          type: 'string', 
          description: 'Session ID from the deployment' 
        }
      },
      required: ['sessionId']
    },
    execute: async (params) => {
      const result = await mcpClient.callTool('get_vm_status', params);
      return JSON.stringify(result, null, 2);
    }
  },

  get_all_deployments: {
    description: 'Get a list of all active deployments',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async () => {
      const result = await mcpClient.callTool('get_all_deployments', {});
      return JSON.stringify(result, null, 2);
    }
  },

  delete_vm: {
    description: 'Delete a VM and clean up all associated resources',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { 
          type: 'string', 
          description: 'Session ID from the deployment' 
        }
      },
      required: ['sessionId']
    },
    execute: async (params) => {
      const result = await mcpClient.callTool('delete_vm', params);
      return JSON.stringify(result, null, 2);
    }
  }
};
```

### 3. Use with Vercel AI SDK

```typescript
async function deployWithAI(userMessage: string, userConfig: any) {
  const result = await generateText({
    model: openai('gpt-4'),
    messages: [
      {
        role: 'system',
        content: `You are a deployment assistant. You can help users deploy their applications to AWS Lightsail with automatic DNS configuration. 
        
        When deploying, you need these required parameters:
        - AWS credentials (accessKey, secretKey, region, availabilityZone, sshKey)
        - Lightsail configuration (bundleId, blueprintId)
        - GitHub repository details (repoUrl, personalAccessToken)
        - Cloudflare DNS settings (zoneId, apiToken)
        - Project details (name, optional domain)
        
        Always ask for missing required information before proceeding with deployment.`
      },
      {
        role: 'user',
        content: userMessage
      }
    ],
    tools: deploymentTools,
    maxToolRoundtrips: 3
  });

  return result;
}
```

## Real-time Progress Tracking

```typescript
// After deployment starts, track progress with SSE
function trackDeploymentProgress(sessionId: string) {
  const eventSource = new EventSource(`http://localhost:3000/sse/${sessionId}`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch(data.type) {
      case 'connected':
        console.log('Connected to deployment stream');
        break;
        
      case 'progress':
        console.log('Progress:', data.data.message);
        // Update your UI with progress
        updateProgressUI(data.data.message);
        break;
        
      case 'log':
        console.log('Log:', data.data);
        // Show command execution logs
        addLogToUI(data.data);
        break;
        
      case 'error':
        console.error('Deployment error:', data.data.error);
        showErrorUI(data.data.error);
        eventSource.close();
        break;
        
      case 'complete':
        console.log('Deployment complete!');
        console.log('URL:', data.data.url);
        showSuccessUI(data.data);
        eventSource.close();
        break;
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    eventSource.close();
  };

  return eventSource;
}
```

## Complete Example

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

async function handleDeploymentRequest() {
  const result = await generateText({
    model: openai('gpt-4'),
    messages: [
      {
        role: 'user',
        content: `Deploy my React app from https://github.com/user/my-react-app to AWS Lightsail. 
        Use these credentials:
        - AWS Access Key: AKIA...
        - AWS Secret: secret...
        - Region: us-east-1
        - Zone: us-east-1a
        - SSH Key: [my-ssh-key]
        - Bundle: nano_2_0
        - Blueprint: ubuntu_20_04
        - GitHub PAT: ghp_...
        - Cloudflare Zone: zone123
        - Cloudflare Token: token123
        - Project: my-react-app`
      }
    ],
    tools: deploymentTools
  });

  // Extract session ID from the result
  const deploymentResponse = JSON.parse(result.toolResults[0].result);
  const sessionId = deploymentResponse.sessionId;

  // Start tracking progress
  const eventSource = trackDeploymentProgress(sessionId);

  return {
    result,
    sessionId,
    eventSource
  };
}
```

## Environment Setup

Make sure your environment variables are properly configured:

```env
# .env
PORT=3000
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Optional: Default configurations for 'og' account type
OPENGIG_AWS_ACCESS_KEY_ID=your-default-aws-key
OPENGIG_AWS_SECRET_ACCESS_KEY=your-default-aws-secret
OPENGIG_AWS_REGION=us-east-1
OPENGIG_AVAILABILITY_ZONE=us-east-1a
OPENGIG_AWS_SSH_KEY=your-default-ssh-key
OPENGIG_CLOUDFLARE_ZONE_ID=your-default-zone-id
OPENGIG_CLOUDFLARE_API_TOKEN=your-default-api-token
```

## Error Handling

```typescript
try {
  const result = await generateText({
    model: openai('gpt-4'),
    messages: [{ role: 'user', content: userMessage }],
    tools: deploymentTools
  });
  
  return result;
} catch (error) {
  console.error('Deployment failed:', error);
  
  if (error.message.includes('Session not found')) {
    return 'The deployment session has expired. Please start a new deployment.';
  }
  
  if (error.message.includes('AWS')) {
    return 'AWS configuration error. Please check your credentials and try again.';
  }
  
  return 'Deployment failed. Please check the logs and try again.';
}
```

This integration allows you to create powerful AI-driven deployment workflows where users can simply describe what they want to deploy, and the AI will handle the technical details using the MCP server.
