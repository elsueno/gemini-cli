import express, { Application, Request, Response } from 'express';
import { QuestionManager } from './questionManager.js';

export class HttpServerService {
  private app: Application;
  private server: any;
  private questionManager: QuestionManager;
  private port: number;
  private onSubmitQuestion?: (text: string, questionId: string) => void;

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
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
  }

  private setupRoutes(): void {
    // POST /question - Submit a new question
    this.app.post('/question', (req: Request, res: Response): void => {
      try {
        const { text } = req.body;
        
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
          res.status(400).json({ 
            error: 'Invalid request: text field is required and must be non-empty string' 
          });
          return;
        }

        const questionId = this.questionManager.submitQuestion(text.trim());
        
        // Trigger TUI interaction
        if (this.onSubmitQuestion) {
          this.onSubmitQuestion(text.trim(), questionId);
        }

        res.json({ questionId });
      } catch (error) {
        console.error('Error submitting question:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /answer/:questionId - Get answer for a question
    this.app.get('/answer/:questionId', (req: Request, res: Response): void => {
      try {
        const { questionId } = req.params;
        
        if (!questionId || typeof questionId !== 'string') {
          res.status(400).json({ 
            error: 'Invalid questionId format' 
          });
          return;
        }

        const question = this.questionManager.getAnswer(questionId);
        
        if (!question) {
          res.status(404).json({ 
            error: 'Question not found' 
          });
          return;
        }

        res.json({
          questionId: question.id,
          status: question.status,
          request: question.request,
          response: question.response,
          error: question.error,
          createdAt: question.createdAt
        });
      } catch (error) {
        console.error('Error getting answer:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Debug endpoint - list all questions
    this.app.get('/debug/questions', (req: Request, res: Response) => {
      try {
        const questions = this.questionManager.getAllQuestions();
        res.json({ questions });
      } catch (error) {
        console.error('Error getting questions:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, 'localhost', () => {
        console.log(`HTTP server listening on http://localhost:${this.port}`);
        resolve();
      });
      
      this.server.on('error', (error: any) => {
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('HTTP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}