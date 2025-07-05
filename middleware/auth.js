import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import redisService from '../services/redisService.js';

// JWT token'dan unique ID oluştur
const generateTokenId = (token) => {
  try {
    const decoded = jwt.decode(token);
    // userId + iat (issued at) kombinasyonu ile unique ID oluştur
    return `${decoded.userId}_${decoded.iat}`;
  } catch (error) {
    return null;
  }
};

// Protect routes middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Token'ı verify et
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Token blacklist kontrolü
    const tokenId = generateTokenId(token);
    if (tokenId) {
      const isBlacklisted = await redisService.isTokenBlacklisted(tokenId);
      if (isBlacklisted) {
        return res.status(401).json({ error: 'Token has been revoked' });
      }

      // Kullanıcının tüm token'ları blacklist kontrolü
      const isUserBlacklisted = await redisService.isUserTokensBlacklisted(decoded.userId);
      if (isUserBlacklisted) {
        return res.status(401).json({ error: 'All user tokens have been revoked' });
      }
    }

    // Check if user still exists
    const currentUser = await User.findById(decoded.userId);
    if (!currentUser) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    // Check if user is active
    if (!currentUser.isActive) {
      return res.status(401).json({ error: 'User account is deactivated' });
    }

    // Grant access to protected route
    req.user = {
      userId: currentUser._id,
      username: currentUser.username,
      tokenId: tokenId,
      tokenExp: decoded.exp
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export default authenticateToken;



