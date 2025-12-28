
# DietlyPlans - AI Meal Planner

## Payment Provider Note
**Current Provider: Dodo Payments (Merchant of Record)**

The app uses Dodo Payments to handle transactions and compliance for digital goods.

### Workflow:
1. **Checkout:** Frontend calls `create-dodo-checkout` Edge Function to generate a secure payment link with the `user_id` attached as metadata.
2. **Success:** User is redirected back to the app (`?success=true`) for immediate optimistic unlocking.
3. **Webhook:** Dodo Payments hits `dodo-webhook` with `payment.succeeded` event to permanently unlock the database record.

### Configuration:
You must set the following secrets in your Supabase Edge Functions:
- `DODO_API_KEY`: Your private API key from Dodo Dashboard.
- `DODO_PRODUCT_ID`: The ID of the product you created in Dodo.

## Setup
1. Copy `.env.example` to `.env`.
2. Deploy functions: 
   ```bash
   npx supabase functions deploy create-dodo-checkout
   npx supabase functions deploy dodo-webhook
   ```
