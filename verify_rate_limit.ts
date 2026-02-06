
import fs from 'fs';

// Mock generation endpoints
const URLS = [
    'https://dietly-plans.vercel.app/api/generate-plan', // Should not exist, testing 404 vs 429
    'https://zoedktjgvsbtoiqnmjml.supabase.co/functions/v1/generate-plan' // Likely location
];

async function spamEndpoint(url: string, count: number) {
    console.log(`🚀 Spamming ${url} with ${count} requests...`);
    const promises = [];

    // Valid session required
    let token = '';
    try {
        const session = JSON.parse(fs.readFileSync('session.json', 'utf8'));
        token = session.access_token;
    } catch {
        console.log("⚠️ No session.json found. Testing anonymous spam.");
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer FAKE_TOKEN_12345'
    };
    // if (token) headers['Authorization'] = `Bearer ${token}`;

    for (let i = 0; i < count; i++) {
        promises.push(
            fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ prompt: 'test spam', maxTokens: 10 })
            }).then(r => ({ status: r.status, ok: r.ok }))
        );
    }

    const results = await Promise.all(promises);
    const statusCounts: Record<number, number> = {};
    results.forEach(r => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });

    console.log(`📊 Results for ${url}:`, statusCounts);

    if (statusCounts[429]) {
        console.log("✅ RATE LIMIT DETECTED!");
    } else if (statusCounts[200]) {
        console.log("❌ NO RATE LIMIT (Successful Responses)");
    } else {
        console.log("⚠️ Endpoint might be wrong or Erroring");
    }
}

async function run() {
    // gemini-proxy is the actual endpoint for generation logic
    await spamEndpoint('https://zoedktjgvsbtoiqnmjml.supabase.co/functions/v1/gemini-proxy', 10);
}

run();
