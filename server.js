import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';

// Routes
import authRoutes from './routes/auth.js';
import messageRoutes from './routes/message.js';
import conversationRoutes from './routes/conversation.js';
import userRoutes from './routes/user.js';

// Services
import redisService from './services/redisService.js';
import rabbitService from './services/rabbitService.js';
import cronService from './services/cronService.js';

// Middleware
import authenticateToken from './middleware/auth.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Redis connection
const connectRedis = async () => {
  try {
    await redisService.connect();
    console.log('✅ Redis connection initialized');
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
  }
};

// RabbitMQ connection
const connectRabbitMQ = async () => {
  try {
    await rabbitService.connect();
    console.log('✅ RabbitMQ connection initialized');

    // Start message consumer
    if (rabbitService.isConnected) {
      await rabbitService.startMessageConsumer(cronService.handleMessageDistribution.bind(cronService));
      console.log('✅ RabbitMQ message consumer started');
    }
  } catch (error) {
    console.error('❌ RabbitMQ connection failed:', error);
  }
};

// Initialize all services
const initializeServices = async () => {
  await connectDB();
  await connectRedis();
  await connectRabbitMQ();

  // Start cron jobs
  cronService.startAllJobs();
  console.log('✅ All services initialized successfully');
};

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/user', userRoutes);

// Root endpoint - API information
app.get('/', (req, res) => {
  res.json({
    message: 'NodeLabs Real-Time Messaging API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'POST /api/auth/refresh',
        'POST /api/auth/logout',
        'GET /api/auth/me'
      ],
      users: [
        'GET /api/user/list'
      ],
      messages: [
        'POST /api/messages/send',
        'GET /api/messages/:conversationId',
        'PUT /api/messages/:messageId/read'
      ],
      conversations: [
        'GET /api/conversations'
      ],
      system: [
        'GET /api/system/status',
        'GET /api/system/queue-stats',
        'POST /api/system/trigger-planning',
        'POST /api/system/trigger-queue',
        'POST /api/system/create-test-message',
        'POST /api/system/start-test-planning-cron',
        'POST /api/system/stop-test-planning-cron'
      ]
    },
    services: {
      mongodb: mongoose.connection.readyState === 1,
      redis: redisService.isConnected,
      rabbitmq: rabbitService.isConnected,
      cronJobs: cronService.isRunning
    }
  });
});

