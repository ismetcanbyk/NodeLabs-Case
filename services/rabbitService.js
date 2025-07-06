import amqp from 'amqplib';

class RabbitService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      console.log('Attempting to connect to RabbitMQ...');
      this.connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
      this.channel = await this.connection.createChannel();

      console.log('RabbitMQ connected successfully');
      this.isConnected = true;

      // Create required queues
      await this.channel.assertQueue('message_sending_queue', {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx',
          'x-dead-letter-routing-key': 'failed'
        }
      });

      // Create dead letter exchange for failed messages
      await this.channel.assertExchange('dlx', 'direct', { durable: true });
      await this.channel.assertQueue('failed_messages', { durable: true });
      await this.channel.bindQueue('failed_messages', 'dlx', 'failed');

      // Connection event listeners
      this.connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        console.log('RabbitMQ connection closed');
        this.isConnected = false;
      });

      return true;
    } catch (error) {
      console.error('RabbitMQ connection error:', error.message);
      console.log('Continuing without RabbitMQ - message queue features will be disabled');
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.isConnected = false;
      console.log('RabbitMQ disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting from RabbitMQ:', error);
    }
  }

  // Message Producer - Adding automatic messages to queue
  async sendAutoMessageToQueue(autoMessageData) {
    try {
      if (!this.isConnected || !this.channel) {
        console.error('RabbitMQ not connected');
        return false;
      }

      const messagePayload = {
        autoMessageId: autoMessageData._id,
        senderId: autoMessageData.sender,
        receiverId: autoMessageData.receiver,
        content: autoMessageData.content.text,
        conversationId: autoMessageData.conversationId,
        timestamp: new Date(),
        retryCount: 0,
        maxRetries: 3
      };

      this.channel.sendToQueue(
        'message_sending_queue',
        Buffer.from(JSON.stringify(messagePayload)),
        {
          persistent: true,
          messageId: autoMessageData._id.toString(),
          timestamp: Date.now()
        }
      );

      console.log(`Auto message ${autoMessageData._id} sent to queue`);
      return true;
    } catch (error) {
      console.error('Error sending message to queue:', error);
      return false;
    }
  }

  // Message Consumer - Processing messages from queue
  async startMessageConsumer(messageHandler) {
    try {
      if (!this.isConnected || !this.channel) {
        console.error('RabbitMQ not connected, cannot start consumer');
        return false;
      }

      // Set prefetch to process one message at a time
      await this.channel.prefetch(1);

      console.log('Starting message consumer...');

      await this.channel.consume('message_sending_queue', async (msg) => {
        if (msg === null) {
          return;
        }

        try {
          const messageData = JSON.parse(msg.content.toString());
          console.log('Processing message from queue:', messageData.autoMessageId);

          // Call the provided message handler
          const success = await messageHandler(messageData);

          if (success) {
            // Acknowledge the message if processed successfully
            this.channel.ack(msg);
            console.log(`Message ${messageData.autoMessageId} processed successfully`);
          } else {
            // Reject and retry with exponential backoff
            await this.handleMessageFailure(msg, messageData);
          }
        } catch (error) {
          console.error('Error processing message:', error);
          await this.handleMessageFailure(msg, null, error);
        }
      });

      console.log('Message consumer started successfully');
      return true;
    } catch (error) {
      console.error('Error starting message consumer:', error);
      return false;
    }
  }

  // Error handling and retry
  async handleMessageFailure(msg, messageData, error = null) {
    try {
      const retryCount = (messageData?.retryCount || 0) + 1;
      const maxRetries = messageData?.maxRetries || 3;

      console.log(`Message failed, retry attempt ${retryCount}/${maxRetries}`);

      if (retryCount <= maxRetries) {
        // Retry with delay
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff

        setTimeout(async () => {
          try {
            const updatedData = {
              ...messageData,
              retryCount,
              lastError: error?.message || 'Processing failed'
            };

            this.channel.sendToQueue(
              'message_sending_queue',
              Buffer.from(JSON.stringify(updatedData)),
              { persistent: true }
            );

            this.channel.ack(msg);
          } catch (retryError) {
            console.error('Error during retry:', retryError);
            this.channel.nack(msg, false, false); // Send to dead letter queue
          }
        }, delay);
      } else {
        // Max retries exceeded, send to dead letter queue
        console.log(`Message ${messageData?.autoMessageId} exceeded max retries, sending to dead letter queue`);
        this.channel.nack(msg, false, false);
      }
    } catch (error) {
      console.error('Error handling message failure:', error);
      this.channel.nack(msg, false, false);
    }
  }

  // Check queue status
  async getQueueInfo(queueName = 'message_sending_queue') {
    try {
      if (!this.isConnected || !this.channel) {
        return null;
      }

      const queueInfo = await this.channel.checkQueue(queueName);
      return {
        queue: queueName,
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount
      };
    } catch (error) {
      console.error('Error getting queue info:', error);
      return null;
    }
  }

  // Check failed messages
  async getFailedMessages() {
    try {
      if (!this.isConnected || !this.channel) {
        return null;
      }

      const queueInfo = await this.channel.checkQueue('failed_messages');
      return {
        queue: 'failed_messages',
        messageCount: queueInfo.messageCount
      };
    } catch (error) {
      console.error('Error getting failed messages info:', error);
      return null;
    }
  }
}


const rabbitService = new RabbitService();

export default rabbitService; 