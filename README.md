# NodeLabs Real-Time Messaging API

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-5.x-blue.svg)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-black.svg)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Latest-green.svg)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-Latest-red.svg)](https://redis.io/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-Latest-orange.svg)](https://www.rabbitmq.com/)

A comprehensive real-time messaging API built with Node.js, featuring automatic message planning, queue management, and real-time communication capabilities.

## 🚀 Features

### Core Functionality

- **Real-time messaging** with Socket.IO
- **JWT-based authentication** with refresh tokens
- **Automatic message planning** and distribution
- **Message queuing** with RabbitMQ
- **Online user tracking** with Redis
- **Conversation management**
- **Cron job scheduling** for automated tasks

### Security

- **Helmet.js** for security headers
- **CORS** configuration
- **Input validation** and sanitization
- **Rate limiting** protection
- **Token blacklisting** system

### Architecture

- **Microservices-ready** design
- **Scalable queue system** with retry mechanisms
- **Database optimization** with MongoDB
- **Caching layer** with Redis
- **Error handling** and logging
- **Health monitoring** endpoints

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 5.x
- **Database**: MongoDB with Mongoose
- **Cache**: Redis
- **Message Queue**: RabbitMQ
- **Real-time**: Socket.IO
- **Authentication**: JWT
- **Security**: Helmet.js
- **Task Scheduling**: node-cron
- **Environment**: dotenv

## 📦 Installation

### Prerequisites

- Node.js 18.x or higher
- MongoDB 5.x or higher
- Redis 6.x or higher
- RabbitMQ 3.8.x or higher

### Setup Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/ismetcanbyk/NodeLabs-Case.git
   cd NodeLabs-Case
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment configuration**

   ```bash
   cp env.example .env
   ```

4. **Configure environment variables**

   ```env
   # Server
   PORT=3000
   NODE_ENV=development

   # Database
   MONGODB_URI=mongodb://localhost:27017/nodelabs

   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # RabbitMQ
   RABBITMQ_URL=amqp://localhost

   # JWT
   JWT_SECRET=your-super-secret-jwt-key
   JWT_REFRESH_SECRET=your-super-secret-refresh-key
   JWT_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=7d
   ```

5. **Start services**

   ```bash
   # Start MongoDB (if not running)
   mongod

   # Start Redis (if not running)
   redis-server

   # Start RabbitMQ (if not running)
   rabbitmq-server
   ```

6. **Run the application**

   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

## 🔧 Configuration

### Docker Setup (Optional)

```bash
# Start all services with Docker Compose
docker-compose up -d
```

### Environment Variables

| Variable             | Description                | Default                              |
| -------------------- | -------------------------- | ------------------------------------ |
| `PORT`               | Server port                | `3000`                               |
| `MONGODB_URI`        | MongoDB connection string  | `mongodb://localhost:27017/nodelabs` |
| `REDIS_HOST`         | Redis host                 | `localhost`                          |
| `REDIS_PORT`         | Redis port                 | `6379`                               |
| `RABBITMQ_URL`       | RabbitMQ connection string | `amqp://localhost`                   |
| `JWT_SECRET`         | JWT secret key             | Required                             |
| `JWT_REFRESH_SECRET` | JWT refresh secret key     | Required                             |

## 📚 API Documentation

### Authentication Endpoints

```http
POST /api/auth/register     # User registration
POST /api/auth/login        # User login
POST /api/auth/refresh      # Refresh JWT token
POST /api/auth/logout       # User logout
GET  /api/auth/me          # Get current user info
```

### User Management

```http
GET /api/user/list         # Get user list
```

### Messaging

```http
POST /api/messages/send              # Send message
GET  /api/messages/:conversationId   # Get conversation messages
PUT  /api/messages/:messageId/read   # Mark message as read
```

### Conversations

```http
GET /api/conversations     # Get user conversations
```

### System Management

```http
GET  /api/system/status                    # System health check
GET  /api/system/queue-stats              # Queue statistics
POST /api/system/trigger-planning         # Trigger message planning
POST /api/system/trigger-queue            # Trigger queue management
POST /api/system/create-test-message      # Create test message
POST /api/system/start-test-planning-cron # Start test cron job
POST /api/system/stop-test-planning-cron  # Stop test cron job
```

## 🔌 WebSocket Events

### Client Events

```javascript
// Connection
socket.emit("join_room", { conversationId: "room_id" });
socket.emit("leave_room", { conversationId: "room_id" });

// Messaging
socket.emit("send_message", {
  conversationId: "conv_id",
  content: { text: "Hello World!" },
  messageType: "text",
});

// Status
socket.emit("mark_message_read", {
  messageId: "msg_id",
  conversationId: "conv_id",
});
socket.emit("get_online_users", { conversationId: "conv_id" });
```

### Server Events

```javascript
// Connection status
socket.on("user_online", (data) => {
  /* User came online */
});
socket.on("user_offline", (data) => {
  /* User went offline */
});

// Room management
socket.on("room_joined", (data) => {
  /* Successfully joined room */
});
socket.on("room_left", (data) => {
  /* Successfully left room */
});

// Messaging
socket.on("message_received", (data) => {
  /* New message received */
});
socket.on("message_read", (data) => {
  /* Message marked as read */
});

// Online users
socket.on("online_users_list", (data) => {
  /* Online users in conversation */
});

// Errors
socket.on("error", (error) => {
  /* Error occurred */
});
```

## 🏗️ Project Structure

```
NodeLabs/
├── config/
│   └── database.js           # Database configuration
├── middleware/
│   └── auth.js              # JWT authentication middleware
├── models/
│   ├── User.js              # User model
│   ├── Message.js           # Message model
│   ├── Conversation.js      # Conversation model
│   └── AutoMessage.js       # Auto message model
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── user.js              # User management routes
│   ├── message.js           # Messaging routes
│   └── conversation.js      # Conversation routes
├── services/
│   ├── redisService.js      # Redis operations
│   ├── rabbitService.js     # RabbitMQ operations
│   └── cronService.js       # Cron job management
├── server.js                # Main server file
├── package.json            # Dependencies
├── docker-compose.yaml     # Docker configuration
└── README.md              # This file
```

## 🤖 Automated Message System

### Message Planning

- **Scheduled execution**: Every night at 02:00 AM
- **Algorithm**: Pairs active users randomly
- **Templates**: Greeting, motivation, questions, fun facts, quotes
- **Smart scheduling**: Random send times between 1-24 hours

### Queue Management

- **Processing**: Every minute check for ready messages
- **Retry mechanism**: Exponential backoff for failed messages
- **Dead letter queue**: For messages exceeding max retries
- **Priority system**: Message prioritization (3-7 scale)

### Message Distribution

- **Real-time delivery**: Via Socket.IO
- **Automatic processing**: RabbitMQ consumer
- **Error handling**: Comprehensive retry and logging
- **Status tracking**: Complete message lifecycle monitoring

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3000/api/system/status
```

Response:

```json
{
  "system": {
    "uptime": 3600,
    "node_version": "v18.17.0"
  },
  "services": {
    "mongodb": true,
    "redis": true,
    "rabbitmq": true,
    "cronJobs": true
  },
  "stats": {
    "onlineUsers": 5,
    "messageQueue": {
      "queue": "message_sending_queue",
      "messageCount": 0,
      "consumerCount": 1
    },
    "failedMessages": {
      "queue": "failed_messages",
      "messageCount": 0
    }
  }
}
```

## 🧪 Testing

### Socket.IO Testing

Open `test-socket.html` in your browser for interactive WebSocket testing.

## 🔒 Security Features

- **Helmet.js**: Security headers protection
- **CORS**: Cross-origin resource sharing control
- **JWT**: Secure token-based authentication
- **Input validation**: Request data sanitization
- **Rate limiting**: API abuse prevention
- **Token blacklisting**: Logout security
- **Error handling**: Information disclosure prevention

## 📈 Performance Optimization

- **Connection pooling**: Database and Redis connections
- **Caching strategy**: Redis for frequently accessed data
- **Queue optimization**: Message batching and prioritization
- **Database indexing**: Optimized queries
- **Memory management**: Efficient data structures
- **Async operations**: Non-blocking I/O operations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**İsmet Can Byk**

- GitHub: [ismetcanbyk](https://github.com/ismetcanbyk)
- Email: [ismetcanbyk@gmail.com](mailto:ismetcanbyk@gmail.com)

⭐ **If you find this project useful, please give it a star!** ⭐
