import mongoose from 'mongoose';
import dns from 'dns';
import { promisify } from 'util';
import { exec } from 'child_process';
import { promisify as promisifyUtil } from 'util';

const execAsync = promisifyUtil(exec);

// Configure DNS to use system resolver (helps with SRV record resolution)
dns.setDefaultResultOrder('ipv4first');

const resolveSrv = promisify(dns.resolveSrv);

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

// Helper function to manually resolve SRV and create direct connection
async function getDirectConnectionURI() {
  if (!MONGODB_URI.includes('mongodb+srv://')) {
    return MONGODB_URI;
  }
  
  // Extract cluster name from SRV URI
  // Handle both with and without query parameters: mongodb+srv://user:pass@cluster/db?params or mongodb+srv://user:pass@cluster/db
  const srvMatch = MONGODB_URI.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]+)(?:\?(.+))?/);
  if (!srvMatch) {
    return MONGODB_URI;
  }
  
  const [, username, password, cluster, database, existingQueryString] = srvMatch;
  const srvRecord = `_mongodb._tcp.${cluster}`;
  
  try {
    // Try Node.js DNS resolver first
    const addresses = await resolveSrv(srvRecord);
    const servers = addresses.map(addr => `${addr.name}:${addr.port}`).join(',');
    return buildDirectURI(username, password, servers, database, existingQueryString);
  } catch (nodeErr) {
    try {
      // Fallback: use system's dig command
      const { stdout } = await execAsync(`dig +short SRV ${srvRecord}`);
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      if (lines.length > 0) {
        // Parse dig output: "0 0 27017 hostname."
        const servers = lines.map(line => {
          const parts = line.trim().split(/\s+/);
          const hostname = parts[3].replace(/\.$/, ''); // Remove trailing dot
          const port = parts[2] || '27017';
          return `${hostname}:${port}`;
        }).join(',');
        return buildDirectURI(username, password, servers, database, existingQueryString);
      }
    } catch (digErr) {
      console.error('[MongoDB] Dig command also failed:', digErr.message);
    }
    
    // Final fallback: use known servers from previous dig output
    console.error('[MongoDB] Using hardcoded fallback servers');
    const servers = 'ac-xohwzhi-shard-00-00.rtc2pvp.mongodb.net:27017,ac-xohwzhi-shard-00-01.rtc2pvp.mongodb.net:27017,ac-xohwzhi-shard-00-02.rtc2pvp.mongodb.net:27017';
    return buildDirectURI(username, password, servers, database, existingQueryString);
  }
}

// Helper to build direct connection URI
function buildDirectURI(username, password, servers, database, existingQueryString = null) {
  // Extract query parameters from original URI (if any)
  const params = new URLSearchParams();
  
  // Parse existing query string if provided
  if (existingQueryString) {
    try {
      const existingParams = new URLSearchParams(existingQueryString);
      // Copy all params except appName (can cause issues with direct connection)
      for (const [key, value] of existingParams.entries()) {
        if (key !== 'appName') {
          params.append(key, value);
        }
      }
    } catch (e) {
      console.error('[MongoDB] Error parsing existing query params:', e.message);
    }
  }
  
  // Add required parameters for direct connection (override any existing)
  params.set('tls', 'true');
  params.set('authSource', 'admin');
  params.set('retryWrites', 'true');
  params.set('w', 'majority');
  params.set('directConnection', 'false'); // Allow replica set discovery
  
  // Build direct connection string
  const paramString = params.toString();
  const directURI = `mongodb://${username}:${password}@${servers}/${database}?${paramString}`;
  return directURI;
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
    serverSelectionTimeoutMS: 30000, // Increased timeout
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000, // Add connection timeout
    maxPoolSize: 10,
    minPoolSize: 1,
    // Retry configuration
    retryWrites: true,
    retryReads: true,
    // DNS resolution options
    family: 4, // Force IPv4 (sometimes helps with DNS issues)
  };

  // Try SRV connection first, fallback to direct if it fails
  cached.promise = mongoose.connect(MONGODB_URI, opts)
    .then((mongoose) => {
      cached.conn = mongoose;
      console.log('✅ MongoDB connected successfully');
      return mongoose;
    })
    .catch(async (error) => {
      console.error('MongoDB connection error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      // If SRV connection fails with DNS error, try direct connection
      if ((error.code === 'ECONNREFUSED' || error.message?.includes('querySrv')) && 
          MONGODB_URI.includes('mongodb+srv://')) {
        
        try {
          const directURI = await getDirectConnectionURI();
          // Clear the failed promise
          cached.promise = null;
          // Try direct connection
          cached.promise = mongoose.connect(directURI, opts);
          cached.conn = await cached.promise;
          console.log('✅ MongoDB connected via direct connection');
          return cached.conn;
        } catch (directError) {
          console.error('[MongoDB] Direct connection also failed:', directError.message);
          cached.promise = null;
          const helpfulError = new Error('Cannot connect to MongoDB. Please check: 1) Your internet connection, 2) MongoDB Atlas cluster is running, 3) Network access settings in MongoDB Atlas.');
          helpfulError.originalError = error;
          helpfulError.code = 'MONGODB_CONNECTION_FAILED';
          throw helpfulError;
        }
      }
      
      cached.promise = null;
      
      // Provide more helpful error messages
      if (error.code === 'ECONNREFUSED' || 
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('querySrv')) {
        const helpfulError = new Error('Cannot connect to MongoDB. Please check: 1) Your internet connection, 2) MongoDB Atlas cluster is running, 3) Network access settings in MongoDB Atlas.');
        helpfulError.originalError = error;
        helpfulError.code = 'MONGODB_CONNECTION_FAILED';
        throw helpfulError;
      }
      
      throw error;
    });

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    
    // Provide more helpful error messages
    if (e.code === 'MONGODB_CONNECTION_FAILED') {
      throw e; // Already has helpful message
    }
    
    if (e.message && (e.message.includes('SSL') || e.message.includes('TLS'))) {
      const helpfulError = new Error('MongoDB connection failed: SSL/TLS error. Please check your IP is whitelisted in MongoDB Atlas Network Access.');
      helpfulError.originalError = e;
      throw helpfulError;
    }
    
    if (e.code === 'ECONNREFUSED' || 
        e.message?.includes('ECONNREFUSED') ||
        e.message?.includes('querySrv')) {
      const helpfulError = new Error('Cannot connect to MongoDB database. Please check your internet connection and ensure MongoDB Atlas cluster is running.');
      helpfulError.originalError = e;
      helpfulError.code = 'MONGODB_CONNECTION_FAILED';
      throw helpfulError;
    }
    
    // If error already has MONGODB_CONNECTION_FAILED code, preserve it
    if (e.code === 'MONGODB_CONNECTION_FAILED') {
      throw e;
    }
    
    throw e;
  }

  return cached.conn;
}

export default connectDB;

