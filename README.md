# MCP Lightsail Deployment Server

A Model Context Protocol (MCP) server for deploying projects to AWS Lightsail with automatic DNS configuration via Cloudflare and real-time progress tracking through Server-Sent Events (SSE).

## Features

- 🚀 **Automated VM Creation**: Create AWS Lightsail instances with custom configurations
- 📦 **GitHub Integration**: Clone and deploy projects directly from GitHub repositories
- 🌐 **DNS Management**: Automatic Cloudflare DNS record creation and management
- 🔄 **Redeployment**: Pull latest code and restart services with a single command
- 📡 **Real-time Updates**: Server-Sent Events (SSE) for live deployment progress tracking
- 🔒 **Security**: Encrypted storage of sensitive credentials
- 🛠️ **Docker Support**: Automatic Docker Compose deployment
- 🌍 **Caddy Integration**: Automatic reverse proxy and SSL certificate management

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Client    │    │   MCP Server    │    │  AWS Lightsail  │
│   (LLM/App)     │◄──►│  (This Server)  │◄──►│   Instance      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Cloudflare    │
                       │   DNS Records   │
                       └─────────────────┘
```

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd mcp-lightsail-server
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

5. **Start the server**:
   ```bash
   npm start
   ```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Optional: Default AWS Configuration (for 'og' account type)
OPENGIG_AWS_ACCESS_KEY_ID=your-aws-access-key
OPENGIG_AWS_SECRET_ACCESS_KEY=your-aws-secret-key
OPENGIG_AWS_REGION=us-east-1
OPENGIG_AVAILABILITY_ZONE=us-east-1a
OPENGIG_AWS_SSH_KEY=your-ssh-private-key
OPENGIG_CLOUDFLARE_ZONE_ID=your-cloudflare-zone-id
OPENGIG_CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
```

## MCP Tools

### 1. `create_vm`
Creates a new Lightsail VM and deploys a GitHub project.

**Parameters:**
- `awsAccessKey` (string): AWS Access Key ID
- `awsSecretKey` (string): AWS Secret Access Key
- `awsRegion` (string): AWS Region (e.g., us-east-1)
- `availabilityZone` (string): AWS Availability Zone (e.g., us-east-1a)
- `awsSshKey` (string): AWS SSH Private Key (PEM format)
- `bundleId` (string): Lightsail bundle ID (e.g., nano_2_0)
- `blueprintId` (string): Lightsail blueprint ID (e.g., ubuntu_20_04)
- `githubRepoUrl` (string): GitHub repository URL
- `githubPat` (string): GitHub Personal Access Token
- `cloudflareZoneId` (string): Cloudflare Zone ID
- `cloudflareApiToken` (string): Cloudflare API Token
- `projectName` (string): Project name for the deployment
- `domain` (string, optional): Domain name (defaults to opengig.work)
- `accountType` (string): 'og' or 'custom'

**Returns:**
```json
{
  "sessionId": "uuid-session-id",
  "message": "VM deployment started. Use the session ID to track progress via SSE."
}
```

### 2. `redeploy_project`
Redeploys an existing project by pulling the latest code.

**Parameters:**
- `sessionId` (string): Session ID from the original deployment

### 3. `get_vm_status`
Gets the current status of a deployed VM.

**Parameters:**
- `sessionId` (string): Session ID from the deployment

### 4. `get_all_deployments`
Lists all active deployments.

### 5. `delete_vm`
Deletes a VM and cleans up all associated resources.

**Parameters:**
- `sessionId` (string): Session ID from the deployment

### 6. `force_delete_vm`
Force deletes a VM session (use when normal delete fails).

**Parameters:**
- `sessionId` (string): Session ID from the deployment

## Real-time Progress Tracking

Connect to the SSE endpoint to receive real-time updates:

```javascript
const eventSource = new EventSource(`http://localhost:3000/sse/${sessionId}`);

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
  
  switch(data.type) {
    case 'progress':
      console.log('Progress:', data.data.message);
      break;
    case 'log':
      console.log('Log:', data.data);
      break;
    case 'error':
      console.error('Error:', data.data.error);
      break;
    case 'complete':
      console.log('Complete:', data.data);
      break;
  }
};
```

## Event Types

- **`progress`**: Deployment progress updates
- **`log`**: Command execution logs
- **`error`**: Error messages
- **`complete`**: Deployment completion
- **`status`**: Current deployment status

## API Endpoints

- `POST /mcp` - MCP protocol endpoint
- `GET /mcp` - MCP SSE notifications
- `DELETE /mcp` - MCP session termination
- `GET /sse/:sessionId` - Real-time deployment progress
- `GET /health` - Health check endpoint

## Usage Example

```javascript
// Using the MCP client
const result = await mcpClient.callTool('create_vm', {
  awsAccessKey: 'AKIA...',
  awsSecretKey: 'secret...',
  awsRegion: 'us-east-1',
  availabilityZone: 'us-east-1a',
  awsSshKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
  bundleId: 'nano_2_0',
  blueprintId: 'ubuntu_20_04',
  githubRepoUrl: 'https://github.com/user/repo',
  githubPat: 'ghp_...',
  cloudflareZoneId: 'zone-id',
  cloudflareApiToken: 'token',
  projectName: 'my-app',
  accountType: 'custom'
});

