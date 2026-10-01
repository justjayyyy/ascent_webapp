// Vercel serverless entry: the whole API is one Express app (server/server.js). Route handlers are
// loaded with literal import() paths, which Vercel's bundler follows.
import app from '../server/server.js';

export default app;
