// Supabase Edge Function: Secure Gemini AI Proxy
// This function keeps the Gemini API key server-side, never exposed to frontend

// @ts-ignore (Deno types)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Verify authorization (must be authenticated Supabase user)
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Get API key from environment (secure, never exposed)
        // @ts-ignore (Deno env)
        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
        if (!GEMINI_API_KEY) {
            console.error("GEMINI_API_KEY not set in Edge Function secrets");
            return new Response(JSON.stringify({ error: "Server configuration error" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Parse request body
        const { prompt, schema, maxTokens = 60000 } = await req.json();

        if (!prompt) {
            return new Response(JSON.stringify({ error: "Missing prompt" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Call Gemini API using REST endpoint (more reliable than SDK in Edge Functions)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        // SECURITY: Basic Jailbreak Prevention
        const sanitize = (str: string) => {
            if (typeof str !== 'string') return "";
            return str
                .replace(/ignore (previous|all|above) instructions/gi, "[BLOCKED]")
                .replace(/forget (everything|all)/gi, "[BLOCKED]")
                .replace(/system override/gi, "[BLOCKED]")
                .replace(/simulat(e|ing) mode/gi, "[BLOCKED]");
        };
        const safePrompt = sanitize(prompt);

        const geminiBody: any = {
            contents: [{ role: "user", parts: [{ text: safePrompt }] }],
            generationConfig: {
                maxOutputTokens: maxTokens,
                responseMimeType: "application/json",
            }
        };

        // Add schema if provided
        if (schema) {
            geminiBody.generationConfig.responseSchema = schema;
        }

        const response = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API Error:", response.status, errorText);
            return new Response(JSON.stringify({
                error: "AI service error",
                status: response.status
            }), {
                status: response.status,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const data = await response.json();

        // Extract the text content from Gemini response
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

        return new Response(JSON.stringify({
            success: true,
            text: textContent
        }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Edge Function Error:", error);
        return new Response(JSON.stringify({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
