
import React, { useState, useEffect, useRef, Suspense } from 'react';
import Wizard from './components/Wizard';
import Auth from './components/Auth'; // Import Auth
import { Legal } from './components/Legal'; // Import Legal
import { generateMealPlan } from './services/geminiService';
import { supabase, trackEvent, saveHistory, uploadPDF, checkRateLimit, trackGenerationStart, formatTimeUntilReset } from './services/supabaseClient'; // Import Client & Tracking
import { generatePDFBlob } from './services/pdfService'; // NEW: Vault Blob Generator
import { UserStats, AIResponse } from './types';
import { Zap, LogOut, X, CheckCircle, Loader2 } from 'lucide-react';
import { safeLocalStorage } from './src/utils/storageUtils';

// --- LAZY LOADED COMPONENTS (Code Splitting for Bundle Optimization) ---
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const HistoryVault = React.lazy(() => import('./components/HistoryVault').then(m => ({ default: m.HistoryVault })));

// --- PRODUCTION-SAFE LOGGING ---
const isDev = import.meta.env.DEV;
const devLog = (...args: any[]) => isDev && console.log(...args);
const devError = (...args: any[]) => isDev && console.error(...args);

// --- LOADING FALLBACK COMPONENT ---
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
  </div>
);


const App: React.FC = () => {
  const [session, setSession] = useState<any>(null); // Track User Session
  const [currentStep, setCurrentStep] = useState<'wizard' | 'loading' | 'dashboard' | 'legal'>(() => {
    // RESTORE STEP FROM LOCAL STORAGE
    const saved = safeLocalStorage.getItem('dietly_step');
    return (saved as any) || 'wizard';
  });
  const [loadingText, setLoadingText] = useState("Initializing AI...");
  // RESTORE PLAN FROM LOCAL STORAGE (Instant Load)
  const [plan, setPlan] = useState<AIResponse | null>(() => {
    const saved = safeLocalStorage.getItem('dietly_plan');
    return saved ? JSON.parse(saved) : null;
  });

  // NEW: Track the specific Plan ID (for Pay-Per-Plan)
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);


  const [isPaid, setIsPaid] = useState(false);
  const [planTier, setPlanTier] = useState<'free' | '1month' | 'full'>('free');
  const [showAuthModal, setShowAuthModal] = useState(false); // New Modal State
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [isPaymentVerifying, setIsPaymentVerifying] = useState(false); // UX SPINNER STATE // Payment Success Modal
  const [showHistory, setShowHistory] = useState(false); // NEW: History Vault Modal

  // Track if we already logged login to prevent double-firing in StrictMode
  const loginLoggedRef = useRef(false);

  // 1. Session Managament & Restoration Logic
  useEffect(() => {
    // Handle Session Updates
    const handleSessionStart = async (session: any) => {
      setSession(session);
      if (session) {
        // Check if we have PENDING WIZARD DATA (User just logged in after filling form)
        const pendingDataRaw = safeLocalStorage.getItem('dietly_pending_wizard_data');
        if (pendingDataRaw) {
          try {
            const pendingStats = JSON.parse(pendingDataRaw);
            devLog("Found pending wizard data, resuming generation...", pendingStats);
            safeLocalStorage.removeItem('dietly_pending_wizard_data'); // Clear it

            // Resume Generation immediately with the NEW data
            // We call the handler directly. Since 'session' is valid, it will proceed.
            // We use the stats from storage, not any stale closure state.
            await handleWizardComplete(pendingStats, session);

            return; // EXIT EARLY: Do NOT fetch old DB data
          } catch (e) {
            devError("Failed to parse pending data", e);
          }
        }

        // If no pending data, Fetch from DB as normal
        fetchUserData(session.user.id);

        if (!loginLoggedRef.current) {
          trackEvent(session.user.id, 'session_restored', { method: 'auto' });
          loginLoggedRef.current = true;
        }
      } else {
        setPlan(null); // Clear plan on logout
        setIsPaid(false);
        setCurrentStep('wizard');
      }
    };

    // Initialize
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSessionStart(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') {
        handleSessionStart(session);
      }

      if (event === 'SIGNED_IN' && session) {
        setShowAuthModal(false);
        trackEvent(session.user.id, 'user_login', { method: 'auth_change' });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // CHECK FOR PAYMENT SUCCESS RETURN
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('success') === 'true') {
      setShowPaymentSuccess(true);
      // Clean URL
      window.history.replaceState({}, document.title, "/");

      // CRITICAL FIX: Re-fetch user data after payment to get updated is_paid status
      const refetchAfterPayment = async () => {
        setIsPaymentVerifying(true); // START SPINNER
        try {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for webhook
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (currentSession?.user?.id) {
            devLog("Refetching user data after payment success...");
            const { data, error } = await supabase
              .from('plans')
              .select('*')
              .eq('user_id', currentSession.user.id)
              .single();

            if (data && !error) {
              if (data.is_paid) {
                setIsPaid(true);
                setPlanTier(data.plan_tier || 'full');
                setCurrentPlanId(data.id); // Sync ID
                devLog("✅ Payment confirmed! User unlocked.");
              }
            }
          }
        } finally {
          setIsPaymentVerifying(false); // STOP SPINNER
        }
      };
      refetchAfterPayment();
    }
  }, []);

  // MANUAL REFRESH HANDLER (Passed to Dashboard)
  const handleManualRefresh = async () => {
    if (!session?.user?.id) return;

    setIsPaymentVerifying(true);
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (data && !error && data.is_paid) {
        setIsPaid(true);
        setPlanTier(data.plan_tier || 'full');
        setCurrentPlanId(data.id);
        alert("Status Updated: Plan is Unlocked! 🔓");
      } else {
        alert("Status Check: Plan is still locked. If you just paid, please wait a moment and try again.");
      }
    } catch (e) {
      console.error("Manual refresh failed", e);
    } finally {
      setIsPaymentVerifying(false);
    }
  };

  // PERSISTENCE EFFECT
  useEffect(() => {
    if (plan) {
      safeLocalStorage.setItem('dietly_plan', JSON.stringify(plan));
    } else {
      safeLocalStorage.removeItem('dietly_plan');
    }
    safeLocalStorage.setItem('dietly_step', currentStep);
  }, [plan, currentStep]);

  // 2. Fetch Plan from Supabase Database
  const fetchUserData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*, payment_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }) // Get Latest
        .limit(1)
        .maybeSingle(); // Safe for 0 or 1 result

      if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found" (New user)
        devError('Error fetching plan:', error);
      }

      if (data) {
        setPlan(data.data as AIResponse);

        // PAYMENT STATUS CHECK
        // SECURITY FIX: Removed LocalStorage Temp Unlock. 
        // Only the Database Record is trusted.
        const dbPaidStatus = data.is_paid;
        setCurrentPlanId(data.id); // Save the ID
        if (data.payment_id) {
          console.log("Audit: Payment ID found:", data.payment_id);
          // setPaymentId(data.payment_id); // TODO: Add state if needed for UI
        }

        if (dbPaidStatus) {
          setIsPaid(true);
          setPlanTier(data.plan_tier || 'full'); // Default to full if is_paid is true but tier missing
        } else {
          setIsPaid(false);
          setPlanTier('free');
        }

        setCurrentStep('dashboard');
      }
      // Note: If no plan exists, we stay on 'wizard' (which will load saved state from localStorage)
    } catch (e) {
      devError("DB Fetch Error", e);
    }
  };

  // 3. Generate & Save to Supabase (PLUS TRACKING)
  const handleWizardComplete = async (stats: UserStats, explicitSession: any = null) => {
    // Determine active session (State or Explicit Argument)
    const activeSession = explicitSession || session;

    // --- AUTH INTERCEPT ---
    // If no session, stash data and force login (Hook & Save)
    if (!activeSession) {
      devLog("Saving wizard data for post-login resume...");
      safeLocalStorage.setItem('dietly_pending_wizard_data', JSON.stringify(stats));
      setShowAuthModal(true);
      return;
    }

    // --- RATE LIMIT CHECK ---
    const rateLimitResult = await checkRateLimit(activeSession.user.id);
    if (!rateLimitResult.allowed) {
      const timeUntilReset = formatTimeUntilReset(rateLimitResult.resetTime);
      alert(`⏰ Daily Limit Reached!\n\nYou've generated ${rateLimitResult.generationsToday} plans today (max 3).\n\nYour limit resets in ${timeUntilReset}.\n\nCome back tomorrow for more personalized plans!`);
      return;
    }

    setCurrentStep('loading');
    setLoadingText("Starting Analysis...");

    // TRACKING: Log User Inputs + Rate Limit Tracking
    await trackGenerationStart(activeSession.user.id, activeSession.user.email);
    trackEvent(activeSession.user.id, 'generation_started', { inputs: stats, remaining: rateLimitResult.remaining - 1 });

    try {
      // Generate Logic
      const generatedPlan = await generateMealPlan(stats, (msg) => {
        setLoadingText(msg);
      });

      setPlan(generatedPlan);
      setCurrentStep('dashboard');

      // CRITICAL SECURITY: Reset Payment State IMMEDIATELY upon new generation.
      // Do not wait for DB confirmation. New Content = New Payment.
      setIsPaid(false);
      setPlanTier('free');

      // Clear the wizard state after successful generation to start fresh next time
      safeLocalStorage.removeItem('dietly_wizard_data');
      safeLocalStorage.removeItem('dietly_wizard_step');

      // A. Save to Active Plans (INSERT NEW ROW - History is preserved)
      // V2 Architecture: Pay-Per-Plan means every generation is a new unique row.
      if (activeSession.user.id !== 'mock_user_id') {
        const { data: newRow, error } = await supabase
          .from('plans')
          .insert({
            user_id: activeSession.user.id,
            data: generatedPlan,
            // id is auto-generated
          })
          .select()
          .single();

        if (error) {
          devError("Failed to save to Cloud:", error);
          // P0 FIX: ALERT USER ON FAIL
          alert(`CRITICAL ERROR: Your plan generated successfully, but could not be saved to our database.\n\nError: ${error.message || JSON.stringify(error)}\n\nPlease screenshot this and contact support.`);
        } else if (newRow) {
          setCurrentPlanId(newRow.id); // Track the new Plan ID
          // Payment state already reset above
        }

        // B. THE VAULT: Generate PDF Blob + Upload
        // We still upload PDF for backup, but 'plans' table is now the master record check.
        let pdfUrl: string | undefined = undefined;
        try {
          const blob = await generatePDFBlob(generatedPlan);
          const dateStr = new Date().toISOString().split('T')[0];
          // We don't have the Plan ID in the filename easily unless we used newRow.id, 
          // but keeping user/date format is fine for now.
          const uploadedUrl = await uploadPDF(activeSession.user.id, blob, dateStr);
          if (uploadedUrl) pdfUrl = uploadedUrl;
        } catch (pdfError) {
          console.warn("Vault Backup Failed (Non-Critical):", pdfError);
        }

        // C. Save to History (Optional / Duplicate?)
        // Since 'plans' table is now effectively the history (1:Many), we don't strictly *need* plan_history.
        // But to keep 'HistoryVault.tsx' working without major refactor yet, we can double-write OR update Vault later.
        // For now: DISABLED Double Write to avoid confusion. Vault should read valid 'plans'.
        // await saveHistory(activeSession.user.id, generatedPlan, pdfUrl); 
      }

      // C. Log Success
      trackEvent(activeSession.user.id, 'generation_complete', {
        calories: generatedPlan.userStats.tdee,
        goal: generatedPlan.userStats.goal
      });

    } catch (error: any) {
      devError(error);
      if (activeSession) trackEvent(activeSession.user.id, 'generation_failed', { error: String(error) });

      // P2 FIX BUG-023: USER-FRIENDLY ERROR MESSAGES
      let userMessage = "Failed to generate your plan. ";
      const errorStr = String(error?.message || error || '').toLowerCase();

      if (errorStr.includes('401') || errorStr.includes('unauthorized') || errorStr.includes('auth')) {
        userMessage += "Your session has expired. Please sign in again.";
      } else if (errorStr.includes('404') || errorStr.includes('not found')) {
        userMessage += "Our AI service is temporarily unavailable. Please try again in a few minutes.";
      } else if (errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('rate limit')) {
        userMessage += "You've reached your daily limit. Please try again tomorrow.";
      } else if (errorStr.includes('network') || errorStr.includes('fetch') || errorStr.includes('failed to fetch')) {
        userMessage += "Please check your internet connection and try again.";
      } else if (errorStr.includes('safety') || errorStr.includes('eating_disorder')) {
        // Safety-related errors should show the actual message
        userMessage = error?.message || "A safety check prevented plan generation. Please review your inputs.";
      } else {
        userMessage += "An unexpected error occurred. Please try again in a moment.";
      }

      alert(userMessage);
      setCurrentStep('wizard');
    }
  };

  const handleLogout = async () => {
    if (session) trackEvent(session.user.id, 'user_logout');
    await supabase.auth.signOut();
    setCurrentStep('wizard');
  };

  const resetApp = async () => {
    devLog("🔴 resetApp CALLED - About to show confirm dialog");
    if (window.confirm("Start over? This will generate a new plan.")) {
      devLog("🟢 User confirmed - resetting app");
      setCurrentStep('wizard');
      setPlan(null); // Clear state
      safeLocalStorage.removeItem('dietly_plan'); // Clear storage
      safeLocalStorage.removeItem('dietly_step');
      // FIX: Also clear wizard form state
      safeLocalStorage.removeItem('dietly_wizard_data');
      safeLocalStorage.removeItem('dietly_wizard_step');
      safeLocalStorage.removeItem('dietly_pending_wizard_data');
      localStorage.removeItem('intro_timer'); // Clear timer
      if (session) trackEvent(session.user.id, 'app_reset_clicked');
    } else {
      devLog("🟡 User cancelled reset");
    }
  };


  return (
    <div className="min-h-screen bg-light font-sans text-dark selection:bg-primary selection:text-white relative">
      {/* Navbar */}
      <nav className="p-2 md:p-6 flex justify-between items-center sticky top-0 bg-light/80 backdrop-blur-md z-40 border-b border-slate-200">
        <div
          className="flex items-center gap-2 text-primary font-extrabold text-xl md:text-2xl tracking-tighter cursor-default"
        >
          <div className="bg-gradient-to-br from-primary to-emerald-400 text-white p-1 md:p-1.5 rounded-lg shadow-lg shadow-primary/30">
            <Zap className="w-4 h-4 md:w-5 md:h-5 fill-white" />
          </div>
          <span className="hidden sm:inline bg-clip-text text-transparent bg-gradient-to-r from-primary to-emerald-700">DietlyPlans</span>
        </div>

        {session ? (
          <div className="flex gap-4">
            <button
              onClick={() => setShowHistory(true)}
              aria-label="Open history vault"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors border border-transparent hover:border-emerald-100"
              title="Open History Vault"
            >
              Vault
            </button>
            <button
              onClick={resetApp}
              aria-label="Start a new meal plan"
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm hover:shadow transition-all flex items-center gap-1.5"
            >
              New Plan
            </button>
            <button onClick={handleLogout} aria-label="Sign out of your account" className="text-sm font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        ) : (
          // Optional: Sign In button if they want to login early
          <button
            onClick={() => setShowAuthModal(true)}
            aria-label="Log in to your account"
            className="text-sm font-bold text-primary hover:text-primaryDark transition-colors"
          >
            Log In
          </button>
        )}
      </nav>

      <main className="container mx-auto px-4 py-8 pb-32 relative">
        {/* Background Decor */}
        <div className="fixed top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl -z-10 animate-pulse" />
        <div className="fixed bottom-20 right-10 w-96 h-96 bg-secondary/5 rounded-full blur-3xl -z-10" />

        {/* WIZARD (ALWAYS RENDERED UNLESS DASHBOARD IS ACTIVE) */}
        {currentStep === 'wizard' && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center mb-6 md:mb-10 space-y-2 md:space-y-3">
              <h1 className="text-2xl md:text-5xl font-extrabold text-dark tracking-tight leading-tight">
                {session ? "Welcome back." : "Build your plan."} <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-600 block md:inline mt-1 md:mt-0">
                  {session ? "Let's build a new roadmap." : "Start your transformation freely."}
                </span>
              </h1>
            </div>
            <Wizard onComplete={handleWizardComplete} loading={false} />
          </div>
        )}

        {/* DASHBOARD */}
        {currentStep === 'dashboard' && plan && (
          <div className="animate-in slide-in-from-bottom-10 fade-in duration-700">
            <Suspense fallback={<LoadingFallback />}>
              <Dashboard
                plan={plan}
                isPaid={isPaid}
                planTier={planTier}
                onUnlock={() => { }} // Legacy prop, we handle redirect inside Dashboard now
                userId={session?.user?.id}
                userEmail={session?.user?.email}
                planId={currentPlanId} // Pass ID to Dashboard for Checkout
              />
            </Suspense>
          </div>
        )}

        {/* LOADING OVERLAY */}
        {currentStep === 'loading' && (
          <div className="fixed inset-0 bg-light/95 backdrop-blur-md flex flex-col items-center justify-center z-50">
            <div className="relative mb-8">
              <div className="w-24 h-24 border-4 border-slate-200 rounded-full" />
              <div className="w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
              <Zap className="w-8 h-8 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
            </div>

            <h2 className="text-3xl font-black text-dark tracking-tight animate-pulse transition-all duration-300">
              {loadingText}
            </h2>

            {/* Progress Bar Visual */}
            <div className="w-64 h-2 bg-slate-200 rounded-full mt-6 overflow-hidden">
              <div className="h-full bg-primary animate-progress-indeterminate" />
            </div>

            <p className="text-slate-400 mt-4 font-medium text-sm">
              Saving to cloud... Syncing roadmap...
            </p>
          </div>
        )}

        {/* AUTH MODAL INTERCEPT */}
        {showAuthModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
            <div className="relative w-full max-w-md">
              <button
                onClick={() => setShowAuthModal(false)}
                className="absolute -top-12 right-0 md:-right-12 text-white hover:text-slate-200 transition-colors"
              >
                <X className="w-8 h-8" />
              </button>
              <Auth onLogin={() => {
                setShowAuthModal(false);
              }} isModal={true} onShowLegal={() => {
                setShowAuthModal(false);
                setCurrentStep('legal');
              }} />
            </div>
          </div>
        )}

        {/* HISTORY VAULT MODAL */}
        {showHistory && session && (
          <Suspense fallback={<LoadingFallback />}>
            <HistoryVault userId={session.user.id} onClose={() => setShowHistory(false)} onNewPlan={() => { setShowHistory(false); resetApp(); }} />
          </Suspense>
        )}

        {/* LEGAL PAGE OVERLAY */}
        {currentStep === 'legal' && (
          <Legal onBack={() => {
            if (plan && session) setCurrentStep('dashboard');
            else setCurrentStep('wizard');
          }} />
        )}

        {/* PAYMENT SUCCESS CELEBRATION */}
        {showPaymentSuccess && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-emerald-900/40 backdrop-blur-md animate-in fade-in duration-500">
            <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-500">
              <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500" />
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-black text-dark mb-2">You're In!</h2>
              <p className="text-slate-500 font-medium mb-6">
                Your plan is now fully unlocked. Welcome to the elite tier of DietlyPlans.
              </p>
              <button
                onClick={() => setShowPaymentSuccess(false)}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-200 active:scale-95 transition-all"
              >
                Let's Go
              </button>
            </div>
          </div>
        )}

      </main>

      <footer className="text-center p-8 text-slate-400 text-sm font-medium">
        <button onClick={() => setCurrentStep('legal')} className="hover:text-primary transition-colors hover:underline">
          &copy; 2025 DietlyPlans AI. Not medical advice. View Terms & Privacy.
        </button>
      </footer>

      {/* PAYMENT PROCESSING OVERLAY */}
      {
        isPaymentVerifying && (
          <div className="fixed inset-0 z-[60] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
            <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-100 flex flex-col items-center text-center max-w-sm mx-4">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <h3 className="text-xl font-black text-dark mb-2">Verifying Payment...</h3>
              <p className="text-slate-500 font-medium">Securely confirming your transaction with the payment provider.</p>
            </div>
          </div>
        )
      }

      <style>{`
        @keyframes progress-indeterminate {
            0% { width: 0%; margin-left: 0%; }
            50% { width: 70%; margin-left: 30%; }
            100% { width: 0%; margin-left: 100%; }
        }
        .animate-progress-indeterminate {
            animation: progress-indeterminate 2s infinite ease-in-out;
        }
      `}</style>
    </div >
  );
};

export default App;
