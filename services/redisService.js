import Redis from 'redis';

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = Redis.createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
      });

      this.client.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        console.error('Redis connection error:', err);
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.isConnected = false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  // Online user tracking
  async addOnlineUser(userId) {
    try {
      await this.client.sAdd('online_users', userId);
      await this.client.set(`user_last_seen:${userId}`, new Date().toISOString());
      return true;
    } catch (error) {
      console.error('Redis addOnlineUser error:', error);
      return false;
    }
  }

  async removeOnlineUser(userId) {
    try {
      await this.client.sRem('online_users', userId);
      await this.client.set(`user_last_seen:${userId}`, new Date().toISOString());
      return true;
    } catch (error) {
      console.error('Redis removeOnlineUser error:', error);
      return false;
    }
  }

  async getOnlineUsers() {
    try {
      return await this.client.sMembers('online_users');
    } catch (error) {
      console.error('Redis getOnlineUsers error:', error);
      return [];
    }
  }

  async getOnlineUserCount() {
    try {
      return await this.client.sCard('online_users');
    } catch (error) {
      console.error('Redis getOnlineUserCount error:', error);
      return 0;
    }
  }

  async isUserOnline(userId) {
    try {
      return await this.client.sIsMember('online_users', userId);
    } catch (error) {
      console.error('Redis isUserOnline error:', error);
      return false;
    }
  }

  // Conversation cache management
  async cacheConversation(conversationId, data, ttl = 3600) {
    try {
      await this.client.setEx(`conversation:${conversationId}`, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Redis cacheConversation error:', error);
      return false;
    }
  }



  async addToBlacklist(tokenId, expiresAt) {
    try {
      const ttl = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await this.client.setEx(`blacklist:${tokenId}`, ttl, 'blacklisted');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Redis addToBlacklist error:', error);
      return false;
    }
  }

  async isTokenBlacklisted(tokenId) {
    try {
      const result = await this.client.get(`blacklist:${tokenId}`);
      return result !== null;
    } catch (error) {
      console.error('Redis isTokenBlacklisted error:', error);
      return false;
    }
  }

  async removeFromBlacklist(tokenId) {
    try {
      await this.client.del(`blacklist:${tokenId}`);
      return true;
    } catch (error) {
      console.error('Redis removeFromBlacklist error:', error);
      return false;
    }
  }


  async blacklistUserTokens(userId, expiresAt) {
    try {
      const ttl = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await this.client.setEx(`user_blacklist:${userId}`, ttl, 'blacklisted');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Redis blacklistUserTokens error:', error);
      return false;
    }
  }

  async isUserTokensBlacklisted(userId) {
    try {
      const result = await this.client.get(`user_blacklist:${userId}`);
      return result !== null;
    } catch (error) {
      console.error('Redis isUserTokensBlacklisted error:', error);
      return false;
    }
  }
}

// Singleton instance
const redisService = new RedisService();

export default redisService; 