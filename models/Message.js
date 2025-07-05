import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    text: {
      type: String,
      required: true,
      trim: true
    }
  },
  messageType: {
    type: String,
    enum: ['text', 'system', 'auto'],
    default: 'text'
  },
  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  // Read by participants
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  // For automatic messages
  isAutomatic: {
    type: Boolean,
    default: false
  },
  autoMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AutoMessage'
  }
}, {
  timestamps: true
});

// Indexes for better query performance
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, sender: 1 });

// Static method to find conversation messages
messageSchema.statics.findConversationMessages = function (conversationId) {
  return this.find({
    conversation: conversationId
  })
    .populate('sender', 'username profile.firstName profile.lastName profile.avatar')
    .sort({ createdAt: -1 })
};

// Static method to get unread messages for user
messageSchema.statics.getUnreadMessages = function (userId, conversationId) {
  return this.find({
    conversation: conversationId,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId }
  })
    .populate('sender', 'username profile.firstName profile.lastName profile.avatar')
    .sort({ createdAt: 1 });
};

// Instance method to mark as read by user
messageSchema.methods.markAsRead = async function (userId) {
  const alreadyRead = this.readBy.some(read => read.user.equals(userId));

  if (!alreadyRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    await this.save();
  }

  return this;
};

const Message = mongoose.model('Message', messageSchema);

export default Message; 