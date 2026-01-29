-- SECURITY FIX: Enable Rate Limiting Checks
-- Previous setup had no SELECT policy for activity_logs, causing RLS errors on client-side checks.
-- Since the client was updated to 'Fail-Closed' on error, this would lock out all users.
-- This policy allows users to count their own generation events.

create policy "Users can view own activity logs"
on public.activity_logs for select
using (auth.uid() = user_id);
