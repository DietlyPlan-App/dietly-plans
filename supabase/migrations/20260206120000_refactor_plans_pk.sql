-- Migration: Refactor Plans table for Pay-Per-Plan Architecture
-- goal: Allow multiple plans per user (1:Many) instead of 1:1

-- 1. Drop the existing Primary Key (which currently enforces 1-per-user unique constraint)
-- Note: usage of 'if exists' prevents error if run multiple times
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_pkey') THEN
    ALTER TABLE public.plans DROP CONSTRAINT plans_pkey;
  END IF;
END $$;

-- 2. Add the new ID column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'id') THEN
    ALTER TABLE public.plans ADD COLUMN id UUID DEFAULT gen_random_uuid() NOT NULL;
  END IF;
END $$;

-- 3. Make the new ID the Primary Key
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_pkey') THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- 4. Add Payment ID column for audit (Links to Dodo Payment ID)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'payment_id') THEN
    ALTER TABLE public.plans ADD COLUMN payment_id TEXT;
  END IF;
END $$;

-- 5. Add Index on user_id for fast lookups (since it's no longer the PK)
CREATE INDEX IF NOT EXISTS plans_user_id_idx ON public.plans(user_id);

-- 6. Add Created_At Index for sorting history
CREATE INDEX IF NOT EXISTS plans_created_at_idx ON public.plans(created_at DESC);
