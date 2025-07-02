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
import { instrument } from '@socket.io/admin-ui';
import dotenv from 'dotenv';
import User from './models/User.js';
import connectDB from './config/database.js';
import { authenticateToken } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import messageRoutes from './routes/message.js';
import conversationRoutes from './routes/conversation.js';


dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Socket.IO Admin UI
instrument(io, {
  auth: false,
  mode: "development"
});

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
app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'NodeLabs API Server',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/*',
      user: '/api/user/*',
      messages: '/api/messages/*',
      conversations: '/api/conversations',
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


// Socket.IO Configuration with JWT Authentication
const connectedUsers = new Map(); // Store connected users: userId -> socketId
const userSockets = new Map(); // Store socket connections: socketId -> userId

// JWT Authentication middleware for Socket.IO
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    socket.userId = decoded.id;
    socket.userEmail = decoded.email;

    next();
  } catch (error) {
    next(new Error('Invalid authentication token'));
  }
});

io.on('connection', async (socket) => {
  console.log(`User ${socket.userId} connected with socket ${socket.id}`);

  // Store user connection mapping
  connectedUsers.set(socket.userId, socket.id);
  userSockets.set(socket.id, socket.userId);

  // Notify other users that this user is online
  socket.broadcast.emit('user_online', {
    userId: socket.userId,
    timestamp: new Date()
  });

  // Get user's conversations and join rooms
  try {
    const Conversation = mongoose.model('Conversation');
    const userConversations = await Conversation.find({
      participants: socket.userId,
      isActive: true
    });

    userConversations.forEach(conversation => {
      socket.join(conversation._id.toString());
      console.log(`User ${socket.userId} joined conversation room: ${conversation._id}`);
    });
  } catch (error) {
    console.error('Error joining user conversations:', error);
  }

  // Handle joining specific conversation room
  socket.on('join_room', (conversationId) => {
    socket.join(conversationId);
    console.log(`User ${socket.userId} manually joined conversation: ${conversationId}`);

    socket.emit('joined_room', {
      conversationId,
      message: 'Successfully joined conversation'
    });
  });

  // Handle leaving conversation room
  socket.on('leave_room', (conversationId) => {
    socket.leave(conversationId);
    console.log(`User ${socket.userId} left conversation: ${conversationId}`);

    socket.emit('left_room', {
      conversationId,
      message: 'Successfully left conversation'
    });
  });

  // Handle real-time message sending
  socket.on('send_message', (data) => {
    const { conversationId, message } = data;

    // Validate required fields
    if (!conversationId || !message) {
      socket.emit('message_error', {
        error: 'conversationId and message are required'
      });
      return;
    }

    // Broadcast message to conversation room (except sender)
    socket.to(conversationId).emit('message_received', {
      messageId: message._id || null,
      conversationId,
      sender: {
        id: socket.userId,
        username: message.sender?.username || 'Unknown'
      },
      content: message.content,
      timestamp: message.createdAt || new Date(),
      messageType: message.messageType || 'text'
    });

    console.log(`Message sent from ${socket.userId} to conversation ${conversationId}`);
  });



  // Handle message read status
  socket.on('message_read', (data) => {
    const { conversationId, messageId } = data;
    socket.to(conversationId).emit('message_status_update', {
      messageId,
      conversationId,
      status: 'read',
      readBy: socket.userId,
      timestamp: new Date()
    });
  });

  // Get online users list
  socket.on('get_online_users', () => {
    const onlineUsers = Array.from(connectedUsers.keys());
    socket.emit('online_users_list', {
      users: onlineUsers,
      count: onlineUsers.length
    });
  });

  // Check if specific user is online
  socket.on('check_user_status', (userId) => {
    const isOnline = connectedUsers.has(userId);
    socket.emit('user_status_response', {
      userId,
      isOnline,
      timestamp: new Date()
    });
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected (socket: ${socket.id})`);

    // Remove user from connection mappings
    connectedUsers.delete(socket.userId);
    userSockets.delete(socket.id);

    // Notify other users that this user is offline
    socket.broadcast.emit('user_offline', {
      userId: socket.userId,
      timestamp: new Date()
    });
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error(`Socket error for user ${socket.userId}:`, error);
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