
import fs from 'fs';
import { createClient } from "@supabase/supabase-js";

// Use Production URL/Key
const SUPABASE_URL = "https://zoedktjgvsbtoiqnmjml.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvZWRrdGpndnNidG9pcW5tam1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4MTgwNywiZXhwIjoyMDgxNjU3ODA3fQ.QuNDDy6lfrSvEzM7NIfw9aenyambc0XNUAfQPRabIp0";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function simulatePayment() {
    // 1. Read session to get User ID
    console.log("📂 Reading session.json...");
    if (!fs.existsSync('session.json')) {
        console.error("❌ session.json not found. Run verify_session_gen.ts first.");
        process.exit(1);
    }
    const sessionRaw = fs.readFileSync('session.json', 'utf8');
    const session = JSON.parse(sessionRaw);
    const userId = session.user.id;
    console.log(`👤 Test User ID: ${userId}`);

    // 2. Fetch Latest Plan
    console.log("🔍 Fetching latest plan...");
    const { data: plan, error: fetchError } = await supabase
        .from('plans')
        .select('id, is_paid, plan_tier')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (fetchError || !plan) {
        console.error("❌ Plan not found:", fetchError);
        process.exit(1);
    }
    console.log(`📄 Found Plan: ${plan.id} | Paid: ${plan.is_paid}`);

    // 3. Mark as Paid (Simulate Dodo Webhook)
    console.log("💸 Simulating $0.00 'Coupon' Payment (Unlock)...");
    const { data: updated, error: updateError } = await supabase
        .from('plans')
        .update({
            is_paid: true,
            plan_tier: 'full',
            payment_id: 'simulated_coupon_super_admin'
        })
        .eq('id', plan.id)
        .select()
        .single();

    if (updateError) {
        console.error("❌ Update failed:", updateError);
        process.exit(1);
    }

    console.log("✅ PAYMENT SIMULATED SUCCESSFULLY!");
    console.log(`🎉 Plan ${updated.id} is now UNLOCKED (is_paid: true).`);
    console.log("👉 Now run Browser Check to verify UI.");
}

simulatePayment();
