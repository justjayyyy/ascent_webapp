#!/bin/bash
# Vercel Deployment Script

echo "🚀 Starting Vercel deployment..."

# Check if user is logged in
if ! npx vercel whoami &>/dev/null; then
  echo "❌ Not logged in to Vercel. Please run: npx vercel login"
  echo "   This will open a browser window for authentication."
  exit 1
fi

echo "✅ Logged in to Vercel"
echo "📦 Building and deploying to production..."

# Deploy to production
npx vercel --prod --yes

echo ""
echo "✅ Deployment complete!"
echo "🌐 Your app should be live at: https://ascentwebapp.vercel.app"
