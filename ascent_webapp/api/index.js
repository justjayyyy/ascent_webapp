// Vercel serverless entry: the whole API is one Express app (server/server.js).
// Route handlers are loaded with import() when first used. In production Vercel's bundler did not
// always follow those into node_modules (/api/ingest/wallet failed with "Cannot find package
// 'web-push'"), so every package a handler needs is also listed here, where it is certain to be seen.
import 'mongoose';
import 'bcryptjs';
import 'jsonwebtoken';
import 'nodemailer';
import 'express';
import 'cors';
import 'web-push';
import '@simplewebauthn/server';
import '@anthropic-ai/sdk';
import '@anthropic-ai/sdk/helpers/beta/zod';
import 'zod';
import app from '../server/server.js';

export default app;
