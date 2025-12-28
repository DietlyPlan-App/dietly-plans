
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
// --- CONFIGURATION ---
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("CRITICAL ERROR: Supabase configuration is missing. Please check .env.local");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
        if (error) console.warn("Tracking Error:", error.message);
    });
  } catch (e) {
    console.warn("Tracking failed silently", e);
  }
};

/**
 * Archives the full Plan (Inputs + Output) to history
 */
export const saveHistory = async (userId: string, fullData: any) => {
  try {
    const { error } = await supabase.from('plan_history').insert({
      user_id: userId,
      full_data: fullData
    });
    if (error) console.warn("History Archive Error:", error.message);
  } catch (e) {
    console.warn("History save failed", e);
  }
};
