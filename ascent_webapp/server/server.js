// Local development server for API
import 'dotenv/config';
// Import all dependencies early to ensure Vercel bundles them
// This ensures Vercel's static analysis includes all required packages
import 'mongoose';
import 'bcryptjs';
import 'jsonwebtoken';
import 'nodemailer';
import 'googleapis';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { rateLimit } from './lib/rateLimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// Security middleware - CORS for Vercel
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null,
  'https://ascentwebapp.vercel.app',
  'https://ascentwebapp-*.vercel.app', // Pattern for preview deployments
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // In development, allow all localhost origins
    if (process.env.NODE_ENV === 'development' || origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // Check if origin matches any allowed origin exactly
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check if origin matches Vercel pattern (for preview deployments)
    if (origin.includes('vercel.app')) {
      // Allow any *.vercel.app subdomain
      if (origin.match(/^https:\/\/[\w-]+\.vercel\.app$/)) {
        return callback(null, true);
      }
      // Allow the main vercel.app domain
      if (origin === 'https://ascentwebapp.vercel.app') {
        return callback(null, true);
      }
    }
    
    // Check if origin contains any allowed origin (fallback)
    const isAllowed = allowedOrigins.some(allowed => {
      if (!allowed) return false;
      // Exact match
      if (origin === allowed) return true;
      // Substring match (for preview deployments)
      if (allowed.includes('*') && origin.match(new RegExp(allowed.replace(/\*/g, '.*')))) {
        return true;
      }
      // Contains match
      if (origin.includes(allowed.replace('https://', '').replace('http://', ''))) {
        return true;
      }
      return false;
    });
    
    if (isAllowed) {
      return callback(null, true);
    }
    
    // In production on Vercel, be more permissive with vercel.app domains
    if (process.env.VERCEL === '1' && origin.includes('vercel.app')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parser with size limit - must be before routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Rate limiting for all API routes
app.use('/api', (req, res, next) => {
  if (rateLimit(req, res)) return;
  next();
});

// Helper to convert Vercel handler to Express route
function wrapHandler(handlerPath) {
  return async (req, res) => {
    try {
      const handlerUrl = new URL(handlerPath, import.meta.url).href;
      const module = await import(handlerUrl);
      const handler = module.default;
      
      if (typeof handler !== 'function') {
        return res.status(500).json({ 
          success: false, 
          error: 'Handler not found'
        });
      }
      
      // Add query params from Express to req.query
      req.query = { ...req.query, ...req.params };
      
      await handler(req, res);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[Server] Handler Error ${handlerPath}:`, error.message);
      }
      
      // Only send response if headers haven't been sent
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error', 
          message: error.message
        });
      }
    }
  };
}

// Auth routes
app.post('/api/auth/register', wrapHandler('./auth/register.js'));
app.post('/api/auth/login', wrapHandler('./auth/login.js'));
app.post('/api/auth/google', wrapHandler('./auth/google.js'));
app.get('/api/auth/me', wrapHandler('./auth/me.js'));
app.put('/api/auth/me', wrapHandler('./auth/me.js'));
app.patch('/api/auth/me', wrapHandler('./auth/me.js'));
app.options('/api/auth/*', (req, res) => res.sendStatus(200));

// Entity routes - generic handler
const entities = [
  'accounts', 'positions', 'day-trades', 'transactions',
  'budgets', 'categories', 'cards', 'goals',
  'dashboard-widgets', 'page-layouts', 'shared-users', 'snapshots', 'notes',
  'portfolio-transactions'
];

entities.forEach(entity => {
  const handlerPath = `./entities/${entity}.js`;
  app.get(`/api/entities/${entity}`, wrapHandler(handlerPath));
  app.post(`/api/entities/${entity}`, wrapHandler(handlerPath));
  app.put(`/api/entities/${entity}`, wrapHandler(handlerPath));
  app.patch(`/api/entities/${entity}`, wrapHandler(handlerPath));
  app.delete(`/api/entities/${entity}`, wrapHandler(handlerPath));
  app.options(`/api/entities/${entity}`, (req, res) => res.sendStatus(200));
});

// Integration routes
app.post('/api/integrations/send-email', wrapHandler('./integrations/send-email.js'));
app.post('/api/integrations/upload-file', wrapHandler('./integrations/upload-file.js'));
app.get('/api/integrations/stock-quote', wrapHandler('./integrations/stock-quote.js'));

// Google Calendar routes
const googleCalendarHandler = wrapHandler('./integrations/google-calendar.js');
app.get('/api/integrations/google-calendar', googleCalendarHandler);
app.post('/api/integrations/google-calendar', googleCalendarHandler);
app.put('/api/integrations/google-calendar', googleCalendarHandler);
app.delete('/api/integrations/google-calendar', googleCalendarHandler);

app.options('/api/integrations/*', (req, res) => res.sendStatus(200));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MongoDB connection test endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const connectDB = (await import('./lib/mongodb.js')).default;
    await connectDB();
    res.json({ status: 'ok', message: 'MongoDB connection successful' });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      message: error.message,
      code: error.code 
    });
  }
});

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 API server running on http://localhost:${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  });
}

// Export for Vercel serverless functions
export default app;

