
import { createClient } from '@supabase/supabase-js';

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
      console.warn("Storage Upload Error:", error.message);
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
    console.warn("Upload failed completely", e);
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

    if (error) console.warn("History Archive Error:", error.message);
  } catch (e) {
    console.warn("History save failed", e);
  }
};

/**
 * Fetches the user's plan history (LIMIT 5 for now to save bandwidth)
 */
export const fetchUserHistory = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('plan_history')
      .select('created_at, full_data')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    return data.map(row => ({
      date: row.created_at,
      title: row.full_data.plan?.planTitle || "Custom Diet Plan", // Fallback if no title
      pdfUrl: row.full_data.meta_pdf_url,
      calories: row.full_data.plan?.weekTemplate?.[0]?.dailyMacros?.calories,
      plan: row.full_data.plan // Pass full plan for regeneration if needed
    }));

  } catch (e) {
    console.warn("Fetch History Failed", e);
    return [];
  }
};
