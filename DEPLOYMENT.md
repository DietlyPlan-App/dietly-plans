# 🚀 DietlyPlans Deployment Guide

This guide explains how to deploy your "Edge Functions" (Backend Logic) and "Webhooks" (Payment Verification) to the live cloud.

## 1. Prerequisites

Ensure your `.env.local` file contains the correct production keys:
- `SUPABASE_PROJECT_ID` (should match your cloud project)
- `LIVE_DODO_API_KEY` (from Dodo Dashboard -> Developer -> API Keys)
- `DEPLOY_ENV="live"` (Set this to "live" when ready for real money)

## 2. Deploy Functions (Back-end)

We have a script that handles everything (authentication, secrets upload, and function deployment).

1. Open PowerShell in the project directory: `f:\CODE\Apps\Diet App`
2. Run the script:
   ```powershell
   .\deploy-functions.ps1
   ```
3. A browser window will open. Login to Supabase to authorize the CLI.
4. Watch the output based on "MODE".
   - If it says `MODE: 🧪 SANDBOX TEST`, it is using Test keys.
   - If it says `MODE: 🚀 LIVE PRODUCTION`, it is using Real keys.

## 3. Configure Payment Webhook

Once the script finishes, you need to tell Dodo Payments where to send success notifications.

1. Go to your **Dodo Payments Dashboard** (https://app.dodopayments.com).
2. Navigate to **Developers -> Webhooks**.
3. Click **"Add Endpoint"**.
4. Enter your Supabase Function URL:
   ```
   https://[YOUR_PROJECT_ID].supabase.co/functions/v1/dodo-webhook
   ```
   *(Replace `[YOUR_PROJECT_ID]` with `zoedktjgvsbtoiqnmjml` or checking Supabase Dashboard -> Edge Functions).*
5. Select Event: `payment.succeeded`.
6. Save.

## 4. Verification

1. **Test Payment Flow**:
   - Go to your published app URL (or localhost).
   - Complete the wizard.
   - Click "Get Full Access" ($29.99).
   - Verify it redirects to Dodo Checkout.
2. **Test Unlock**:
   - In Test Mode, use Dodo's test card (4242 4242...).
   - Complete purchase.
   - Verify app redirects back and shows "You're In!" modal.

## 5. Troubleshooting

- **500 Error on Checkout?** 
  - Check Supabase Dashboard -> Edge Functions -> `create-dodo-checkout` -> Logs.
  - Likely missing `DODO_API_KEY`. Re-run the deployment script.
- **Plan not unlocking?**
  - Check Supabase Dashboard -> Edge Functions -> `dodo-webhook` -> Logs.
  - Verify if Dodo actually sent the webhook (Dodo Dashboard -> Webhooks -> Delivery History).
