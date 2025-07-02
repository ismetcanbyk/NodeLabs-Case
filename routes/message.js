import express from 'express';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();


router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { receiverId, content, conversationId } = req.body;

    let conversation;

    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
    } else if (receiverId) {
      conversation = await Conversation.createOrGet([req.user._id, receiverId]);
    }

    if (!conversation) {
      return res.status(400).json({ error: 'Conversation not found or invalid' });
    }

    const message = new Message({
      conversation: conversation._id,
      sender: req.user._id,
      content: { text: content },
      messageType: 'text'
    });

    await message.save();
    await message.populate('sender', 'username profile.firstName profile.lastName profile.avatar');

    // Update conversation last message
    conversation.lastMessage = message._id;
    conversation.lastMessageTime = new Date();
    conversation.totalMessages += 1;
    await conversation.save();

    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.get('/:conversationId', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const messages = await Message.findConversationMessages(
      conversationId,
      parseInt(limit),
      parseInt(skip)
    );

    res.json({
      success: true,
      data: messages.reverse() // Return in chronological order
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.put('/:messageId/read', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await message.markAsRead(req.user._id);

    res.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router; 