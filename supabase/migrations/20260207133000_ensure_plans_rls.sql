-- Reinforce RLS for PLANS table to ensure users can save their generated plans
-- This fixes the "Missing Brain" bug where plans fail to save silently due to permission issues.

-- 1. Ensure RLS is enabled
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing insert policy to avoid conflicts/duplicates
DROP POLICY IF EXISTS "Users can insert their own plan" ON public.plans;
DROP POLICY IF EXISTS "Authenticated users can insert plans" ON public.plans;

-- 3. Re-create the Insert Policy with explicit permission
-- "Check" ensures the user_id in the row matches the authenticated user's ID
CREATE POLICY "Authenticated users can insert plans"
ON public.plans
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 4. Ensure Select Policy exists for the new architecture
DROP POLICY IF EXISTS "Users can view their own plan" ON public.plans;
CREATE POLICY "Users can view their own plan"
ON public.plans
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 5. Ensure Update Policy exists (for Payment Webhooks / marking as paid)
-- Webhooks use Service Role (bypasses RLS), but if User needs to update anything:
DROP POLICY IF EXISTS "Users can update their own plan" ON public.plans;
CREATE POLICY "Users can update their own plan"
ON public.plans
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);