// System status endpoint - Public (no auth required for monitoring)
app.get('/api/system/status', async (req, res) => {
  try {
    const onlineUsers = await redisService.getOnlineUserCount();
    const queueInfo = await rabbitService.getQueueInfo();
    const failedMessages = await rabbitService.getFailedMessages();

    res.json({
      system: {
        uptime: process.uptime(),
        node_version: process.version
      },
      services: {
        mongodb: mongoose.connection.readyState === 1,
        redis: redisService.isConnected,
        rabbitmq: rabbitService.isConnected,
        cronJobs: cronService.isRunning
      },
      stats: {
        onlineUsers,
        messageQueue: queueInfo,
        failedMessages
      }
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Queue statistics endpoint 
app.get('/api/system/queue-stats', authenticateToken, async (req, res) => {
  try {
    const stats = await cronService.getJobStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Queue stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual trigger endpoints for testing
app.post('/api/system/trigger-planning', authenticateToken, async (req, res) => {
  try {
    await cronService.triggerPlanningJob();
    res.json({ message: 'Message planning job triggered successfully' });
  } catch (error) {
    console.error('Manual trigger error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/system/trigger-queue', authenticateToken, async (req, res) => {
  try {
    await cronService.triggerQueueJob();
    res.json({ message: 'Queue management job triggered successfully' });
  } catch (error) {
    console.error('Manual trigger error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Direct AutoMessage creation endpoint for testing
app.post('/api/system/create-test-message', authenticateToken, async (req, res) => {
  try {
    const { receiverId, content, sendInMinutes = 1, template = 'greeting', category = 'special' } = req.body;

    if (!receiverId || !content) {
      return res.status(400).json({ error: 'receiverId and content required' });
    }

    // Receiver user validation
    const receiver = await mongoose.model('User').findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ error: 'Receiver user not found' });
    }

    // Find or create conversation
    let conversation = await mongoose.model('Conversation').findOne({
      participants: { $all: [req.user.userId, receiverId] }
    });

    if (!conversation) {
      conversation = new (mongoose.model('Conversation'))({
        participants: [req.user.userId, receiverId],
        isActive: true
      });
      await conversation.save();
    }

    // Create test AutoMessage
    const sendDate = new Date(Date.now() + (sendInMinutes * 60 * 1000));

    const autoMessage = new (mongoose.model('AutoMessage'))({
      sender: req.user.userId,
      receiver: receiverId,
      conversationId: conversation._id,
      content: {
        text: content,
        template: template  // Valid enum: greeting, motivation, question, fun_fact, compliment, weather, inspiration, reminder, joke, quote
      },
      scheduledDate: new Date(),
      sendDate: sendDate,
      status: 'scheduled',
      metadata: {
        generatedBy: 'manual',
        batchId: `test_${Date.now()}`,
        priority: 5,
        category: category  // Valid enum: daily, weekly, special, emergency
      }
    });

    await autoMessage.save();

    res.json({
      success: true,
      message: 'Test AutoMessage created successfully',
      autoMessage: {
        id: autoMessage._id,
        sendDate: sendDate,
        content: content,
        conversationId: conversation._id
      }
    });

  } catch (error) {
    console.error('Create test message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Temporary planning job for testing (runs every minute)
app.post('/api/system/start-test-planning-cron', authenticateToken, async (req, res) => {
  try {
    const { intervalMinutes = 1 } = req.body;

    // Stop existing test job
    if (global.testPlanningJob) {
      global.testPlanningJob.stop();
      delete global.testPlanningJob;
    }

    // Start new test cron job
    const cronPattern = intervalMinutes === 1 ? '* * * * *' : `*/${intervalMinutes} * * * *`;

    global.testPlanningJob = cron.schedule(cronPattern, async () => {
      console.log('🧪 TEST PLANNING JOB: Starting automatic message planning...');
      await cronService.triggerPlanningJob();
    }, {
      scheduled: false
    });

    global.testPlanningJob.start();

    res.json({
      success: true,
      message: `Test planning job started - runs every ${intervalMinutes} minute(s)`,
      cronPattern: cronPattern,
      note: 'Use /stop-test-planning-cron to stop this test job'
    });

  } catch (error) {
    console.error('Start test planning cron error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Stop test planning job
app.post('/api/system/stop-test-planning-cron', authenticateToken, async (req, res) => {
  try {
    if (global.testPlanningJob) {
      global.testPlanningJob.stop();
      delete global.testPlanningJob;

      res.json({
        success: true,
        message: 'Test planning job stopped successfully'
      });
    } else {
      res.json({
        success: false,
        message: 'No test planning job was running'
      });
    }

  } catch (error) {
    console.error('Stop test planning cron error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket.IO Configuration
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Make io globally available for cron service
global.io = io;



// Socket.IO JWT Authentication Middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await mongoose.model('User').findById(decoded.userId);

    if (!user || !user.isActive) {
      return next(new Error('Authentication error: Invalid user'));
    }

    socket.userId = user._id.toString();
    socket.username = user.username;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO Connection Management with Redis Integration
const connectedUsers = new Map();
const userSockets = new Map();

io.on('connection', async (socket) => {
  console.log(`🔌 User ${socket.username} (${socket.userId}) connected with socket ${socket.id}`);

  // Store connection mappings
  connectedUsers.set(socket.userId, socket.id);
  userSockets.set(socket.id, socket.userId);

  // Add user to Redis online users list
  await redisService.addOnlineUser(socket.userId);

  // Join user to their conversations
  try {
    const conversations = await mongoose.model('Conversation').find({
      participants: socket.userId
    });

    conversations.forEach(conv => {
      socket.join(conv._id.toString());
    });
  } catch (error) {
    console.error('Error joining user conversations:', error);
  }

  // Broadcast user online status
  socket.broadcast.emit('user_online', {
    userId: socket.userId,
    username: socket.username,
    timestamp: new Date()
  });

  // Handle joining specific conversation rooms
  socket.on('join_room', (data) => {
    const { conversationId } = data;
    socket.join(conversationId);
    console.log(`📝 User ${socket.username} joined conversation ${conversationId}`);

    socket.emit('room_joined', {
      conversationId,
      message: 'Successfully joined conversation'
    });
  });

  // Handle leaving conversation rooms
  socket.on('leave_room', (data) => {
    const { conversationId } = data;
    socket.leave(conversationId);
    console.log(`📤 User ${socket.username} left conversation ${conversationId}`);

    socket.emit('room_left', {
      conversationId,
      message: 'Successfully left conversation'
    });
  });

  // Handle real-time message sending
  socket.on('send_message', async (data) => {
    try {
      const { conversationId, content, messageType = 'text' } = data;

      // Validate required fields
      if (!conversationId || !content?.text) {
        socket.emit('error', { message: 'Invalid message data' });
        return;
      }

      // Create new message in database
      const Message = mongoose.model('Message');
      const newMessage = new Message({
        conversation: conversationId,
        sender: socket.userId,
        content,
        messageType,
        status: 'sent'
      });

      await newMessage.save();
      await newMessage.populate('sender', 'username');

      // Update conversation
      const Conversation = mongoose.model('Conversation');
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: newMessage._id,
        lastMessageTime: new Date(),
        $inc: { totalMessages: 1 }
      });

      // Emit to conversation room
      io.to(conversationId).emit('message_received', {
        messageId: newMessage._id,
        conversationId,
        from: {
          id: socket.userId,
          username: socket.username
        },
        content: newMessage.content,
        messageType: newMessage.messageType,
        timestamp: newMessage.createdAt
      });

      console.log(`💬 Message sent by ${socket.username} to conversation ${conversationId}`);

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle message read status
  socket.on('mark_message_read', async (data) => {
    try {
      const { messageId, conversationId } = data;

      const Message = mongoose.model('Message');
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { readBy: socket.userId },
        status: 'read'
      });

      // Notify conversation participants
      socket.to(conversationId).emit('message_read', {
        messageId,
        conversationId,
        readBy: socket.userId,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Mark message read error:', error);
    }
  });

  // Get online users in conversation
  socket.on('get_online_users', async (data) => {
    try {
      const { conversationId } = data;
      const conversation = await mongoose.model('Conversation').findById(conversationId);

      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      const onlineUsers = [];
      for (const participantId of conversation.participants) {
        const isOnline = await redisService.isUserOnline(participantId.toString());
        if (isOnline) {
          onlineUsers.push(participantId);
        }
      }

      socket.emit('online_users_list', {
        conversationId,
        onlineUsers,
        count: onlineUsers.length
      });

    } catch (error) {
      console.error('Get online users error:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log(`🔌 User ${socket.username} (${socket.userId}) disconnected`);

    // Remove from mappings
    connectedUsers.delete(socket.userId);
    userSockets.delete(socket.id);

    // Remove from Redis online users list
    await redisService.removeOnlineUser(socket.userId);

    // Broadcast user offline status
    socket.broadcast.emit('user_offline', {
      userId: socket.userId,
      username: socket.username,
      timestamp: new Date()
    });
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');

  try {
    // Stop cron jobs
    cronService.stopAllJobs();

    // Disconnect services
    await redisService.disconnect();
    await rabbitService.disconnect();
    await mongoose.connection.close();

    console.log('✅ All services disconnected successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

const PORT = process.env.PORT || 3000;

// Initialize services and start server
initializeServices().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
  });
}).catch((error) => {
  console.error('❌ Failed to initialize services:', error);
  process.exit(1);
});