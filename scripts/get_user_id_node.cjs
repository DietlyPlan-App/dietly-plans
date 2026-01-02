
const https = require('https');

const SUPABASE_URL = "https://zoedktjgvsbtoiqnmjml.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvZWRrdGpndnNidG9pcW5tam1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4MTgwNywiZXhwIjoyMDgxNjU3ODA3fQ.QuNDDy6lfrSvEzM7NIfw9aenyambc0XNUAfQPRabIp0";

const options = {
    hostname: 'zoedktjgvsbtoiqnmjml.supabase.co',
    path: '/auth/v1/admin/users',
    method: 'GET',
    headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (!parsed.users) {
                console.log("No users array returned. Response:", data);
                return;
            }
            const user = parsed.users.find(u => u.email === "alexiospythagoras9@gmail.com");
            if (user) {
                console.log(`USER_ID: ${user.id}`);
            } else {
                console.log("User not found in list.");
            }
        } catch (e) {
            console.error("Error parsing JSON:", e.message);
            console.log("Response:", data);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
