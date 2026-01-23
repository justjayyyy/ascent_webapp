# Login and Data Fetching Flow Explanation

## When a User Logs In

### 1. Google OAuth Login Process

```
User clicks "Sign in with Google"
  ↓
Google OAuth flow completes
  ↓
Frontend calls: POST /api/auth/google
  Body: { accessToken: "...", clientId: "...", userInfo: {...} }
  ↓
Backend verifies Google token and creates/finds user in MongoDB
  ↓
Backend returns: { user: {...}, token: "jwt_token" }
  ↓
Frontend stores token in localStorage
  ↓
Frontend sets user in AuthContext
```

### 2. What User Object Contains

After login, the `user` object from backend contains:
```javascript
{
  _id: "693ad2549eba1ab7c7806fcd",  // MongoDB ObjectId
  email: "meresidijenia94@gmail.com",
  full_name: "jenia meresidi",
  role: "user",
  language: "en",
  theme: "dark",
  currency: "USD",
  // ... other fields
}
```

### 3. What Happens When Portfolio Page Loads

```
Portfolio component mounts
  ↓
useQuery hook runs with queryKey: ['accounts', user._id, user.email]
  ↓
queryFn executes: ascent.entities.Account.list()
  ↓
Frontend makes GET request: /api/entities/accounts?sort=-created_date&limit=1000
  Headers: { Authorization: "Bearer jwt_token" }
  ↓
Backend receives request
```

### 4. Backend Authentication Flow

```
Request arrives at: /api/entities/accounts
  ↓
authMiddleware extracts token from Authorization header
  ↓
authMiddleware verifies JWT token
  ↓
authMiddleware decodes token to get userId
  ↓
authMiddleware fetches user from MongoDB: User.findById(userId)
  ↓
authMiddleware returns user object (with email field)
  ↓
entityHandler receives authenticated user
```

### 5. Backend Query Execution

```
entityHandler builds MongoDB query:
  Query: {
    created_by: {
      $regex: "^meresidijenia94@gmail.com$",
      $options: "i"  // case-insensitive
    }
  }
  ↓
MongoDB executes: Account.find(query)
  ↓
MongoDB returns accounts where created_by matches user.email
  ↓
Backend returns: { success: true, data: [...] }
```

## The Problem

Based on your logs:
- **Frontend logs**: "Fetched accounts from backend: 0 []"
- **Backend should be logging**: But we're not seeing backend logs

This means either:
1. **Backend query isn't finding accounts** - The `created_by` field in MongoDB doesn't match `user.email`
2. **User email mismatch** - The email used during account creation is different from the email in the authenticated user
3. **MongoDB query issue** - The regex query isn't working correctly

## How to Debug

### Check Backend Logs in Vercel:

1. Go to: https://vercel.com/daniels-projects-afac8505/ascent_webapp
2. Click on latest deployment
3. Go to "Functions" → "api/index.js" → "Logs"
4. Look for logs starting with `[EntityHandler]`

### What to Look For:

When you create an account, you should see:
```
[EntityHandler] Creating Account for user: meresidijenia94@gmail.com
[EntityHandler] Item data with created_by: meresidijenia94@gmail.com
[EntityHandler] Successfully created Account: 697274d6b00595a9f26aeba0
[EntityHandler] Created item created_by: meresidijenia94@gmail.com
[EntityHandler] Verified saved item created_by: meresidijenia94@gmail.com
```

When you fetch accounts, you should see:
```
[EntityHandler] GET Account: Filtering by created_by = meresidijenia94@gmail.com
[EntityHandler] GET Account: Query: {"created_by":{"$regex":"^meresidijenia94@gmail.com$","$options":"i"}}
[EntityHandler] GET Account: User email: meresidijenia94@gmail.com
[EntityHandler] GET Account: Found 0 items
[EntityHandler] GET Account: Total items in collection: X
[EntityHandler] GET Account: Sample item created_by: <some_email>
[EntityHandler] GET Account: Looking for: meresidijenia94@gmail.com
[EntityHandler] GET Account: Match (case-insensitive): true/false
```

## Possible Issues

### Issue 1: Email Case Mismatch
- Account created with: `Meresidijenia94@gmail.com`
- User email is: `meresidijenia94@gmail.com`
- **Solution**: Regex should handle this, but verify

### Issue 2: Email Format Difference
- Account created with: `meresidijenia94@gmail.com`
- User email is: `meresidijenia94@Gmail.com` (different case in domain)
- **Solution**: Regex should handle this

### Issue 3: Token Not Sent
- Frontend not sending Authorization header
- **Check**: Network tab → Request Headers → Authorization

### Issue 4: User Not Authenticated
- authMiddleware returns null
- **Check**: Backend logs for "No token provided" or "Invalid token"

## Next Steps

1. **Check Vercel function logs** - See what the backend is actually doing
2. **Check MongoDB directly** - Verify accounts exist and their `created_by` field
3. **Check Network tab** - Verify Authorization header is being sent
4. **Compare emails** - Make sure the email in the user object matches the email in `created_by` field
