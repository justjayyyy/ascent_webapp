# Deploy to Vercel

## Quick Deploy

Run the deployment script:
```bash
cd ascent_webapp
./deploy.sh
```

## Manual Deploy

If you need to login first:

1. **Login to Vercel** (if not already logged in):
   ```bash
   npx vercel login
   ```
   This will open a browser window for authentication.

2. **Deploy to production**:
   ```bash
   npx vercel --prod --yes
   ```

## Alternative: Deploy via Git

If you prefer to deploy via Git (automatic deployments on push):

1. **Push your changes to GitHub/GitLab/Bitbucket**:
   ```bash
   git add .
   git commit -m "Fix account creation and improve error handling"
   git push
   ```

2. **Vercel will automatically deploy** if you have it connected to your Git repository.

## What's Being Deployed

- ✅ Frontend (Vite + React) - built and served as static files
- ✅ Backend API (Express) - deployed as serverless function at `/api/*`
- ✅ All recent fixes:
  - Account creation with proper async handling
  - Better error handling for position creation
  - Improved query invalidation
  - Backend logging for debugging

## After Deployment

1. Check your app at: https://ascentwebapp.vercel.app
2. Test account creation - it should work without page refresh
3. Check Vercel function logs if you see any errors
