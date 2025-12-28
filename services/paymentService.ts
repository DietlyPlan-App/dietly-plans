
import { supabaseUrl, supabaseAnonKey } from './supabaseClient';

/**
 * Generates a secure Dodo Payments Checkout URL.
 * Uses direct fetch to avoid common SDK 'Failed to send request' issues in sandbox environments.
 */
export const getCheckoutUrl = async (userId: string, userEmail?: string, userName?: string, currency?: string, planType: '1month' | 'full' = 'full'): Promise<string> => {
  const functionUrl = `${supabaseUrl}/functions/v1/create-dodo-checkout`;

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({
        userId,
        userEmail,
        userName,
        currency,
        planType
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Edge Function Response Error:", {
        status: response.status,
        statusText: response.statusText,
        data: errorData
      });

      if (response.status === 404) {
        throw new Error("Payment service endpoint not found. Please ensure the Edge Function is deployed.");
      }

      throw new Error(errorData.error || `Checkout failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!data?.payment_link) {
      console.error("Invalid response format from Edge Function:", data);
      throw new Error("No payment link returned from payment provider.");
    }

    return data.payment_link;

  } catch (error: any) {
    console.error("Payment Link Generation Error Details:", error);

    // Check if it's a network error
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      throw new Error("Unable to reach the payment server. Please check your internet connection or project status.");
    }

    throw new Error(error.message || "Failed to initialize secure checkout.");
  }
};
