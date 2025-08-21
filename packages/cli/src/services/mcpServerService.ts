import express, { Application, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { QuestionManager } from './questionManager.js';

export class McpServerService {
  private app: Application;
  private server: any;
  private questionManager: QuestionManager;
  private port: number;
  private onSubmitQuestion?: (text: string, questionId: string) => void;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  constructor(port: number, questionManager: QuestionManager) {
    this.port = port;
    this.questionManager = questionManager;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setSubmitHandler(handler: (text: string, questionId: string) => void): void {
    this.onSubmitQuestion = handler;
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(cors({
      origin: '*',
      exposedHeaders: ["Mcp-Session-Id"]
    }));
  }

  private createMCPServer(): Server {
    const server = new Server(
      {
        name: "gemini-tui-integrated-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          logging: {}
        },
      }
    );

    // Register tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "ask",
            description: "Submit questions or prompts to Gemini via the TUI. Use for any kind of inquiry, code analysis, brainstorming, or general assistance. Maintains conversation context across calls.",
            inputSchema: {
              type: "object",
              properties: {
                text: {
                  type: "string",
                  description: "The question or prompt to submit to Gemini",
                },
                stream: {
                  type: "boolean",
                  description: "Whether to use streaming mode (default: true)",
                  default: true
                }
              },
              required: ["text"],
            },
          },
        ],
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error(`No arguments provided for tool ${name}`);
      }

      switch (name) {
        case "ask":
          const { text, stream = true } = args as any;
          
          // Submit to TUI through the handler (same as HTTP server)
          const questionId = this.questionManager.submitQuestion(text);
          
          if (this.onSubmitQuestion) {
            console.log(`🔗 MCP: Calling TUI integration handler for question: ${questionId}`);
            this.onSubmitQuestion(text, questionId);
          } else {
            console.log(`⚠️ MCP: No TUI integration handler set! Cannot submit to TUI.`);
            throw new Error('MCP server not properly integrated with TUI - no submit handler set');
          }

          // Wait for response (poll like HTTP server does)
          // Use longer timeout for Gemini responses - they can take several minutes
          let retries = 0;
          const maxRetries = 240; // 240 * 2 seconds = 8 minutes maximum
          const pollInterval = 2000; // 2 seconds between polls
          
          console.log(`📝 MCP: Submitted question "${text}" with ID: ${questionId}, polling for response...`);
          
          while (retries < maxRetries) {
            const question = this.questionManager.getAnswer(questionId);
            
            // Debug logging
            if (retries === 0 || retries % 5 === 0) {
              console.log(`🔍 MCP Debug: Poll ${retries}, question status: ${question?.status || 'not found'}, response length: ${question?.response?.length || 0}`);
            }
            if (question && (question.status === 'finished' || question.status === 'error')) {
              if (question.status === 'error') {
                console.log(`❌ MCP: Question ${questionId} failed with error: ${question.error}`);
                throw new Error(question.error || 'TUI processing failed');
              }
              
              console.log(`✅ MCP: Question ${questionId} completed after ${retries} polls (${retries * 2} seconds)`);
              const streamIndicator = stream ? '[STREAMED]' : '[NON-STREAMED]';
              // Ensure we always return a valid string for the text field
              const responseText = question.response || 'No response received';
              const safeResponseText = typeof responseText === 'string' ? responseText : String(responseText);
              
              return {
                content: [
                  {
                    type: "text",
                    text: `🎯 Gemini TUI Response ${streamIndicator}:\n\n${safeResponseText}\n\n📊 Metadata:\n- Question ID: ${questionId}\n- Status: ${question.status}\n- Created: ${question.createdAt.toISOString()}\n- Polling time: ${retries * 2} seconds\n- Integration: Direct TUI Integration via MCP`,
                  },
                ],
              };
            }
            
            // Log progress every 30 seconds (15 polls)
            if (retries > 0 && retries % 15 === 0) {
              console.log(`⏳ MCP: Still waiting for response to "${text}" (${retries * 2}s elapsed, status: ${question?.status || 'unknown'})`);
            }
            
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            retries++;
          }

          console.log(`⏰ MCP: Question ${questionId} timed out after 8 minutes`);
          throw new Error('TUI response timeout after 8 minutes');


        default:
          throw new Error(`Tool ${name} not found`);
      }
    });

    return server;
  }

  private setupRoutes(): void {
    // POST /mcp endpoint - handles initialization and tool calls
    this.app.post('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      
      if (sessionId) {
        console.log(`📨 MCP request for session: ${sessionId}`);
      } else {
        console.log('📨 New MCP request:', req.body?.method || 'unknown');
      }

      try {
        let transport: StreamableHTTPServerTransport;
        
        if (sessionId && this.transports[sessionId]) {
          transport = this.transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          console.log('🆕 Creating new Gemini TUI MCP transport');
          
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId: string) => {
              console.log(`🔗 Gemini TUI MCP session initialized: ${sessionId}`);
              this.transports[sessionId] = transport;
            },
            onsessionclosed: (sessionId: string) => {
              console.log(`🔒 Gemini TUI MCP session closed: ${sessionId}`);
            }
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && this.transports[sid]) {
              console.log(`🧹 Cleaning up Gemini TUI MCP session: ${sid}`);
              delete this.transports[sid];
            }
          };

          const server = this.createMCPServer();
          await server.connect(transport);
          
          await transport.handleRequest(req, res, req.body);
          return;
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
      } catch (error) {
        console.error('❌ Error handling Gemini TUI MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    // GET /mcp endpoint - handles SSE streaming
    this.app.get('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      
      if (!sessionId || !this.transports[sessionId]) {
        console.log('❌ GET request: Invalid or missing session ID');
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);
    });

    // DELETE /mcp endpoint - handles session termination
    this.app.delete('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      
      if (!sessionId || !this.transports[sessionId]) {
        console.log('❌ DELETE request: Invalid or missing session ID');
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      console.log(`🗑️ MCP session termination request for: ${sessionId}`);

      try {
        const transport = this.transports[sessionId];
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('❌ Error handling MCP session termination:', error);
        if (!res.headersSent) {
          res.status(500).send('Error processing session termination');
        }
      }
    });

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'ok', 
        service: 'Gemini TUI MCP Server',
        timestamp: new Date().toISOString() 
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, 'localhost', () => {
        console.log(`🚀 MCP server listening on http://localhost:${this.port}`);
        console.log(`📡 MCP endpoint: http://localhost:${this.port}/mcp`);
        console.log(`🔧 Available MCP tools:`);
        console.log(`   - ask: Submit questions to Gemini via TUI`);
        console.log(`🎯 Features: Direct TUI integration, session management, streaming`);
        console.log(`💡 Ready to receive MCP connections!`);
        resolve();
      });
      
      this.server.on('error', (error: any) => {
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all active transports
      for (const sessionId in this.transports) {
        try {
          this.transports[sessionId].close();
          delete this.transports[sessionId];
        } catch (error) {
          console.error(`❌ Error closing MCP session ${sessionId}:`, error);
        }
      }

      if (this.server) {
        this.server.close(() => {
          console.log('MCP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}