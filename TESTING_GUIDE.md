# Testing Guide for MCP Lightsail Deployment Server

This guide provides step-by-step instructions for testing your MCP server.

## Prerequisites

Before testing, ensure you have:
- Node.js installed
- AWS credentials (for actual deployments)
- Cloudflare API credentials (for DNS management)
- GitHub Personal Access Token
- SSH key pair for AWS Lightsail

## Step 1: Basic Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

## Step 2: Start the Server

```bash
npm start
```

You should see:
```
🚀 MCP Lightsail Deployment Server running on port 3000
📊 Health check: http://localhost:3000/health
🔗 MCP endpoint: http://localhost:3000/mcp
📡 SSE endpoint: http://localhost:3000/sse/:sessionId
```

## Step 3: Basic Server Testing

In a new terminal, run the test script:

```bash
node test-server.js
```

This will test:
- ✅ Health endpoint
- ✅ MCP initialization
- ✅ Tools list
- ✅ Basic tool execution

Expected output:
```
🧪 Testing MCP Lightsail Deployment Server...

1. Testing health endpoint...
✅ Health check passed: { status: 'healthy', timestamp: '...', activeSessions: 0 }

2. Testing MCP initialization...
✅ MCP initialization successful

3. Testing tools list...
✅ Available tools:
   - create_vm: Create a new Lightsail VM and deploy a GitHub project with Caddy and Cloudflare DNS
   - redeploy_project: Redeploy an existing project by pulling latest code and restarting services
   - get_vm_status: Get the status of a deployed VM and its services
   - get_all_deployments: Get a list of all active deployments
   - delete_vm: Delete a VM and clean up all associated resources
   - force_delete_vm: Force delete a VM session (use when normal delete fails)

4. Testing get_all_deployments tool...
✅ Deployments list retrieved successfully
   Found 0 active deployments

🎉 All tests passed! MCP server is working correctly.
```

## Step 4: Testing with Vercel AI SDK (Recommended)

Create a test file `test-ai-integration.js`:

```javascript
// test-ai-integration.js
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Mock deployment for testing (replace with real credentials for actual deployment)
const testDeployment = {
  awsAccessKey: 'AKIA...',
  awsSecretKey: 'your-secret',
  awsRegion: 'us-east-1',
  availabilityZone: 'us-east-1a',
  awsSshKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
  bundleId: 'nano_2_0',
  blueprintId: 'ubuntu_20_04',
  githubRepoUrl: 'https://github.com/user/test-repo',
  githubPat: 'ghp_...',
  cloudflareZoneId: 'your-zone-id',
  cloudflareApiToken: 'your-token',
  projectName: 'test-app',
  accountType: 'custom'
};

async function testAIIntegration() {
  const result = await generateText({
    model: openai('gpt-4'),
    messages: [
      {
        role: 'user',
        content: 'List all current deployments'
      }
    ],
    tools: {
      get_all_deployments: {
        description: 'Get all active deployments',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
          // Call your MCP server here
          return 'No active deployments found';
        }
      }
    }
  });
  
  console.log('AI Response:', result.text);
}

testAIIntegration();
```

## Step 5: Manual API Testing

You can also test the API directly using curl or Postman:

### Health Check
```bash
curl http://localhost:3000/health
```

### MCP Initialization
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": { "tools": {} },
      "clientInfo": { "name": "test-client", "version": "1.0.0" }
    }
  }'
```

### List Tools
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

## Step 6: Testing Real Deployment (Optional)

⚠️ **Warning**: This will create actual AWS resources and incur costs!

1. **Ensure your .env file has real credentials**
2. **Test with a simple repository first**
3. **Monitor the deployment via SSE**:

```javascript
// test-real-deployment.js
const EventSource = require('eventsource');

// Start deployment (replace with actual MCP call)
const sessionId = 'your-session-id-from-deployment';

// Track progress
const eventSource = new EventSource(`http://localhost:3000/sse/${sessionId}`);

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log(`[${data.type}]`, data.data);
  
  if (data.type === 'complete') {
    console.log('🎉 Deployment complete!');
    console.log('URL:', data.data.url);
    eventSource.close();
  }
  
  if (data.type === 'error') {
    console.error('❌ Deployment failed:', data.data.error);
    eventSource.close();
  }
};
```

## Step 7: Testing Cleanup

After testing deployments, clean up resources:

```bash
# Use the delete_vm tool via MCP or API
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "delete_vm",
      "arguments": { "sessionId": "deployment-session-id" }
    }
  }'
```

## Troubleshooting

### Common Issues:

1. **Server won't start**:
   - Check if port 3000 is available
   - Verify all dependencies are installed
   - Check for TypeScript compilation errors

2. **MCP initialization fails**:
   - Ensure the server is running
   - Check the request format matches MCP protocol

3. **Tool execution fails**:
   - Verify environment variables are set
   - Check AWS/Cloudflare credentials
   - Review server logs for detailed errors

4. **SSE connection issues**:
   - Ensure the session ID is valid
   - Check if the session hasn't expired
   - Verify CORS settings if testing from browser

### Debug Mode:

Set environment variable for verbose logging:
```bash
DEBUG=* npm start
```

### Logs Location:

Server logs are output to console. For production, consider using a logging service.

## Next Steps

Once basic testing passes:
1. Integrate with your Vercel AI SDK application
2. Test with real deployment scenarios
3. Set up monitoring and alerting
4. Configure production environment variables
5. Deploy the MCP server to your infrastructure

## Security Notes

- Never commit real credentials to version control
- Use environment variables for all sensitive data
- Regularly rotate API keys and access tokens
- Monitor AWS costs when testing real deployments
- Use least-privilege IAM policies for AWS access
