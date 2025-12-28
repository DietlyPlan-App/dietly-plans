import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

declare const Deno: any;

serve(async (req: Request) => {
    try {
        const rawBody = await req.text();
        // Dodo sends the signature in 'webhook-signature' header
        // In a strict prod environment, we would verify this against the secret.
        // For MVP/Vibe coding, we trust the event ID structure but I'll add the placeholder.

        const signature = req.headers.get("webhook-signature");
        const secret = Deno.env.get('DODO_WEBHOOK_SECRET');

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

        // Convert hex signature to Uint8Array
        const signatureBytes = new Uint8Array(
            signature.match(/.{1,2}/g)!.map((byte: any) => parseInt(byte, 16))
        );

        const verified = await crypto.subtle.verify(
            "HMAC",
            key,
            signatureBytes,
            encoder.encode(rawBody)
        );

        if (!verified) {
            console.error("Invalid Signature detected. Potential tampering.");
            return new Response("Invalid Signature", { status: 401 });
        }


        // Parse the body
        const body = JSON.parse(rawBody);
        console.log(`Dodo Event: ${body.type} | ID: ${body.data?.payment_id || 'N/A'}`);

        // 3. Process Payment Success
        // Dodo payload structure: { type: "payment.succeeded", data: { metadata: { ... }, ... } }
        if (body.type === 'payment.succeeded') {

            const metadata = body.data.metadata;
            const userId = metadata?.user_id;
            const planTier = metadata?.plan_type || 'full';
            const amount = body.data.total_amount;
            const currency = body.data.currency;

            if (userId) {
                console.log(`💰 Verified Payment for User: ${userId} | Tier: ${planTier}`);

                const supabaseAdmin = createClient(
                    Deno.env.get('SUPABASE_URL') ?? '',
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                );

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