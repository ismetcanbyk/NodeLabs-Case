import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cron from 'node-cron';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import User from './models/User.js';
import connectDB from './config/database.js';
import { authenticateToken } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';


dotenv.config();

const app = express();
const server = createServer(app);

// Port Configuration
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
connectDB();


// Routes with /api prefix
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'NodeLabs API Server',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/*',
      health: '/api/health',
      protected: '/api/protected'
    },
    technologies: [
      'Node.js',
      'Express.js',
      'MongoDB',
      'JWT',
      'Socket.IO',
      'Cron Jobs'
    ]
  });
});


// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start Server
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Server initialized successfully');
});

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
}); 