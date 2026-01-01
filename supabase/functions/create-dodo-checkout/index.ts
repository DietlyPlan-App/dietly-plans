import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

declare const Deno: any;

// SECURITY: Restrict CORS to allowed origins only
const allowedOrigins = [
  'https://dietly-plans.vercel.app',
  'https://dietlyplans.com',
  'https://www.dietlyplans.com',
  'http://localhost:5173',
  'http://localhost:3000'
];

const getCorsHeaders = (origin: string | null) => {
  const effectiveOrigin = (origin && allowedOrigins.includes(origin))
    ? origin
    : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': effectiveOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
};

// INTELLIGENT REGION MAPPING
const getStrictCountryFromCurrency = (currency: string): string | null => {
  const map: Record<string, string> = {
    'AED': 'AE', 'SAR': 'SA',
  };
  return map[currency] || null;
};

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, userEmail, userName, currency, planType } = await req.json();

    if (!userId) {
      throw new Error("User ID is required");
    }

    console.log("Processing checkout for userId:", userId);

    // 1. VALIDATE USER EXISTS IN DATABASE
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: userExists, error: dbError } = await supabaseAdmin
      .from('plans')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    if (dbError) {
      console.error("Database Verification Failed:", JSON.stringify(dbError));
      throw new Error(`Profile verify failed: ${dbError.message || dbError.code}`);
    }

    if (!userExists) {
      console.error("User not found in plans table:", userId);
      throw new Error("No diet plan found for this user. Please generate one first.");
    }

    const DODO_API_KEY = Deno.env.get('DODO_API_KEY');

    // Choose Product ID based on planType
    let DODO_PRODUCT_ID = '';
    if (planType === '1month') {
      DODO_PRODUCT_ID = Deno.env.get('DODO_PRODUCT_ID_1M') || '';
    } else {
      DODO_PRODUCT_ID = Deno.env.get('DODO_PRODUCT_ID_3M') || '';
    }

    const APP_URL = req.headers.get('origin') || 'https://dietlyplans.com';

    if (!DODO_API_KEY || !DODO_PRODUCT_ID) {
      throw new Error(`Missing Server Configuration (DODO KEYS). PlanType: ${planType}`);
    }

    // AUTO-DETECT ENVIRONMENT
    const isTestMode = DODO_API_KEY.includes('.test.') || DODO_API_KEY.startsWith('test_');
    const dodoBaseUrl = isTestMode
      ? 'https://test.dodopayments.com'
      : 'https://live.dodopayments.com';

    // Construct Customer Object
    const customerPayload: any = {};
    if (userEmail) {
      customerPayload.email = userEmail;
    } else {
      throw new Error("User email is required for receipt generation.");
    }

    if (userName) customerPayload.name = userName;

    const strictCountry = currency ? getStrictCountryFromCurrency(currency) : null;

    console.log(`Creating Dodo Checkout (${isTestMode ? 'TEST' : 'LIVE'}) for: ${userId} | Product: ${DODO_PRODUCT_ID} | Plan: ${planType}`);

    const requestBody: any = {
      product_cart: [
        {
          product_id: DODO_PRODUCT_ID,
          quantity: 1
        }
      ],
      customer: customerPayload,
      metadata: {
        user_id: userId,
        plan_type: planType || 'full'
      },
      return_url: `${APP_URL}/?success=true`
    };

    if (strictCountry) {
      requestBody.billing_country_code = strictCountry;
    }

    // Using Checkout API (Updated Endpoint)
    const response = await fetch(`${dodoBaseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DODO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    // ROBUST ERROR HANDLING: Dodo might return HTML (404/500) or Empty body
    const rawBody = await response.text();
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch (e) {
      console.error(`Dodo Raw Response (${response.status} ${response.statusText}):`, rawBody);
      throw new Error(`Dodo API Error (${response.status} ${response.statusText}): ${rawBody.substring(0, 500)}`);
    }

    if (!response.ok) {
      console.error(`Dodo API Error (${response.status} ${response.statusText}):`, JSON.stringify(data));
      throw new Error(data.message || `Failed to create checkout (Status: ${response.status})`);
    }

    // Handle variable response fields (payment_link, url, checkout_url)
    const paymentUrl = data.payment_link || data.url || data.checkout_url;

    if (!paymentUrl) {
      console.error("Dodo Response:", data);
      throw new Error("API succeeded but no link returned.");
    }

    return new Response(JSON.stringify({ payment_link: paymentUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error("Checkout Function Failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
