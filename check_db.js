
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://zoedktjgvsbtoiqnmjml.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvZWRrdGpndnNidG9pcW5tam1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4MTgwNywiZXhwIjoyMDgxNjU3ODA3fQ.QuNDDy6lfrSvEzM7NIfw9aenyambc0XNUAfQPRabIp0";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecentActivity() {
    console.log("--- Recent Activity Logs (Last 5) ---");
    const { data: logs, error: logError } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (logError) {
        console.error("Error fetching logs:", logError);
    } else {
        logs.forEach(log => {
            console.log(`[${log.created_at}] Action: ${log.action_type} | User: ${log.user_id} | Meta: ${JSON.stringify(log.metadata)}`);
        });
    }

    console.log("\n--- Recent Plan Updates (Last 5) ---");
    const { data: plans, error: planError } = await supabase
        .from('plans')
        .select('user_id, is_paid, plan_tier, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(5);

    if (planError) {
        console.error("Error fetching plans:", planError);
    } else {
        plans.forEach(plan => {
            console.log(`[${plan.updated_at}] User: ${plan.user_id} | Paid: ${plan.is_paid} | Tier: ${plan.plan_tier}`);
        });
    }
}

checkRecentActivity();
