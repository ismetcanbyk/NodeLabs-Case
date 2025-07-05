import mongoose from 'mongoose';

const autoMessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    text: {
      type: String,
      required: true,
      trim: true
    },
    template: {
      type: String,
      enum: [
        'greeting',
        'motivation',
        'question',
        'fun_fact',
        'compliment',
        'weather',
        'inspiration',
        'reminder',
        'joke',
        'quote'
      ],
      required: true
    }
  },
  // Scheduling information
  scheduledDate: {
    type: Date,
    required: true
  },
  sendDate: {
    type: Date,
    required: true
  },
  // Processing status
  status: {
    type: String,
    enum: ['scheduled', 'queued', 'sent', 'failed', 'cancelled'],
    default: 'scheduled'
  },
  // Queue management
  isQueued: {
    type: Boolean,
    default: false
  },
  queuedAt: {
    type: Date
  },
  // Sending status
  isSent: {
    type: Boolean,
    default: false
  },
  sentAt: {
    type: Date
  },
  // Associated message after sending
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  // Associated conversation
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  // Error handling
  error: {
    message: String,
    code: String,
    timestamp: Date,
    retryCount: {
      type: Number,
      default: 0
    },
    maxRetries: {
      type: Number,
      default: 3
    }
  },
  // Metadata
  metadata: {
    generatedBy: {
      type: String,
      enum: ['cron_job', 'manual', 'system'],
      default: 'cron_job'
    },
    batchId: {
      type: String
    },
    priority: {
      type: Number,
      min: 1,
      max: 10,
      default: 5
    },
    category: {
      type: String,
      enum: ['daily', 'weekly', 'special', 'emergency'],
      default: 'daily'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for processing delay
autoMessageSchema.virtual('processingDelay').get(function () {
  if (this.queuedAt && this.sentAt) {
    return this.sentAt.getTime() - this.queuedAt.getTime();
  }
  return null;
});

// Virtual for schedule accuracy
autoMessageSchema.virtual('scheduleAccuracy').get(function () {
  if (this.sendDate && this.sentAt) {
    return Math.abs(this.sentAt.getTime() - this.sendDate.getTime());
  }
  return null;
});

// Indexes for better query performance
autoMessageSchema.index({ sendDate: 1, isQueued: 1 });
autoMessageSchema.index({ status: 1, sendDate: 1 });
autoMessageSchema.index({ sender: 1, receiver: 1, scheduledDate: 1 });
autoMessageSchema.index({ 'metadata.batchId': 1 });
autoMessageSchema.index({ isQueued: 1, isSent: 1 });
autoMessageSchema.index({ createdAt: -1 });

// Static method to find messages ready for queuing
autoMessageSchema.statics.findReadyForQueue = function () {
  return this.find({
    sendDate: { $lte: new Date() },
    isQueued: false,
    isSent: false,
    status: 'scheduled'
  }).populate('sender receiver', 'username email isActive');
};



// Static method to get statistics
autoMessageSchema.statics.getStatistics = async function (startDate, endDate) {
  const pipeline = [
    {
      $match: {
        createdAt: {
          $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          $lte: endDate || new Date()
        }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgProcessingTime: { $avg: '$processingDelay' }
      }
    }
  ];

  const results = await this.aggregate(pipeline);

  return {
    total: await this.countDocuments(),
    byStatus: results,
    pending: await this.countDocuments({
      isQueued: false,
      isSent: false,
      status: 'scheduled'
    }),
    failed: await this.countDocuments({ status: 'failed' })
  };
};



// Instance method to mark as sent
autoMessageSchema.methods.markAsSent = async function (messageId, conversationId) {
  this.isSent = true;
  this.sentAt = new Date();
  this.status = 'sent';
  this.messageId = messageId;
  this.conversationId = conversationId;
  await this.save();
  return this;
};

// Instance method to mark as failed
autoMessageSchema.methods.markAsFailed = async function (errorMessage, errorCode = null) {
  this.status = 'failed';
  this.error = {
    message: errorMessage,
    code: errorCode,
    timestamp: new Date(),
    retryCount: (this.error?.retryCount || 0) + 1
  };
  await this.save();
  return this;
};

// Instance method to retry failed message
autoMessageSchema.methods.retry = async function (newSendDate = null) {
  if (this.error && this.error.retryCount < this.error.maxRetries) {
    this.status = 'scheduled';
    this.isQueued = false;
    this.sendDate = newSendDate || new Date(Date.now() + 5 * 60000); // Retry after 5 minutes
    this.error.retryCount = (this.error.retryCount || 0) + 1;
    await this.save();
    return this;
  }

  throw new Error('Maximum retry limit reached or no error information available');
};

// Instance method to cancel scheduled message
autoMessageSchema.methods.cancel = async function () {
  if (this.status === 'scheduled' || this.status === 'queued') {
    this.status = 'cancelled';
    await this.save();
    return this;
  }

  throw new Error('Cannot cancel message that is already sent or failed');
};



// Pre-save middleware for validation
autoMessageSchema.pre('save', function (next) {
  // Ensure sendDate is not in the past for new scheduled messages
  if (this.isNew && this.status === 'scheduled' && this.sendDate < new Date()) {
    this.sendDate = new Date(Date.now() + 60000); // Schedule for 1 minute from now
  }

  // Ensure sender and receiver are different
  if (this.sender.equals(this.receiver)) {
    return next(new Error('Sender and receiver cannot be the same'));
  }

  next();
});

const AutoMessage = mongoose.model('AutoMessage', autoMessageSchema);

export default AutoMessage; 