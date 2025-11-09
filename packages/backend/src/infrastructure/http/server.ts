import express, { Express } from 'express';
import cors from 'cors';
import { Server as HTTPServer, createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

export interface ServerConfig {
  port: number;
  corsOrigin: string;
}

export class Server {
  private app: Express;
  private httpServer: HTTPServer;
  private io: SocketIOServer;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS configuration
    this.app.use(
      cors({
        origin: this.config.corsOrigin,
        credentials: true,
      })
    );

    // JSON body parser
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });
  }

  public registerRoutes(basePath: string, router: express.Router): void {
    this.app.use(basePath, router);
  }

  public finalize404Handler(): void {
    // 404 handler - call this after all routes are registered
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
      });
    });
  }

  public getApp(): Express {
    return this.app;
  }

  public getIO(): SocketIOServer {
    return this.io;
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        console.log(`[Server] HTTP server listening on port ${this.config.port}`);
        console.log(`[Server] CORS enabled for origin: ${this.config.corsOrigin}`);
        console.log(`[Server] WebSocket server ready`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[Server] Shutting down gracefully...');

      // Close WebSocket connections
      this.io.close(() => {
        console.log('[Server] WebSocket connections closed');

        // Close HTTP server
        this.httpServer.close((err) => {
          if (err) {
            console.error('[Server] Error during shutdown:', err);
            reject(err);
          } else {
            console.log('[Server] HTTP server closed');
            resolve();
          }
        });
      });
    });
  }
}
