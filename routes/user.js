import express from 'express';
import User from '../models/User.js';


const router = express.Router();

router.get('/list', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


export default router;