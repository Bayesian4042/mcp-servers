import { v4 as uuidv4 } from 'uuid';
import { DeploymentState, SSEEvent } from '../types/deployment.js';
import { EventEmitter } from 'events';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, DeploymentState> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  createSession(config: any, deploymentId?: string): string {
    const sessionId = deploymentId || uuidv4();
    
    const deploymentState: DeploymentState = {
      deploymentId: sessionId,
      status: 'deploying',
      config,
      logs: [],
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, deploymentState);
    this.setSessionTimeout(sessionId);
    
    return sessionId;
  }

  getSession(deploymentId: string): DeploymentState | undefined {
    return this.sessions.get(deploymentId);
  }

  updateSession(deploymentId: string, updates: Partial<DeploymentState>): void {
    const session = this.sessions.get(deploymentId);
    if (session) {
      Object.assign(session, updates);
      this.sessions.set(deploymentId, session);
      this.refreshSessionTimeout(deploymentId);
    }
  }

  deleteSession(deploymentId: string): void {
    this.sessions.delete(deploymentId);
    const timeout = this.sessionTimeouts.get(deploymentId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(deploymentId);
    }
  }

  emitEvent(deploymentId: string, event: SSEEvent): void {
    this.emit(`deployment:${deploymentId}`, event);
  }

  emitProgress(deploymentId: string, message: string, data?: any): void {
    this.emitEvent(deploymentId, {
      type: 'progress',
      data: { message, ...data },
      timestamp: new Date(),
    });
  }

  emitLog(deploymentId: string, log: any): void {
    const session = this.getSession(deploymentId);
    if (session) {
      session.logs.push(log);
      this.updateSession(deploymentId, { logs: session.logs });
    }

    this.emitEvent(deploymentId, {
      type: 'log',
      data: log,
      timestamp: new Date(),
    });
  }

  emitError(deploymentId: string, error: string): void {
    this.updateSession(deploymentId, { status: 'failed', error });
    this.emitEvent(deploymentId, {
      type: 'error',
      data: { error },
      timestamp: new Date(),
    });
  }

  emitComplete(deploymentId: string, data: any): void {
    this.updateSession(deploymentId, { status: 'success' });
    this.emitEvent(deploymentId, {
      type: 'complete',
      data,
      timestamp: new Date(),
    });
  }

  emitStatus(deploymentId: string, status: any): void {
    this.emitEvent(deploymentId, {
      type: 'status',
      data: status,
      timestamp: new Date(),
    });
  }

  private setSessionTimeout(deploymentId: string): void {
    const timeout = setTimeout(() => {
      this.deleteSession(deploymentId);
    }, this.SESSION_TIMEOUT);
    
    this.sessionTimeouts.set(deploymentId, timeout);
  }

  private refreshSessionTimeout(deploymentId: string): void {
    const existingTimeout = this.sessionTimeouts.get(deploymentId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    this.setSessionTimeout(deploymentId);
  }

  getAllSessions(): DeploymentState[] {
    return Array.from(this.sessions.values());
  }

  getSessionsByStatus(status: DeploymentState['status']): DeploymentState[] {
    return Array.from(this.sessions.values()).filter(session => session.status === status);
  }
}

// Global session manager instance
export const sessionManager = new SessionManager();
