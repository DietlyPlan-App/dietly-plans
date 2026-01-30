import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

declare const Deno: any;

serve(async (req: Request) => {
    console.log("🔔 Dodo Webhook Handler Invoked");
    console.log("Method:", req.method);
    console.log("Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));

    try {
        const rawBody = await req.text();
        console.log("📦 Raw Body Length:", rawBody.length);
        console.log("📦 Raw Body Preview:", rawBody.substring(0, 500));

        const signature = req.headers.get("webhook-signature");
        const secret = Deno.env.get('DODO_WEBHOOK_SECRET');

        console.log("🔐 Signature Present:", !!signature);
        console.log("🔐 Signature Value:", signature?.substring(0, 50) + "...");
        console.log("🔐 Secret Present:", !!secret);
        console.log("🔐 Secret Length:", secret?.length);

        if (!secret) {
            console.error("CRITICAL: DODO_WEBHOOK_SECRET is not set.");
            return new Response("Server Configuration Error", { status: 500 });
        }

        if (!signature) {
            console.error("Missing webhook-signature header");
            return new Response("Missing Signature", { status: 401 });
        }

        // VERIFY SIGNATURE (HMAC-SHA256)
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"]
        );

        // Convert hex signature to Uint8Array (with null safety)
        const hexPairs = signature.match(/.{1,2}/g);
        if (!hexPairs) {
            console.error("Invalid signature format - not valid hex");
            return new Response("Invalid Signature Format", { status: 401 });
        }
        const signatureBytes = new Uint8Array(
            hexPairs.map((byte: string) => parseInt(byte, 16))
        );

        const verified = await crypto.subtle.verify(
            "HMAC",
            key,
            signatureBytes,
            encoder.encode(rawBody)
        );

        console.log("🔐 Signature Verification Result:", verified);

        if (!verified) {
            console.error("CRITICAL: Invalid Signature detected. BLOCKING REQUEST.");
            // TEMPORARY DEBUG: Log what we expected
            const expectedSig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
            const expectedHex = Array.from(new Uint8Array(expectedSig)).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log("Expected Signature:", expectedHex);
            console.log("Received Signature:", signature);
            return new Response("Invalid Signature", { status: 401 });
        }

        // Parse the body
        const body = JSON.parse(rawBody);
        const paymentId = body.data?.payment_id || body.payment_id || 'N/A';
        console.log(`Dodo Event: ${body.type} | ID: ${paymentId}`);
        console.log("📋 Event Body:", JSON.stringify(body, null, 2).substring(0, 1000));

        // 3. Process Payment Success
        // Dodo payload structure: { type: "payment.succeeded", data: { metadata: { ... }, ... } }
        if (body.type === 'payment.succeeded') {

            const metadata = body.data?.metadata;
            console.log("📋 Metadata:", JSON.stringify(metadata));

            const userId = metadata?.user_id;
            const planTier = metadata?.plan_type || 'full';
            const amount = body.data?.total_amount;
            const currency = body.data?.currency;

            console.log(`User ID: ${userId}, Plan Tier: ${planTier}`);

            if (userId) {
                console.log(`💰 Verified Payment for User: ${userId} | Tier: ${planTier}`);

                const supabaseAdmin = createClient(
                    Deno.env.get('SUPABASE_URL') ?? '',
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                );

                // IDEMPOTENCY CHECK: Prevent duplicate processing
                const { data: existingLog } = await supabaseAdmin
                    .from('activity_logs')
                    .select('id')
                    .eq('action_type', 'payment_success')
                    .like('metadata', `%${paymentId}%`)
                    .maybeSingle();

                if (existingLog) {
                    console.log(`⚠️ Payment ${paymentId} already processed. Skipping duplicate.`);
                    return new Response(JSON.stringify({ received: true, duplicate: true }), {
                        headers: { "Content-Type": "application/json" },
                        status: 200
                    });
                }

                // Update Database - Idempotent
                const { error } = await supabaseAdmin
                    .from('plans')
                    .update({
                        is_paid: true,
                        plan_tier: planTier
                    })
                    .eq('user_id', userId);

                if (error) {
                    console.error('Database Update Error:', error);
                    throw error; // Throw so Dodo retries
                }

                // Log activity
                await supabaseAdmin.from('activity_logs').insert({
                    user_id: userId,
                    action_type: 'payment_success',
                    metadata: {
                        provider: 'dodo',
                        amount,
                        currency,
                        event_id: body.payment_id,
                        plan_tier: planTier
                    }
                });

                console.log(`✅ User Plan Unlocked: ${planTier}`);
            } else {
                console.warn("⚠️ Webhook received but 'user_id' missing in metadata.");
            }
        } else {
            console.log(`ℹ️ Ignoring event type: ${body.type}`);
        }

        // Always return 200 to acknowledge receipt
        return new Response(JSON.stringify({ received: true }), {
            headers: { "Content-Type": "application/json" },
            status: 200
        });

    } catch (err: any) {
        console.error("Webhook Logic Error:", err);
        // Return 400 only if we want Dodo to retry (e.g. DB connection failed)
        return new Response(JSON.stringify({ error: err.message }), { status: 400 });
    }
});