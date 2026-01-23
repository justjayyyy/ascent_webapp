# Deploying to Vercel

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub/GitLab/Bitbucket**: Your code should be in a Git repository
3. **MongoDB Atlas**: Set up a MongoDB database (or use your existing one)

## Step 1: Prepare Environment Variables

You'll need to set these environment variables in Vercel:

### Required Environment Variables:
- `MONGODB_URI` - Your MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `FRONTEND_URL` - Your Vercel deployment URL (will be set automatically, but you can override)

### Optional Environment Variables:
- `GOOGLE_CLIENT_ID` - For Google OAuth (if using)
- `GOOGLE_CLIENT_SECRET` - For Google OAuth (if using)
- `EMAIL_SERVICE_API_KEY` - For email functionality
- `SUPABASE_URL` - If using Supabase for file storage
- `SUPABASE_KEY` - If using Supabase for file storage

## Step 2: Deploy via Vercel CLI

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Navigate to your project**:
   ```bash
   cd ascent_webapp
   ```

3. **Login to Vercel**:
   ```bash
   vercel login
   ```

4. **Deploy**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project? **No** (first time) or **Yes** (updates)
   - Project name: **ascent-app** (or your preferred name)
   - Directory: **./** (current directory)
   - Override settings? **No**

5. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

## Step 3: Deploy via Vercel Dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **"Add New Project"**
3. Import your Git repository
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `ascent_webapp`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
5. Add environment variables (see Step 1)
6. Click **"Deploy"**

## Step 4: Configure Environment Variables in Vercel

1. Go to your project in Vercel Dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add all required variables:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `FRONTEND_URL` (set to your Vercel URL after first deployment)
   - Any other variables your app needs

## Step 5: Update Frontend URL

After deployment, update the `FRONTEND_URL` environment variable to your Vercel deployment URL:
- Format: `https://your-app-name.vercel.app`

## Step 6: Test Deployment

1. Visit your Vercel deployment URL
2. Test the API: `https://your-app-name.vercel.app/api/health`
3. Test authentication and main features

## Troubleshooting

### API Routes Not Working
- Check that `api/index.js` exists and exports the handler correctly
- Verify `vercel.json` has correct routing configuration
- Check Vercel function logs in the dashboard

### CORS Issues
- Ensure `FRONTEND_URL` is set correctly in Vercel environment variables
- Check that CORS middleware allows your Vercel domain

### MongoDB Connection Issues
- Verify `MONGODB_URI` is set correctly
- Check MongoDB Atlas IP whitelist (allow all IPs: `0.0.0.0/0`)
- Verify MongoDB user has correct permissions

### Build Failures
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version compatibility (Vercel uses Node 20.x)

## Continuous Deployment

Once connected to Git:
- Every push to `main` branch = Production deployment
- Every push to other branches = Preview deployment
- Pull requests = Preview deployment with comments

## Custom Domain

1. Go to **Settings** → **Domains**
2. Add your custom domain
3. Update DNS records as instructed
4. Update `FRONTEND_URL` environment variable

## Notes

- The API runs as serverless functions on Vercel
- Each API request is a separate function invocation
- Cold starts may occur on first request after inactivity
- MongoDB connection is reused across invocations when possible
