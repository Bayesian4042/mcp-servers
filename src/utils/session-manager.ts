import { v4 as uuidv4 } from 'uuid';
import { DeploymentState, SSEEvent } from '../types/deployment.js';
import { EventEmitter } from 'events';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, DeploymentState> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  createSession(config: any): string {
    const sessionId = uuidv4();
    
    const deploymentState: DeploymentState = {
      sessionId,
      status: 'deploying',
      config,
      logs: [],
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, deploymentState);
    this.setSessionTimeout(sessionId);
    
    return sessionId;
  }

  getSession(sessionId: string): DeploymentState | undefined {
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId: string, updates: Partial<DeploymentState>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      this.sessions.set(sessionId, session);
      this.refreshSessionTimeout(sessionId);
    }
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }
  }

  emitEvent(sessionId: string, event: SSEEvent): void {
    this.emit(`session:${sessionId}`, event);
  }

  emitProgress(sessionId: string, message: string, data?: any): void {
    this.emitEvent(sessionId, {
      type: 'progress',
      data: { message, ...data },
      timestamp: new Date(),
    });
  }

  emitLog(sessionId: string, log: any): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.logs.push(log);
      this.updateSession(sessionId, { logs: session.logs });
    }

    this.emitEvent(sessionId, {
      type: 'log',
      data: log,
      timestamp: new Date(),
    });
  }

  emitError(sessionId: string, error: string): void {
    this.updateSession(sessionId, { status: 'failed', error });
    this.emitEvent(sessionId, {
      type: 'error',
      data: { error },
      timestamp: new Date(),
    });
  }

  emitComplete(sessionId: string, data: any): void {
    this.updateSession(sessionId, { status: 'success' });
    this.emitEvent(sessionId, {
      type: 'complete',
      data,
      timestamp: new Date(),
    });
  }

  emitStatus(sessionId: string, status: any): void {
    this.emitEvent(sessionId, {
      type: 'status',
      data: status,
      timestamp: new Date(),
    });
  }

  private setSessionTimeout(sessionId: string): void {
    const timeout = setTimeout(() => {
      this.deleteSession(sessionId);
    }, this.SESSION_TIMEOUT);
    
    this.sessionTimeouts.set(sessionId, timeout);
  }

  private refreshSessionTimeout(sessionId: string): void {
    const existingTimeout = this.sessionTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    this.setSessionTimeout(sessionId);
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
