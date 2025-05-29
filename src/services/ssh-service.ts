import { NodeSSH } from 'node-ssh';
import { DeploymentConfig, DeploymentLog } from '../types/deployment.js';

export class SSHService {
  private ssh: NodeSSH;
  private connected: boolean = false;

  constructor() {
    this.ssh = new NodeSSH();
  }

  async connect(publicIp: string, sshKey: string): Promise<void> {
    try {
      // Process the SSH key to handle different formats
      let processedKey = sshKey;
      
      // If the key has \n characters, replace them with actual newlines
      if (processedKey.includes('\\n')) {
        processedKey = processedKey.replace(/\\n/g, '\n');
      }
      
      // Remove any extra quotes that might be present
      processedKey = processedKey.replace(/^"|"$/g, '');
      
      // Ensure the key starts and ends with proper markers
      if (!processedKey.includes('-----BEGIN')) {
        throw new Error('SSH key must be in PEM format starting with -----BEGIN');
      }
      
      console.log('🔑 SSH Key format check:');
      console.log('- Starts with BEGIN:', processedKey.includes('-----BEGIN'));
      console.log('- Ends with END:', processedKey.includes('-----END'));
      console.log('- Has newlines:', processedKey.includes('\n'));
      console.log('- Key length:', processedKey.length);
      
      await this.ssh.connect({
        host: publicIp,
        username: 'ubuntu',
        privateKey: processedKey,
        readyTimeout: 100000,
      });
      this.connected = true;
      console.log('✅ SSH connection successful!');
    } catch (error) {
      console.error('❌ SSH connection error:', (error as Error).message);
      throw new Error(`SSH connection failed: ${(error as Error).message}`);
    }
  }

  async executeCommand(command: string): Promise<DeploymentLog> {
    if (!this.connected) {
      throw new Error('SSH not connected');
    }

    try {
      const result = await this.ssh.execCommand(command);
      
      return {
        timestamp: new Date(),
        type: 'command',
        message: `Executed: ${command}`,
        command,
        result: {
          stdout: result.stdout,
          stderr: result.stderr,
          code: result.code || 0,
        },
      };
    } catch (error) {
      return {
        timestamp: new Date(),
        type: 'error',
        message: `Command failed: ${(error as Error).message}`,
        command,
        result: {
          stdout: '',
          stderr: (error as Error).message,
          code: 1,
        },
      };
    }
  }

  async executeSetupCommands(config: DeploymentConfig, instanceName: string): Promise<DeploymentLog[]> {
    const logs: DeploymentLog[] = [];
    
    // Extract repository information
    const repoUrl = config.githubRepoUrl;
    const repoName = repoUrl.split('/').pop()?.replace(/\.git$/, '') || '';
    const owner = repoUrl.split('/')[3] || '';

    const commands = [
      // Initial setup and repository cloning
      `export VM_INSTANCE_NAME=${instanceName} && \
       export REPO="$VM_INSTANCE_NAME" && \
       mkdir -p "$HOME/$REPO" && \
       sudo hostnamectl set-hostname $VM_INSTANCE_NAME && \
       git clone "https://x-access-token:${config.githubPat}@github.com/${owner}/${repoName}.git" "$HOME/$REPO"`,

      // Add package repositories
      `curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && \
       curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list && \
       sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && \
       sudo chmod a+r /etc/apt/keyrings/docker.asc && \
       echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
       sudo tee /etc/apt/sources.list.d/docker.list > /dev/null`,

      // Update and install packages
      `sudo apt-get update && \
       sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin caddy && \
       sudo usermod -aG docker $USER && \
       sudo systemctl enable docker && \
       sudo systemctl restart docker`,

      // Configure Caddy
      `sudo mkdir -p /etc/caddy && \
       sudo tee /etc/caddy/Caddyfile > /dev/null <<EOL
${instanceName}.${config.domain || 'opengig.work'} {
    reverse_proxy localhost:3000
}
EOL
       sudo systemctl restart caddy`,

      // Start the application
      `cd "$HOME/$REPO" && \
       sudo -E docker compose up -d`,
    ];

    for (const command of commands) {
      const log = await this.executeCommand(command);
      logs.push(log);
      
      if (log.result?.code !== 0) {
        logs.push({
          timestamp: new Date(),
          type: 'error',
          message: `Command failed with exit code ${log.result?.code}: ${log.result?.stderr}`,
        });
      }
    }

    return logs;
  }

  async executeRedeployCommands(instanceName: string): Promise<DeploymentLog[]> {
    const logs: DeploymentLog[] = [];

    const commands = [
      `cd "$HOME/${instanceName}" && \
       git pull && \
       sudo docker compose down && \
       sudo docker compose up -d --build`,
    ];

    for (const command of commands) {
      const log = await this.executeCommand(command);
      logs.push(log);
    }

    return logs;
  }

  disconnect(): void {
    if (this.connected) {
      this.ssh.dispose();
      this.connected = false;
    }
  }
}
