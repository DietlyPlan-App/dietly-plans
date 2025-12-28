
import React, { useState, useEffect, useRef } from 'react';
import Wizard from './components/Wizard';
import Dashboard from './components/Dashboard';
import Auth from './components/Auth'; // Import Auth
import { generateMealPlan } from './services/geminiService';
import { supabase, trackEvent, saveHistory } from './services/supabaseClient'; // Import Client & Tracking
import { UserStats, AIResponse } from './types';
import { Zap, LogOut, X, CheckCircle } from 'lucide-react';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null); // Track User Session
  const [currentStep, setCurrentStep] = useState<'wizard' | 'loading' | 'dashboard'>(() => {
    // RESTORE STEP FROM LOCAL STORAGE
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dietly_step') as any || 'wizard';
    }
    return 'wizard';
  });
  const [loadingText, setLoadingText] = useState("Initializing AI...");

  // RESTORE PLAN FROM LOCAL STORAGE (Instant Load)
  const [plan, setPlan] = useState<AIResponse | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dietly_plan');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });

  const [isPaid, setIsPaid] = useState(false);
  const [planTier, setPlanTier] = useState<'free' | '1month' | 'full'>('free');
  const [showAuthModal, setShowAuthModal] = useState(false); // New Modal State
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false); // Payment Success Modal

  // Track if we already logged login to prevent double-firing in StrictMode
  const loginLoggedRef = useRef(false);

  // 1. Check for Active Session on Load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserData(session.user.id);
        if (!loginLoggedRef.current) {
          trackEvent(session.user.id, 'session_restored', { method: 'auto' });
          loginLoggedRef.current = true;
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        fetchUserData(session.user.id);
        setShowAuthModal(false); // Close modal on successful auth logic

        if (event === 'SIGNED_IN') {
          trackEvent(session.user.id, 'user_login', { method: 'auth_change' });
        }
      } else {
        setPlan(null); // Clear plan on logout
        setIsPaid(false);
        setCurrentStep('wizard');
      }
    });

    // CHECK FOR PAYMENT SUCCESS RETURN
    const query = new URLSearchParams(window.location.search);
    if (query.get('success') === 'true') {
      setShowPaymentSuccess(true);
      // Clean URL
      window.history.replaceState({}, document.title, "/");

      // SECURITY FIX: Removed optimistic unlocking. 
      // We now rely purely on the Webhook -> DB update to set 'isPaid'.
      // This prevents users from bypassing the paywall by simply adding ?success=true
    }

    return () => subscription.unsubscribe();
  }, []);

  // PERSISTENCE EFFECT
  useEffect(() => {
    if (plan) {
      localStorage.setItem('dietly_plan', JSON.stringify(plan));
    } else {
      localStorage.removeItem('dietly_plan');
    }
    localStorage.setItem('dietly_step', currentStep);
  }, [plan, currentStep]);

  // 2. Fetch Plan from Supabase Database
  const fetchUserData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found" (New user)
        console.error('Error fetching plan:', error);
      }

      if (data) {
        setPlan(data.data as AIResponse);

        // PAYMENT STATUS CHECK
        // SECURITY FIX: Removed LocalStorage Temp Unlock. 
        // Only the Database Record is trusted.
        const dbPaidStatus = data.is_paid;

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
      console.error("DB Fetch Error", e);
    }
  };

  // 3. Generate & Save to Supabase (PLUS TRACKING)
  const handleWizardComplete = async (stats: UserStats) => {
    // --- AUTH INTERCEPT ---
    if (!session) {
      setShowAuthModal(true);
      return;
    }

    setCurrentStep('loading');
    setLoadingText("Starting Analysis...");

    // TRACKING: Log User Inputs (via the start of generation)
    trackEvent(session.user.id, 'generation_started', { inputs: stats });

    try {
      // Generate Logic
      const generatedPlan = await generateMealPlan(stats, (msg) => {
        setLoadingText(msg);
      });

      setPlan(generatedPlan);
      setCurrentStep('dashboard');

      // Clear the wizard state after successful generation to start fresh next time
      localStorage.removeItem('dietly_wizard_data');
      localStorage.removeItem('dietly_wizard_step');

      // A. Save to Active Plans (Upsert - Current State)
      const { error } = await supabase
        .from('plans')
        .upsert({
          user_id: session.user.id,
          data: generatedPlan,
          updated_at: new Date()
        });

      if (error) console.error("Failed to save to Cloud:", error);

      // B. Save to History (Insert - Permanent Record)
      saveHistory(session.user.id, generatedPlan);

      // C. Log Success
      trackEvent(session.user.id, 'generation_complete', {
        calories: generatedPlan.userStats.tdee,
        goal: generatedPlan.userStats.goal
      });

    } catch (error) {
      console.error(error);
      trackEvent(session.user.id, 'generation_failed', { error: String(error) });
      alert("Failed to generate plan. Please try again.");
      setCurrentStep('wizard');
    }
  };

  const handleLogout = async () => {
    if (session) trackEvent(session.user.id, 'user_logout');
    await supabase.auth.signOut();
    setCurrentStep('wizard');
  };

  const resetApp = async () => {
    if (window.confirm("Start over? This will generate a new plan.")) {
      setCurrentStep('wizard');
      setPlan(null); // Clear state
      localStorage.removeItem('dietly_plan'); // Clear storage
      localStorage.removeItem('dietly_step');
      if (session) trackEvent(session.user.id, 'app_reset_clicked');
    }
  };

  return (
    <div className="min-h-screen bg-light font-sans text-dark selection:bg-primary selection:text-white relative">
      {/* Navbar */}
      <nav className="p-4 md:p-6 flex justify-between items-center sticky top-0 bg-light/80 backdrop-blur-md z-40 border-b border-slate-200">
        <div
          className="flex items-center gap-2 text-primary font-extrabold text-2xl tracking-tighter cursor-default"
        >
          <div className="bg-gradient-to-br from-primary to-emerald-400 text-white p-1.5 rounded-lg shadow-lg shadow-primary/30">
            <Zap className="w-5 h-5 fill-white" />
          </div>
          <span className="hidden md:inline bg-clip-text text-transparent bg-gradient-to-r from-primary to-emerald-700">DietlyPlans</span>
        </div>

        {session ? (
          <div className="flex gap-4">
            {currentStep === 'dashboard' && (
              <button onClick={resetApp} className="text-sm font-bold text-slate-500 hover:text-primary transition-colors">
                New Plan
              </button>
            )}
            <button onClick={handleLogout} className="text-sm font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        ) : (
          // Optional: Sign In button if they want to login early
          <button
            onClick={() => setShowAuthModal(true)}
            className="text-sm font-bold text-primary hover:text-primaryDark transition-colors"
          >
            Log In
          </button>
        )}
      </nav>

      <main className="container mx-auto px-4 py-8 relative">
        {/* Background Decor */}
        <div className="fixed top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl -z-10 animate-pulse" />
        <div className="fixed bottom-20 right-10 w-96 h-96 bg-secondary/5 rounded-full blur-3xl -z-10" />

        {/* WIZARD (ALWAYS RENDERED UNLESS DASHBOARD IS ACTIVE) */}
        {currentStep === 'wizard' && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center mb-10 space-y-3">
              <h1 className="text-3xl md:text-5xl font-extrabold text-dark tracking-tight">
                {session ? "Welcome back." : "Build your plan."} <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-600">
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
            <Dashboard
              plan={plan}
              isPaid={isPaid}
              planTier={planTier}
              onUnlock={() => { }} // Legacy prop, we handle redirect inside Dashboard now
              userId={session?.user?.id}
              userEmail={session?.user?.email}
            />
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md">
              <button
                onClick={() => setShowAuthModal(false)}
                className="absolute -top-12 right-0 md:-right-12 text-white hover:text-slate-200 transition-colors"
              >
                <X className="w-8 h-8" />
              </button>
              <Auth onLogin={() => {
                // Session update in useEffect will handle closing
                // But we also close here for immediate feedback
                setShowAuthModal(false);
              }} isModal={true} />
            </div>
          </div>
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
        &copy; 2025 DietlyPlans AI. Not medical advice. Data processed by AI. By using this app, you acknowledge anonymized processing.
      </footer>

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
    </div>
  );
};

export default App;
