import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

declare const Deno: any;

// CORS headers - Required to accept webhook requests without Supabase Authorization header
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, webhook-signature, webhook-id, webhook-timestamp',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
    console.log("🔔 Dodo Webhook Handler Invoked");
    console.log("Method:", req.method);
    console.log("Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const rawBody = await req.text();
        console.log("📦 Raw Body Length:", rawBody.length);
        console.log("📦 Raw Body Preview:", rawBody.substring(0, 500));

        const signature = req.headers.get("webhook-signature");
        const secret = Deno.env.get('DODO_WEBHOOK_SECRET');

        console.log("🔐 Signature Present:", !!signature);
        console.log("🔐 Signature Value:", signature?.substring(0, 50) + "...");
        console.log("🔐 Secret Present:", !!secret);

        if (!secret) {
            console.error("CRITICAL: DODO_WEBHOOK_SECRET is not set.");
            return new Response(JSON.stringify({ error: "Server Configuration Error" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500
            });
        }

        if (!signature) {
            console.error("Missing webhook-signature header");
            return new Response(JSON.stringify({ error: "Missing Signature" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 401
            });
        }

        // VERIFY SIGNATURE (HMAC-SHA256)
        const encoder = new TextEncoder();

        // 1. Prepare Secret Key
        // Dodo secret is likely HEX encoded based on inspection
        // We'll try to use it as bytes if it looks like Hex.
        const hexToBytes = (hex: string) => {
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < bytes.length; i++) {
                bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
            }
            return bytes;
        };

        // Handle secret as Hex if it looks like Hex, otherwise UTF-8
        let secretBytes;
        if (/^[0-9a-fA-F]+$/.test(secret)) {
            secretBytes = hexToBytes(secret);
        } else {
            secretBytes = encoder.encode(secret);
        }

        const key = await crypto.subtle.importKey(
            "raw",
            secretBytes,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"]
        );

        // 2. Prepare Signature
        // Format seen: "v1,BASE64..."
        const parts = signature.split(',');
        const signatureBase64 = parts.length > 1 ? parts[1] : parts[0];

        // Base64 decode
        const signatureBinStr = atob(signatureBase64);
        const signatureBytes = new Uint8Array(signatureBinStr.length);
        for (let i = 0; i < signatureBinStr.length; i++) {
            signatureBytes[i] = signatureBinStr.charCodeAt(i);
        }

        // 3. Prepare Payload (Try multiple formats)
        const webhookId = req.headers.get("webhook-id") || "";
        const webhookTimestamp = req.headers.get("webhook-timestamp") || "";

        // Candidates for signed payload
        const payloadsToTest = [
            rawBody, // Plain body
            `${webhookId}.${webhookTimestamp}.${rawBody}`, // Full headers + body
            `${webhookTimestamp}.${rawBody}`, // Timestamp + body (Stripe style)
        ];

        let verified = false;

        for (const payload of payloadsToTest) {
            const isMatch = await crypto.subtle.verify(
                "HMAC",
                key,
                signatureBytes,
                encoder.encode(payload)
            );
            if (isMatch) {
                verified = true;
                console.log("✅ Signature matched using payload format:", payload === rawBody ? "rawBody" : "constructed");
                break;
            }
        }

        console.log("🔐 Signature Verification Result:", verified);

        // ... imports ...

        // ... verify signature logic ...

        if (!verified) {
            console.error("CRITICAL: Invalid Signature detected. BLOCKING REQUEST.");
            // SECURITY ID: 35 (Uncommented Verification)
            return new Response(JSON.stringify({ error: "Invalid Signature" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 401
            });
        }

        // Parse the body
        const body = JSON.parse(rawBody);
        const paymentId = body.data?.payment_id || body.payment_id || 'N/A';
        console.log(`Dodo Event: ${body.type} | ID: ${paymentId}`);
        console.log("📋 Event Body:", JSON.stringify(body, null, 2).substring(0, 1000));

        // 3. Process Payment Success
        if (body.type === 'payment.succeeded') {

            const metadata = body.data?.metadata;
            console.log("📋 Metadata:", JSON.stringify(metadata));

            const userId = metadata?.user_id;
            const planId = metadata?.plan_id; // NEW: Target specific plan
            const planTier = metadata?.plan_type || 'full';
            const amount = body.data?.total_amount; // e.g. 19.99
            const currency = body.data?.currency;

            console.log(`User ID: ${userId}, Plan ID: ${planId}, Tier: ${planTier}, Amount: ${amount}`);

            // SECURITY ID: 35 (Amount Validation)
            // 9.99 or 19.99. Let's enforce a minimum of $9.00 to prevent 'penny' attacks.
            // Adjust threshold based on currency if needed, but assuming USD for now.
            if (amount < 9) {
                console.error(`🚨 FRAUD ALERT: Payment amount too low (${amount}). Ignoring unlock.`);
                return new Response(JSON.stringify({ error: "Amount invalid" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 400
                });
            }

            if (userId) {
                console.log(`💰 Verified Payment for User: ${userId} | Tier: ${planTier}`);

                const supabaseAdmin = createClient(
                    Deno.env.get('SUPABASE_URL') ?? '',
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                );

                // IDEMPOTENCY CHECK
                const { data: existingLog } = await supabaseAdmin
                    .from('activity_logs')
                    .select('id')
                    .eq('action_type', 'payment_success')
                    .like('metadata', `%${paymentId}%`)
                    .maybeSingle();

                if (existingLog) {
                    console.log(`⚠️ Payment ${paymentId} already processed. Skipping duplicate.`);
                    return new Response(JSON.stringify({ received: true, duplicate: true }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                        status: 200
                    });
                }

                // Update Database - Targeted Unlock (Plan ID)
                let updateQuery = supabaseAdmin
                    .from('plans')
                    .update({
                        is_paid: true,
                        plan_tier: planTier,
                        payment_id: paymentId // Store Dodo Payment ID
                    });

                if (planId) {
                    // Pay-Per-Plan: Unlock specific UUID
                    console.log(`🔹 Unlocking Specific Plan ID: ${planId}`);
                    updateQuery = updateQuery.eq('id', planId);
                } else {
                    // SECURITY FIX: Legacy Fallback Removed.
                    // In V2 Architecture ("Pay-Per-Plan"), we CANNOT update by User ID alone,
                    // as that would unlock ALL plans for the user (Free & Paid).
                    // We must fail safely.
                    console.error(`🚨 CRITICAL: Webhook missing 'plan_id'. Cannot unlock safely. User: ${userId}`);
                    return new Response(JSON.stringify({ error: "Missing plan_id in Pay-Per-Plan architecture" }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                        status: 400
                    });
                }

                const { error } = await updateQuery;

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
                        plan_tier: planTier,
                        plan_id: planId
                    }
                });

                console.log(`✅ User Plan Unlocked: ${planTier}`);
            } else {
                console.warn("⚠️ Webhook received but 'user_id' missing in metadata.");
            }
        } else if (body.type === 'payment.refunded') {
            console.log(`💸 Refund Event Detected: ${paymentId}`);

            // Refund Logic: Lock the plan again
            // We can match by payment_id
            const supabaseAdmin = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );

            const { error } = await supabaseAdmin
                .from('plans')
                .update({ is_paid: false }) // Re-lock
                .eq('payment_id', paymentId);

            if (error) {
                console.error('Database Update Error (Refund):', error);
                throw error;
            }

            // Log activity
            await supabaseAdmin.from('activity_logs').insert({
                action_type: 'payment_refunded',
                metadata: {
                    provider: 'dodo',
                    event_id: body.payment_id,
                    payment_id: paymentId
                }
            });

            console.log(`🔒 Plan Re-Locked due to Refund: ${paymentId}`);

        } else {
            console.log(`ℹ️ Ignoring event type: ${body.type}`);
        }

        // Always return 200 to acknowledge receipt
        return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        });

    } catch (err: any) {
        console.error("Webhook Logic Error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400
        });
    }
});