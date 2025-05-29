import express from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { sessionManager } from './utils/session-manager.js';

const app = express();
app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

export function createHttpTransport(server: McpServer) {
  // Handle POST requests for client-to-server communication
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          // Store the transport by session ID
          transports[sessionId] = transport;
        }
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      // Connect to the MCP server
      await server.connect(transport);
    } else {
      // Invalid request
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

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for session termination
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // SSE endpoint for deployment progress
  app.get('/sse/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    // Listen for events for this session
    const eventHandler = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    sessionManager.on(`session:${sessionId}`, eventHandler);

    // Send current session status if it exists
    const session = sessionManager.getSession(sessionId);
    if (session) {
      res.write(`data: ${JSON.stringify({
        type: 'status',
        data: {
          status: session.status,
          instanceName: session.instanceName,
          publicIp: session.publicIp,
          dnsName: session.dnsName,
          logs: session.logs,
        },
        timestamp: new Date(),
      })}\n\n`);
    }

    // Handle client disconnect
    req.on('close', () => {
      sessionManager.removeListener(`session:${sessionId}`, eventHandler);
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      activeSessions: sessionManager.getAllSessions().length,
    });
  });

  return app;
}