// Track progress
const sessionId = result.sessionId;
const eventSource = new EventSource(`http://localhost:3000/sse/${sessionId}`);
```

## Deployment Process

1. **VM Creation**: Creates a Lightsail instance with specified configuration
2. **Network Setup**: Opens all ports for the instance
3. **SSH Connection**: Connects to the instance via SSH
4. **Environment Setup**: Installs Docker, Caddy, and other dependencies
5. **Repository Clone**: Clones the GitHub repository
6. **Caddy Configuration**: Sets up reverse proxy and SSL
7. **Application Deployment**: Runs `docker compose up -d`
8. **DNS Configuration**: Creates Cloudflare DNS A record
9. **Completion**: Reports success with access URL

## Security Considerations

- All sensitive data (AWS keys, SSH keys, GitHub tokens) are encrypted at rest
- Use environment variables for default configurations
- Implement proper access controls for the MCP server
- Regularly rotate API tokens and access keys

## Troubleshooting

### Common Issues

1. **SSH Connection Timeout**: Ensure the SSH key is correct and the instance is fully initialized
2. **DNS Creation Failed**: Verify Cloudflare API token has DNS edit permissions
3. **Docker Compose Errors**: Check that the repository contains a valid `docker-compose.yml`
4. **Port Access Issues**: Ensure Lightsail firewall rules allow necessary ports

### Logs

Check deployment logs via the `get_vm_status` tool or SSE events for detailed error information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
        const result = await mcpClient.callTool('create_vm', params);
        return result;
      }
    },
    redeploy_project: {
      description: 'Redeploy an existing project',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' }
        },
        required: ['sessionId']
      },
      execute: async (params) => {
        const result = await mcpClient.callTool('redeploy_project', params);
        return result;
      }
    },
    get_vm_status: {
      description: 'Get VM deployment status',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' }
        },
        required: ['sessionId']
      },
      execute: async (params) => {
        const result = await mcpClient.callTool('get_vm_status', params);
        return result;
      }
    }
  }
});
```

### 4. Real-time Progress Tracking

```typescript
// After deployment starts, track progress
const sessionId = deploymentResult.sessionId;

// Set up SSE connection for real-time updates
const eventSource = new EventSource(`http://localhost:3000/sse/${sessionId}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // Update your UI with deployment progress
  switch(data.type) {
    case 'progress':
      console.log('Progress:', data.data.message);
      break;
    case 'complete':
      console.log('Deployment complete:', data.data.url);
      eventSource.close();
      break;
    case 'error':
      console.error('Deployment error:', data.data.error);
      eventSource.close();
      break;
  }
};
```

## Usage Example

```typescript
// Direct MCP client usage
const result = await mcpClient.callTool('create_vm', {
  awsAccessKey: 'AKIA...',
  awsSecretKey: 'secret...',
  awsRegion: 'us-east-1',
  availabilityZone: 'us-east-1a',
  awsSshKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
  bundleId: 'nano_2_0',
  blueprintId: 'ubuntu_20_04',
  githubRepoUrl: 'https://github.com/user/repo',
  githubPat: 'ghp_...',
  cloudflareZoneId: 'zone-id',
  cloudflareApiToken: 'token',
  projectName: 'my-app',
  accountType: 'custom'
});

// Track progress
const sessionId = result.sessionId;
const eventSource = new EventSource(`http://localhost:3000/sse/${sessionId}`);
```

## Deployment Process

1. **VM Creation**: Creates a Lightsail instance with specified configuration
2. **Network Setup**: Opens all ports for the instance
3. **SSH Connection**: Connects to the instance via SSH
4. **Environment Setup**: Installs Docker, Caddy, and other dependencies
5. **Repository Clone**: Clones the GitHub repository
6. **Caddy Configuration**: Sets up reverse proxy and SSL
7. **Application Deployment**: Runs `docker compose up -d`
8. **DNS Configuration**: Creates Cloudflare DNS A record
9. **Completion**: Reports success with access URL

## Security Considerations

- All sensitive data (AWS keys, SSH keys, GitHub tokens) are encrypted at rest
- Use environment variables for default configurations
- Implement proper access controls for the MCP server
- Regularly rotate API tokens and access keys

## Troubleshooting

### Common Issues

1. **SSH Connection Timeout**: Ensure the SSH key is correct and the instance is fully initialized
2. **DNS Creation Failed**: Verify Cloudflare API token has DNS edit permissions
3. **Docker Compose Errors**: Check that the repository contains a valid `docker-compose.yml`
4. **Port Access Issues**: Ensure Lightsail firewall rules allow necessary ports

### Logs

Check deployment logs via the `get_vm_status` tool or SSE events for detailed error information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
