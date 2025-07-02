import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageTime: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  conversationType: {
    type: String,
    enum: ['direct'],
    default: 'direct'
  },
  totalMessages: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better query performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageTime: -1 });
conversationSchema.index({ participants: 1, lastMessageTime: -1 });

// Static method to find conversation between specific users
conversationSchema.statics.findBetweenUsers = function (userId1, userId2) {
  return this.findOne({
    participants: {
      $all: [userId1, userId2],
      $size: 2
    },
    conversationType: 'direct',
    isActive: true
  });
};

// Static method to find user's conversations
conversationSchema.statics.findUserConversations = function (userId, limit = 20, skip = 0) {
  return this.find({
    participants: userId,
    isActive: true
  })
    .populate('participants', 'username email profile.firstName profile.lastName profile.avatar')
    .populate('lastMessage')
    .sort({ lastMessageTime: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to create or get conversation between users
conversationSchema.statics.createOrGet = async function (participants) {
  // For direct conversation, check if already exists
  if (participants.length === 2) {
    const existing = await this.findBetweenUsers(participants[0], participants[1]);
    if (existing) {
      return existing;
    }
  }

  // Create new conversation
  const conversationData = {
    participants,
    conversationType: 'direct'
  };

  return await this.create(conversationData);
};

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation; 