-- Migration: Remove Unique Constraint on user_id to allow Multiple Plans
-- Fixes "duplicate key value" error when creating Plan B

DO $$ 
BEGIN
  -- Drop the specific unique constraint if it exists
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_user_id_key') THEN
    ALTER TABLE public.plans DROP CONSTRAINT plans_user_id_key;
  END IF;
  
  -- Double check for any other unique constraints on user_id (safety sweep)
  -- Note: We want to allow duplicates on user_id now.
END $$;
