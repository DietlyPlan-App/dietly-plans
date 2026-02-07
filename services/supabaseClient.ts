
import { createClient } from '@supabase/supabase-js';

// --- PRODUCTION-SAFE LOGGING ---
const isDev = import.meta.env.DEV;
const devError = (...args: any[]) => isDev && console.error(...args);
const devWarn = (...args: any[]) => isDev && console.warn(...args);

// --- CONFIGURATION ---
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  devError("CRITICAL ERROR: Supabase configuration is missing. Please check .env.local");
}

// Session timeout set to 45 minutes (2700 seconds) to prevent wizard interruption
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Note: Actual session timeout is controlled by Supabase project settings
    // This config ensures the client auto-refreshes tokens before expiry
  }
});


// --- TRACKING HELPERS ---

/**
 * Records a specific user action (e.g., 'download_pdf', 'login')
 */
export const trackEvent = async (userId: string, action: string, details: object = {}) => {
  try {
    // Fire and forget - don't await strictly to avoid blocking UI
    supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: action,
      metadata: details,
    }).then(({ error }) => {
      if (error) devWarn("Tracking Error:", error.message);
    });
  } catch (e) {
    devWarn("Tracking failed silently", e);
  }
};

/**
 * Archives the full Plan (Inputs + Output) to history
 */
/**
 * Uploads the generated PDF to Supabase Storage 'plans' bucket.
 * Returns the public URL (or signed URL) of the file.
 */
export const uploadPDF = async (userId: string, pdfBlob: Blob, dateStr: string): Promise<string | null> => {
  try {
    const filename = `${userId}/${dateStr}_plan.pdf`;
    const { data, error } = await supabase.storage
      .from('plans')
      .upload(filename, pdfBlob, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      devWarn("Storage Upload Error:", error.message);
      return null;
    }

    // Get the Public URL (Active for 1 year if bucket is public, or we use Signed URLs for private)
    // Since we set bucket to PRIVATE, we must use createSignedUrl
    const { data: signedData, error: signedError } = await supabase.storage
      .from('plans')
      .createSignedUrl(filename, 60 * 60 * 24 * 365); // Valid for 1 year

    if (signedError) return null;
    return signedData.signedUrl;

  } catch (e) {
    devWarn("Upload failed completely", e);
    return null;
  }
};

/**
 * Archives the full Plan (Inputs + Output + PDF Link) to history
 */
export const saveHistory = async (userId: string, fullData: any, pdfUrl?: string) => {
  try {
    // Inject the PDF URL into the data blob if it exists
    const archivalData = {
      ...fullData,
      meta_pdf_url: pdfUrl || null,
      meta_created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('plan_history').insert({
      user_id: userId,
      full_data: archivalData
    });

    if (error) devWarn("History Archive Error:", error.message);
  } catch (e) {
    devWarn("History save failed", e);
  }
};

/**
 * Fetches the user's plan history from the 'plans' table.
 * Supports the V2 Pay-Per-Plan architecture.
 */
export const fetchUserHistory = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('id, created_at, data, is_paid, plan_tier, payment_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20); // Increased limit as we might have many plans

    if (error) throw error;

    return data.map(row => ({
      date: row.created_at,
      title: row.data.planTitle || (row.is_paid ? `Paid Plan (${row.plan_tier})` : "Preview Plan"),
      pdfUrl: row.data.meta_pdf_url, // Might be null if not updated
      calories: row.data.userStats?.tdee || row.data.weekTemplate?.[0]?.dailyMacros?.calories,
      plan: row.data, // Pass full plan
      isPaid: row.is_paid, // Pass payment status for UI
      planTier: row.plan_tier, // NEW: Pass Tier Info from DB
      id: row.id,
      paymentId: row.payment_id
    }));

  } catch (e) {
    devWarn("Fetch History Failed", e);
    return [];
  }
};

// --- RATE LIMITING ---

const DAILY_GENERATION_LIMIT = 3;

/**
 * Check if user has exceeded daily generation limit
 * Returns: { allowed: boolean, remaining: number, resetTime: Date }
 */
export const checkRateLimit = async (userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  generationsToday: number;
  resetTime: Date;
}> => {
  try {
    // Get start of today (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Count 'generation_started' events today for this user
    const { count, error } = await supabase
      .from('activity_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('action_type', 'generation_started')
      .gte('created_at', todayISO);

    if (error) {
      devError("Rate limit check CRITICAL error:", error.message);
      // SECURITY: Fail closed - don't allow generation if we can't verify
      return {
        allowed: false,
        remaining: 0,
        generationsToday: DAILY_GENERATION_LIMIT,
        resetTime: getNextResetTime()
      };
    }

    const generationsToday = count || 0;
    const remaining = Math.max(0, DAILY_GENERATION_LIMIT - generationsToday);
    const allowed = generationsToday < DAILY_GENERATION_LIMIT;

    return {
      allowed,
      remaining,
      generationsToday,
      resetTime: getNextResetTime()
    };
  } catch (e) {
    devError("Rate limit check CRITICAL failure:", e);
    return {
      allowed: false,
      remaining: 0,
      generationsToday: DAILY_GENERATION_LIMIT,
      resetTime: getNextResetTime()
    };
  }
};

/**
 * Track when a generation is started (for rate limiting)
 */
export const trackGenerationStart = async (userId: string, userEmail: string) => {
  await trackEvent(userId, 'generation_started', { email: userEmail, timestamp: new Date().toISOString() });
};

/**
 * Get time until rate limit resets (midnight UTC)
 */
const getNextResetTime = (): Date => {
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  return tomorrow;
};

/**
 * Format remaining time until reset
 */
export const formatTimeUntilReset = (resetTime: Date): string => {
  const now = new Date();
  const diffMs = resetTime.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};
