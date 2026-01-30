# 🚀 Frontend Deployment Guide

So far, we have been deploying **Edge Functions** (Backend) using `deploy-functions.ps1`.
However, your **User Interface** (Frontend) lives on a separate hosting provider (like Vercel or Netlify), which is connected to your GitHub repository.

## The Problem
You verified that valid fixes (UI revert, Legal page) were working locally, but they weren't showing up online. 
**Reason:** Your local code changes haven't been "Pushed" to GitHub yet. The hosting provider only rebuilds the site when it sees new code on GitHub.

## The Fix: Trigger a Deploy

To update your live website, you simply need to push your local commits to the cloud.

### Option 1: Using Terminal (Recommended)
1. Open your terminal in the project folder.
2. Run:
   ```bash
   git push origin main
   ```
3. Wait 1-2 minutes. Your hosting provider (Vercel/Netlify) will automatically detect the change, rebuild the site, and publish it.

### Option 2: Manual Upload (If not using Git)
1. Run build command locally:
   ```bash
   npm run build
   ```
2. This creates a `dist` folder.
3. Drag and drop the `dist` folder into your hosting dashboard (Netlify Drop / Vercel CLI).

## Verification
1. Go to your live URL.
2. Hard refresh the page (`Ctrl + Shift + R` or `Cmd + Shift + R`) to clear cache.
3. You should see the updated UI and the new "Legal" links in the footer.
