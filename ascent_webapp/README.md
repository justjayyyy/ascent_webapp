# Ascent - Personal Finance Tracker

A comprehensive personal finance management application built with React and Node.js.

## Features

- 📊 **Portfolio Management** - Track investment accounts, positions, and performance
- 💰 **Expense Tracking** - Monitor income and expenses with categories and budgets
- 📈 **Dashboard** - Visual overview with customizable widgets
- 🎯 **Financial Goals** - Set and track progress toward financial goals
- 👥 **Shared Access** - Invite others to view your financial data
- 🌙 **Dark/Light Theme** - Choose your preferred appearance
- 🌍 **Multi-language** - Support for English, Hebrew, and Russian

## Tech Stack

- **Frontend**: React, Vite, TailwindCSS, Radix UI
- **Backend**: Node.js, Vercel Serverless Functions
- **Database**: MongoDB
- **Auth**: JWT-based authentication

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or MongoDB Atlas)

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd ascent_webapp
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/ascent

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@ascent.app

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173
```

4. Start development:
```bash
# Start frontend
npm run dev

# In another terminal, if running API locally
npm run dev:api
```

## Deployment to Vercel

1. Push your code to GitHub

2. Connect your repo to Vercel

3. Add environment variables in Vercel dashboard:
   - `MONGODB_URI` - Your MongoDB Atlas connection string
   - `JWT_SECRET` - A secure random string
   - Other optional variables as needed

4. Deploy!

## Project Structure

```
├── api/                    # Vercel serverless functions
│   ├── auth/              # Authentication endpoints
│   ├── entities/          # CRUD endpoints for all entities
│   ├── integrations/      # Email, file upload, etc.
│   ├── lib/               # Shared utilities
│   ├── middleware/        # Auth middleware
│   └── models/            # MongoDB schemas
├── src/
│   ├── api/               # Frontend API client
│   ├── components/        # React components
│   ├── hooks/             # Custom hooks
│   ├── lib/               # Utilities and context
│   ├── pages/             # Page components
│   └── utils/             # Helper functions
└── public/                # Static assets
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/me` - Update user profile

### Entities
All entities support: `GET` (list/filter), `POST` (create), `PUT` (update), `DELETE`

- `/api/entities/accounts`
- `/api/entities/positions`
- `/api/entities/day-trades`
- `/api/entities/transactions`
- `/api/entities/budgets`
- `/api/entities/categories`
- `/api/entities/cards`
- `/api/entities/goals`
- `/api/entities/dashboard-widgets`
- `/api/entities/page-layouts`
- `/api/entities/shared-users`
- `/api/entities/snapshots`

## License

MIT
