import dotenv from 'dotenv';
import 'express-async-errors';
import EventEmitter from 'events';
import express from 'express';
import http from 'http';
import path from 'path';
import { Server as socketIo } from 'socket.io'; 
import connectDB from './config/connect.js';
import notFoundMiddleware from './middleware/not-found.js';
import errorHandlerMiddleware from './middleware/error-handler.js';
import authMiddleware from './middleware/authentication.js';

// Routers
import authRouter from './routes/auth.js';
import rideRouter from './routes/ride.js';

// Import socket handler
import handleSocketConnection from './controllers/sockets.js';

dotenv.config();

EventEmitter.defaultMaxListeners = 20;

const app = express();
app.use(express.json());

const server = http.createServer(app);

const io = new socketIo(server, { cors: { origin: "*" } });
app.set('io', io);

// Attach the WebSocket instance to the request object
app.use((req, res, next) => {
  req.io = io;
  return next();
});

const publicPath = path.resolve(process.cwd(), 'public');
app.use(express.static(publicPath));

// Initialize the WebSocket handling logic
handleSocketConnection(io);

// Routes
app.get('/status', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});
app.use("/auth", authRouter);
app.use("/ride", authMiddleware, rideRouter);

// Middleware
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    const port = process.env.PORT || 3000;

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `Port ${port} is already in use. Stop the running server or set PORT to a different value.`
        );
      } else {
        console.error(error);
      }
      process.exit(1);
    });

    server.listen(port, "0.0.0.0", () =>
      console.log(`HTTP server is running on http://localhost:${port}`)
    );
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

start();
