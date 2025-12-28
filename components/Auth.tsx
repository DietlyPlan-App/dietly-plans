
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Zap, Mail, Loader2, ArrowRight, KeyRound, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';

interface AuthProps {
  onLogin: () => void;
  isModal?: boolean;
}

type AuthMode = 'otp_request' | 'otp_verify';

const Auth: React.FC<AuthProps> = ({ onLogin, isModal = false }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [mode, setMode] = useState<AuthMode>('otp_request');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  // Timer for resend button
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setInterval(() => setResendTimer(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [resendTimer]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      // --- FLOW 1: REQUEST OTP CODE ---
      if (mode === 'otp_request') {
        const { error } = await supabase.auth.signInWithOtp({ 
            email,
            options: {
                shouldCreateUser: true, 
            }
        });
        if (error) throw error;
        
        setMode('otp_verify');
        setMessage(`Code sent to ${email}`);
        setResendTimer(30); 
      }
      // --- FLOW 2: VERIFY OTP CODE ---
      else if (mode === 'otp_verify') {
        
        // STRATEGY: Try 'email' (Magic Link) first. If that fails, try 'signup'.
        // This covers both returning users (Magic Link token) and new users (Signup token).
        
        let verifyError;

        // Attempt 1: Verify as Returning User (Magic Link / Email)
        const { data: dataEmail, error: errorEmail } = await supabase.auth.verifyOtp({
          email,
          token: otpToken,
          type: 'email', 
        });

        if (!errorEmail && dataEmail.session) {
             onLogin();
             return;
        }
        
        // Attempt 2: Verify as New User (Signup)
        // If Attempt 1 failed, it might be because it's a new user signup token
        if (errorEmail) {
            console.log("Email verification failed, trying signup verification...");
            const { data: dataSignup, error: errorSignup } = await supabase.auth.verifyOtp({
                email,
                token: otpToken,
                type: 'signup',
            });

            if (!errorSignup && dataSignup.session) {
                onLogin();
                return;
            }
            verifyError = errorSignup || errorEmail;
        }

        if (verifyError) throw verifyError;
      }
    } catch (err: any) {
      console.error(err);
      
      // IMPROVED ERROR MESSAGING
      let msg = err.message || "Invalid code. Please try again.";
      if (msg === "Failed to fetch") {
          msg = "Connection Error: Check Project URL & Key in supabaseClient.ts";
      }
      
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
      if (resendTimer > 0) return;
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
          const { error } = await supabase.auth.signInWithOtp({ email });
          if (error) throw error;
          setMessage("New code sent!");
          setResendTimer(30);
      } catch (err: any) {
          setError(err.message === "Failed to fetch" ? "Connection failed. Check API Keys." : err.message);
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className={`flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-8 duration-500 ${isModal ? 'min-h-0 py-4' : 'min-h-[60vh]'}`}>
      <div className={`bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 w-full relative overflow-hidden ${isModal ? 'p-6 md:p-8 max-w-sm' : 'p-8 md:p-10 max-w-md'}`}>
        
        {/* Decor */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-emerald-400" />
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />

        <div className="text-center mb-8">
          <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary">
            {mode === 'otp_verify' ? <CheckCircle2 className="w-8 h-8" /> : <KeyRound className="w-8 h-8" />}
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-dark tracking-tight">
            {mode === 'otp_request' && 'Start Transformation'}
            {mode === 'otp_verify' && 'Verify Code'}
          </h2>
          <p className="text-slate-400 font-medium mt-2 text-sm md:text-base">
            {mode === 'otp_request' 
                ? 'Enter your email to receive a secure login code.' 
                : `We sent a 6-digit code to ${email}`}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          
          {/* EMAIL INPUT */}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
            <input
              type="email"
              required
              placeholder="Email Address"
              value={email}
              disabled={mode === 'otp_verify'} 
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full pl-12 p-4 rounded-xl border-2 outline-none font-bold text-dark transition-all ${mode === 'otp_verify' ? 'bg-slate-50 border-slate-100 text-slate-500' : 'border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10'}`}
            />
            {mode === 'otp_verify' && (
                <button 
                    type="button"
                    onClick={() => setMode('otp_request')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-primary hover:text-primaryDark"
                >
                    Edit
                </button>
            )}
          </div>

          {/* OTP TOKEN INPUT */}
          {mode === 'otp_verify' && (
            <div className="relative animate-in fade-in slide-in-from-top-2">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type="text"
                required
                placeholder="123456"
                value={otpToken}
                onChange={(e) => setOtpToken(e.target.value)}
                autoFocus
                className="w-full pl-12 p-4 rounded-xl border-2 border-primary focus:ring-4 focus:ring-primary/10 outline-none font-bold text-dark text-lg tracking-[0.5em] transition-all"
              />
            </div>
          )}

          {/* MESSAGES */}
          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 text-sm font-bold rounded-xl text-center border border-rose-100 animate-in shake flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {message && (
            <div className="p-3 bg-emerald-50 text-emerald-600 text-sm font-bold rounded-xl text-center border border-emerald-100 animate-in fade-in">
              {message}
            </div>
          )}

          {/* MAIN ACTION BUTTON */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primaryDark text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : (
                <>
                    {mode === 'otp_request' && 'Send Secure Code'}
                    {mode === 'otp_verify' && 'Confirm & Login'}
                </>
            )}
            {!loading && <ArrowRight className="w-5 h-5" />}
          </button>
        </form>

        {/* RESEND / FOOTER LINKS */}
        <div className="mt-6 flex flex-col gap-3 text-center">
            {mode === 'otp_verify' && (
                 <button
                    onClick={handleResend}
                    disabled={resendTimer > 0 || loading}
                    className="text-slate-400 font-bold text-sm hover:text-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Resend Code"}
                </button>
            )}
            
            <p className="text-[10px] text-slate-300 font-medium">
                By continuing, you agree to our Terms & Safety Protocols.
            </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
