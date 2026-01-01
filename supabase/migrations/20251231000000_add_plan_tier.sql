-- Add plan_tier column to plans table
alter table public.plans 
add column if not exists plan_tier text default 'free';
