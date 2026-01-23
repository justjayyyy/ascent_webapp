import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  // Check if already connected
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // If connection is in progress, wait for it
  if (cached.promise) {
    try {
      cached.conn = await cached.promise;
      return cached.conn;
    } catch (e) {
      cached.promise = null;
      // Fall through to create new connection
    }
  }

  // Create new connection
  const opts = {
    bufferCommands: false,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 1,
  };

  cached.promise = mongoose.connect(MONGODB_URI, opts)
    .then((mongoose) => {
      cached.conn = mongoose;
      return mongoose;
    })
    .catch((error) => {
      console.error('MongoDB connection error:', error.message);
      cached.promise = null;
      throw error;
    });

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    // Provide more helpful error message
    if (e.message && (e.message.includes('SSL') || e.message.includes('TLS'))) {
      const helpfulError = new Error('MongoDB connection failed: SSL/TLS error. Please check your IP is whitelisted in MongoDB Atlas Network Access.');
      helpfulError.originalError = e;
      throw helpfulError;
    }
    throw e;
  }

  return cached.conn;
}

export default connectDB;

