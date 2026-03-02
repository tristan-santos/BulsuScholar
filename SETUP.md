# BulsuScholar - Setup & Configuration Guide

## Overview of Changes

This project has been updated to use **ImageBB** as the image storage solution instead of Firebase Storage. This approach is cost-effective and keeps your Firebase storage quota available for other uses.

## Key Changes Made

### 1. Secured API Keys (Environment Variables)
- All sensitive configuration is now stored in `.env` file
- `.env` is excluded from Git (see `.gitignore`)
- Use `.env.example` as a template for new deployments

### 2. ImageBB Integration
- COR (Certificate of Registration) file uploads now use **ImageBB API**
- Upload functionality moved to `src/services/imageBBService.js`
- Admin dashboard automatically displays images from ImageBB URLs

### 3. Firebase Configuration
- Firebase config now uses environment variables instead of hardcoded values
- Safer for production deployments

## Setup Instructions

### Step 1: Get ImageBB API Key

1. Visit [https://imgbb.com/api](https://imgbb.com/api)
2. Sign up for a free account (if you don't have one)
3. Go to your account dashboard: [https://imgbb.com/dashboard](https://imgbb.com/dashboard)
4. Copy your API key

### Step 2: Configure Environment Variables

1. Open `.env` file in the root directory
2. Replace `your_imagebb_api_key_here` with your actual ImageBB API key:
   ```
   VITE_IMAGEBB_API_KEY=your_actual_api_key_here
   ```
3. Verify other environment variables match your Firebase project settings
4. Never commit `.env` file to Git

### Step 3: Test the Setup

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Try signing up a student account
3. Upload a COR file in Step 4 of the signup form
4. Verify the image appears when the admin previews it

## File Structure

```
src/
├── services/
│   └── imageBBService.js    # ImageBB upload utility
└── pages/
    ├── SignupPage.jsx       # Uses ImageBB for COR uploads
    └── AdminDashboard.jsx   # Displays ImageBB URLs (no changes needed)

firebase.js                    # Now uses environment variables

.env                          # Your local configuration (never commit)
.env.example                  # Template for new setups
```

## How It Works

### Student Registration (SignupPage.jsx)
1. Student uploads a COR file
2. `uploadToImageBB()` sends file to ImageBB API
3. ImageBB returns a permanent URL and delete URL
4. Only the URL is stored in Firebase Firestore
5. No large files stored in Firebase Storage

### Admin Preview (AdminDashboard.jsx)
1. Admin clicks "Preview" on a pending student
2. System retrieves the ImageBB URL from Firestore
3. Image is displayed directly from ImageBB
4. No changes needed to AdminDashboard code

## Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase authentication | `AIzaS...` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | `bulsuscholar` |
| `VITE_IMAGEBB_API_KEY` | ImageBB upload API key | `abc123...` |
| `VITE_PASSWORD_SECRET` | Password encryption secret | Must be ≥32 chars |

## Troubleshooting

### "ImageBB API key not configured"
- Check `.env` file exists in project root
- Verify `VITE_IMAGEBB_API_KEY` is set and not empty
- Restart development server after changing `.env`

### Upload fails with "Failed to upload image to ImageBB"
- Verify API key is correct (from imgbb.com dashboard)
- Check file size (ImageBB has size limits)
- Check internet connection
- Check browser console for detailed error

### Environment variables not loading
- Vite reads `.env` files only at startup
- Stop dev server and run `npm run dev` again
- Variables must start with `VITE_` to be exposed to client-side code

## Security Best Practices

1. **Never commit `.env` file** - It contains API keys
2. **Use `.env.example`** - Share this with team, they fill in their own values
3. **Rotate ImageBB API key** - If compromised, regenerate from imgbb.com
4. **Different keys per environment** - Use different ImageBB accounts for dev/production
5. **Secure CI/CD** - Set environment variables in CI/CD system secrets, not in repo

## Production Deployment

1. Set environment variables in your deployment platform:
   - Vercel/Netlify: Project Settings → Environment Variables
   - Firebase Hosting: Create new `.env` for production
   - Docker: Pass via environment or .env file during build

2. Ensure `.env` file is NOT uploaded to version control

3. Test all uploads in production environment

## Reverting to Firebase Storage (if needed)

If you need to revert to Firebase Storage for COR files:

1. In `SignupPage.jsx`, restore Firebase storage imports:
   ```js
   import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
   ```

2. Replace `uploadToImageBB()` with original Firebase storage code

3. Update `corFilePayload` to include `path` field

Existing ImageBB URLs in database will continue to work.

## Support

For issues with:
- **ImageBB**: Visit [https://imgbb.com/support](https://imgbb.com/support)
- **Firebase**: Visit [https://firebase.google.com/support](https://firebase.google.com/support)
- **This Project**: Check the README.md or project documentation
