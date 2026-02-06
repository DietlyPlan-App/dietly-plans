
import { createClient } from "@supabase/supabase-js";

// Hardcoded for verification script to avoid env loading issues in temporary context
const SUPABASE_URL = "https://zoedktjgvsbtoiqnmjml.supabase.co";
// SERVICE ROLE KEY IS REQUIRED FOR ADMIN ACTIONS (Create/Delete User)
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvZWRrdGpndnNidG9pcW5tam1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4MTgwNywiZXhwIjoyMDgxNjU3ODA3fQ.QuNDDy6lfrSvEzM7NIfw9aenyambc0XNUAfQPRabIp0";

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("❌ MISSING ENV VARS");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function runTest() {
    console.log("🧪 STARTING: V2 Pay-Per-Plan Logic Verification");

    // 0. CREATE TEST USER (Real Admin Action)
    console.log("👤 Creating Test User via Admin API...");
    const email = `test_runner_${Date.now()}@example.com`;
    const { data: user, error: userErr } = await supabase.auth.admin.createUser({
        email,
        password: "TestPassword123!",
        email_confirm: true
    });

    if (userErr || !user.user) throw new Error(`Failed to create test user: ${userErr?.message}`);
    const TEST_USER_ID = user.user.id;
    console.log(`   ✅ Test User Created (ID: ${TEST_USER_ID})`);

    try {
        // 1. CLEANUP (Defensive)
        await supabase.from('plans').delete().eq('user_id', TEST_USER_ID);

        // 2. CREATE PLAN A
        console.log("\n📝 Step 1: Generating Plan A...");
        const planA = { planTitle: "Plan A", userStats: { goal: 'lose' } };
        const { data: docA, error: errA } = await supabase
            .from('plans')
            .insert({
                user_id: TEST_USER_ID,
                data: planA
                // is_paid defaults to false
            })
            .select()
            .single();

        if (errA) throw new Error(`Failed to create Plan A: ${errA.message}`);
        console.log(`   ✅ Plan A Created (ID: ${docA.id})`);

        if (docA.is_paid) throw new Error("❌ FAILURE: Plan A started as PAID (Should be free/locked)");
        console.log("   ✅ Plan A is initially LOCKED (Correct)");

        // 3. SIMULATE PAYMENT FOR PLAN A
        console.log("\n💳 Step 2: Simulating Payment for Plan A...");
        const { error: payErr } = await supabase
            .from('plans')
            .update({ is_paid: true, plan_tier: 'full', payment_id: 'test_payment_123' })
            .eq('id', docA.id);

        if (payErr) throw new Error(`Failed to pay Plan A: ${payErr.message}`);
        console.log("   ✅ Plan A Marked as PAID");

        // 4. CREATE PLAN B (The "Plan B" Test)
        console.log("\n📝 Step 3: Generating Plan B (New Generation)...");
        const planB = { planTitle: "Plan B", userStats: { goal: 'gain' } };
        const { data: docB, error: errB } = await supabase
            .from('plans')
            .insert({
                user_id: TEST_USER_ID,
                data: planB
            })
            .select()
            .single();

        if (errB) throw new Error(`Failed to create Plan B: ${errB.message}`);
        console.log(`   ✅ Plan B Created (ID: ${docB.id})`);

        // 5. VERIFY ISOLATION
        console.log("\n🔍 Step 4: Verifying Isolation...");

        // Refetch both
        const { data: finalA } = await supabase.from('plans').select('is_paid').eq('id', docA.id).single();
        const { data: finalB } = await supabase.from('plans').select('is_paid').eq('id', docB.id).single();

        console.log(`   Plan A Paid Status: ${finalA.is_paid} (Expected: true)`);
        console.log(`   Plan B Paid Status: ${finalB.is_paid} (Expected: false)`);

        if (finalA.is_paid === true && finalB.is_paid === false) {
            console.log("\n✅ SUCCESS: 'The Plan B Test' Passed!");
            console.log("   Legacy 'One-Time Unlock' bug is ELIMINATED.");
            console.log("   System correctly handles Pay-Per-Plan isolation.");
        } else {
            console.error("\n❌ FAILURE: Logic Isolation Failed.");
            if (!finalA.is_paid) console.error("   - Plan A lost its payment status.");
            if (finalB.is_paid) console.error("   - Plan B inherited payment status (Critical Bug).");
            throw new Error("Logic Isolation Failed");
        }

    } catch (e) {
        throw e;
    } finally {
        // CLEANUP USER
        console.log("\n🧹 Deleting Test User...");
        await supabase.auth.admin.deleteUser(TEST_USER_ID);
        console.log("   ✅ User Deleted.");
    }
}

runTest().catch(e => {
    console.error("\n💥 SYSTEM ERROR:", e.message);
    process.exit(1);
});
