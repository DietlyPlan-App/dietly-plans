
import fs from 'fs';
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zoedktjgvsbtoiqnmjml.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvZWRrdGpndnNidG9pcW5tam1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4MTgwNywiZXhwIjoyMDgxNjU3ODA3fQ.QuNDDy6lfrSvEzM7NIfw9aenyambc0XNUAfQPRabIp0";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function getSession() {
    const email = `audit_automation_${Date.now()}@example.com`;
    const password = "TestPassword123!";

    // 1. Create User
    const { data: user, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });

    if (createError) {
        console.error("Create User Error:", createError);
        process.exit(1);
    }

    // 2. Sign In to get Session
    const { data: sessionData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (loginError) {
        console.error("Login Error:", loginError);
        process.exit(1);
    }

    // 3. Create a Plan for this user so Dashboard isn't empty
    await supabase.from('plans').insert({
        user_id: user.user.id,
        data: {
            planTitle: "Automation Plan",
            userStats: { name: "Auto Bot", goal: "lose", calories: 2000, macros: { p: 150, c: 200, f: 70 } },
            roadmap: {
                month1: {
                    dailyPlan: Array(7).fill({ day: 1, dailyMacros: { calories: 2000 }, meals: { breakfast: { name: "Oatmeal", macros: { p: 10, c: 20, f: 5 }, ingredients: ["Oats"] }, lunch: { name: "Rice", macros: { p: 10, c: 20, f: 5 }, ingredients: ["Rice"] }, dinner: { name: "Chicken", macros: { p: 10, c: 20, f: 5 }, ingredients: ["Chicken"] } } }),
                    groceries: {
                        week1: [{ category: "Produce", items: ["Apples"] }],
                        week2: [{ category: "Produce", items: ["Bananas"] }],
                        week3: [],
                        week4: []
                    },
                    targetCalories: 2000,
                    phaseName: "Ignition"
                }
            }
        }
    });

    // Write to file for easy reading by agent
    const tokenData = {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        user: sessionData.session.user,
        token_type: "bearer",
        expires_in: 3600
    };
    fs.writeFileSync('session.json', JSON.stringify(tokenData));
    console.log("Session saved to session.json");
}

getSession();
