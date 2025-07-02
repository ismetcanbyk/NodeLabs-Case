import express from 'express';
import Conversation from '../models/Conversation.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();


router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;

    const conversations = await Conversation.findUserConversations(
      req.user._id,
      parseInt(limit),
      parseInt(skip)
    );

    res.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router; 