
const https = require('https');

const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvZWRrdGpndnNidG9pcW5tam1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4MTgwNywiZXhwIjoyMDgxNjU3ODA3fQ.QuNDDy6lfrSvEzM7NIfw9aenyambc0XNUAfQPRabIp0";
const USER_ID = "b00028e5-3637-47e7-a113-5d7864c5b30e";

const options = {
    hostname: 'zoedktjgvsbtoiqnmjml.supabase.co',
    path: `/rest/v1/plans?user_id=eq.${USER_ID}&select=*`,
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
            console.log("Plan Status:", JSON.stringify(parsed, null, 2));
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
