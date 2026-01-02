
const https = require('https');

const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvZWRrdGpndnNidG9pcW5tam1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4MTgwNywiZXhwIjoyMDgxNjU3ODA3fQ.QuNDDy6lfrSvEzM7NIfw9aenyambc0XNUAfQPRabIp0";
const EMAIL = "alexiospythagoras9@gmail.com";

const postData = JSON.stringify({
    type: 'magiclink',
    email: EMAIL,
    options: {
        redirectTo: "https://dietly-plans.vercel.app/"
    }
});

const options = {
    hostname: 'zoedktjgvsbtoiqnmjml.supabase.co',
    path: '/auth/v1/admin/generate_link',
    method: 'POST',
    headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.action_link) {
                const finalLink = parsed.action_link.replace("http://localhost:3000", "https://dietly-plans.vercel.app/");
                console.log("MAGIC_LINK:", finalLink);
            } else {
                console.log("Error or No Link:", data);
            }
        } catch (e) {
            console.error("JSON Error:", e.message);
            console.log("Raw:", data);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
