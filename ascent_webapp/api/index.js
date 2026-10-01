// Vercel serverless function entry point
// Import all dependencies explicitly to ensure Vercel bundles them
// This ensures Vercel's static analysis includes all required packages
import 'mongoose';
import 'bcryptjs';
import 'jsonwebtoken';
import 'nodemailer';
import 'googleapis';
import 'express';
import 'cors';
// Route handlers are loaded with a dynamic import() in server.js, which the
// bundler can't follow, so anything they use has to be listed here too.
import 'web-push';
import '@simplewebauthn/server';
import '@anthropic-ai/sdk';
import '@anthropic-ai/sdk/helpers/beta/zod';
import 'zod';
import app from '../server/server.js';

// Vercel serverless function handler
// Express app is already configured to handle all routes
export default app;
