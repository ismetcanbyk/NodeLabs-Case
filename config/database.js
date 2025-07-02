import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nodelabs';
    console.log('Attempting to connect to MongoDB...');

    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // 5 second timeout
      connectTimeoutMS: 10000, // 10 second timeout
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection error:', error.message);

    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Continuing without MongoDB - API will have limited functionality');
    } else {
      console.log('Production mode: MongoDB is required');
      process.exit(1);
    }
  }
};

export default connectDB; 