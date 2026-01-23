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
import app from '../server/server.js';

// Vercel serverless function handler
// Express app is already configured to handle all routes
export default app;
