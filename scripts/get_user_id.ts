
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://zoedktjgvsbtoiqnmjml.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvZWRrdGpndnNidG9pcW5tam1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4MTgwNywiZXhwIjoyMDgxNjU3ODA3fQ.QuNDDy6lfrSvEzM7NIfw9aenyambc0XNUAfQPRabIp0";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
        console.error("Error fetching users:", error);
        return;
    }

    const user = data.users.find(u => u.email === "hivor90278@24faw.com");

    if (user) {
        console.log(`USER_ID: ${user.id}`);
    } else {
        console.log("User not found.");
    }
}

main();
