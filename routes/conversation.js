import express from 'express';
import Conversation from '../models/Conversation.js';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();


router.get('/', authenticateToken, async (req, res) => {
  try {
    const conversations = await Conversation.findUserConversations(req.user.userId);

    res.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router; 