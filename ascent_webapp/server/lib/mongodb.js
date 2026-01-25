import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  const error = new Error('MONGODB_URI environment variable is not set');
  error.code = 'MONGODB_URI_MISSING';
  throw error;
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
  // For Vercel serverless, use shorter timeouts to avoid function timeout
  const isVercel = process.env.VERCEL === '1';
  const opts = {
    bufferCommands: false,
    serverSelectionTimeoutMS: isVercel ? 10000 : 30000, // Shorter timeout for Vercel
    socketTimeoutMS: isVercel ? 20000 : 45000,
    connectTimeoutMS: isVercel ? 10000 : 30000,
    maxPoolSize: isVercel ? 5 : 10, // Smaller pool for serverless
    minPoolSize: 0, // No minimum for serverless (cold starts)
    // Retry configuration
    retryWrites: true,
    retryReads: true,
    // DNS resolution options
    family: 4, // Force IPv4 (sometimes helps with DNS issues)
  };

  cached.promise = mongoose.connect(MONGODB_URI, opts)
    .then((mongoose) => {
      cached.conn = mongoose;
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ MongoDB connected');
      }
      return mongoose;
    })
    .catch((error) => {
      cached.promise = null;
      
      // Handle authentication errors
      if (error.message?.includes('bad auth') || 
          error.message?.includes('authentication failed') ||
          error.code === 8000) {
        const helpfulError = new Error('MongoDB authentication failed');
        helpfulError.code = 'MONGODB_AUTH_FAILED';
        throw helpfulError;
      }
      
      // Handle connection errors
      if (error.code === 'ECONNREFUSED' || error.message?.includes('querySrv')) {
        const helpfulError = new Error('Cannot connect to MongoDB');
        helpfulError.code = 'MONGODB_CONNECTION_FAILED';
        throw helpfulError;
      }
      
      throw error;
    });

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;

