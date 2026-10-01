import mongoose from 'mongoose';

// Queries made without a connection fail at once instead of waiting 10 s in Mongoose's buffer.
// Every handler awaits connectDB() before touching a model.
mongoose.set('bufferCommands', false);

// One connection per server instance, reused across warm serverless invocations
const cached = (globalThis.__ascentMongo ??= { conn: null, promise: null });

function friendly(error) {
  const message = error?.message || '';
  if (message.includes('bad auth') || message.includes('authentication failed') || error?.code === 8000) {
    return Object.assign(new Error('MongoDB authentication failed'), { code: 'MONGODB_AUTH_FAILED' });
  }
  if (error?.code === 'ECONNREFUSED' || message.includes('querySrv') || error?.name === 'MongooseServerSelectionError') {
    return Object.assign(new Error('Cannot connect to MongoDB'), { code: 'MONGODB_CONNECTION_FAILED' });
  }
  return error;
}

export async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw Object.assign(new Error('MONGODB_URI environment variable is not set'), { code: 'MONGODB_CONNECTION_FAILED' });

  // A connection that was made and later closed (not just reconnecting) has to be opened again
  if (cached.promise && mongoose.connection.readyState === 0) cached.promise = null;
  if (!cached.promise) {
    const serverless = process.env.VERCEL === '1';
    cached.promise = mongoose
      .connect(uri, {
        bufferCommands: false,
        serverSelectionTimeoutMS: serverless ? 10000 : 30000,
        socketTimeoutMS: serverless ? 20000 : 45000,
        connectTimeoutMS: serverless ? 10000 : 30000,
        maxPoolSize: serverless ? 5 : 10,
        minPoolSize: 0,
        retryWrites: true,
        retryReads: true,
        family: 4,
      })
      .catch((error) => {
        cached.promise = null;
        throw friendly(error);
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
