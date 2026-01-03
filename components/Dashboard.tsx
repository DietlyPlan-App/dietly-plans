
import React, { useState, useEffect } from 'react';
import { AIResponse, Meal, MonthPlan } from '../types';
import { Lock, Download, Droplets, Flame, Activity, Zap, ChevronDown, ChevronUp, ShoppingCart, Utensils, Leaf, AlertTriangle, Speaker, Pill, ClipboardList, Wallet, CloudSun, Microwave, Repeat, User, FileText, X, ExternalLink, Loader2, CheckCircle } from 'lucide-react';
import { generatePDF } from '../services/pdfService';
import { trackEvent } from '../services/supabaseClient'; // Import Tracking
import { getCheckoutUrl } from '../services/paymentService'; // Import Payment Service

interface DashboardProps {
    plan: AIResponse;
    isPaid: boolean;
    planTier: 'free' | '1month' | 'full';
    onUnlock: () => void;
    userId?: string;
    userEmail?: string;
}

// --- AUDIO HAPTICS ---
const playPop = () => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
};

// --- VISUAL SEMIOTICS ENGINE ---
const getMealEmoji = (name: string, type: string): string => {
    const n = name.toLowerCase();
    if (type === 'Breakfast') {
        if (n.includes('egg') || n.includes('omelet')) return '🍳';
        if (n.includes('oat') || n.includes('porridge')) return '🥣';
        if (n.includes('pancake') || n.includes('waffle')) return '🥞';
        if (n.includes('smoothie') || n.includes('shake')) return '🥤';
        if (n.includes('yogurt')) return '🍦';
        return '☕';
    }
    if (n.includes('chicken')) return '🍗';
    if (n.includes('beef') || n.includes('steak')) return '🥩';
    if (n.includes('fish') || n.includes('salmon') || n.includes('tuna')) return '🐟';
    if (n.includes('pork')) return '🍖';
    if (n.includes('salad')) return '🥗';
    if (n.includes('soup') || n.includes('stew')) return '🍲';
    if (n.includes('pasta') || n.includes('spaghetti')) return '🍝';
    if (n.includes('rice')) return '🍚';
    if (n.includes('burger')) return '🍔';
    if (n.includes('taco') || n.includes('mexican')) return '🌮';
    if (n.includes('sandwich') || n.includes('wrap')) return '🥪';
    if (n.includes('pizza')) return '🍕';
    if (n.includes('curry')) return '🥘';
    if (type === 'Snack') {
        if (n.includes('nut')) return '🥜';
        if (n.includes('fruit') || n.includes('apple') || n.includes('banana')) return '🍎';
        if (n.includes('bar')) return '🍫';
        return '🍪';
    }
    return '🍽️';
};

const MealDetail: React.FC<{ meal: Meal; type: string; isReheat?: boolean }> = ({ meal, type, isReheat }) => {
    const [isOpen, setIsOpen] = useState(false);
    const emoji = isReheat ? '🥡' : getMealEmoji(meal.name, type);
    const hasWarning = meal.warning ? true : false;

    const toggle = () => {
        playPop();
        setIsOpen(!isOpen);
    };

    return (
        <div className={`border-l-4 pl-4 py-1 hover:border-primary transition-all ${hasWarning ? 'border-amber-400 bg-amber-50/50' :
            isReheat ? 'border-sky-300 bg-sky-50/30' : 'border-slate-100'
            }`}>
            <div
                onClick={toggle}
                className="flex justify-between items-center cursor-pointer group"
            >
                <div className="flex items-center gap-3">
                    <span className="text-2xl filter drop-shadow-sm">{emoji}</span>
                    <div>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-0.5 flex items-center gap-2">
                            {type}
                            {isReheat && <span className="bg-sky-100 text-sky-600 px-1.5 rounded text-[9px] flex items-center gap-1"><Microwave className="w-3 h-3" /> REHEAT</span>}
                            {hasWarning && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                        </p>
                        <p className={`text-sm font-bold leading-tight group-hover:text-primary transition-colors line-clamp-1 ${isReheat ? 'text-slate-600' : 'text-dark'}`}>
                            {meal.name}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isOpen ? <ChevronUp className="w-5 h-5 text-slate-300" /> : <ChevronDown className="w-5 h-5 text-slate-300" />}
                </div>
            </div>

            {isOpen && (
                <div className="mt-3 text-xs text-slate-600 animate-in slide-in-from-top-2 duration-200 bg-slate-50 p-3 rounded-lg">

                    {/* SAFETY WARNING */}
                    {meal.warning && (
                        <div className="mb-3 p-2 bg-red-100 text-red-700 rounded-md font-bold border border-red-200 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            {meal.warning}
                        </div>
                    )}

                    {/* REHEAT INSTRUCTION */}
                    {isReheat && (
                        <div className="mb-3 p-2 bg-sky-100 text-sky-700 rounded-md font-bold border border-sky-200 flex items-start gap-2">
                            <Repeat className="w-4 h-4 shrink-0 mt-0.5" />
                            <p>Leftover Logic: Do not cook. Use the portion you cooked during last night's dinner.</p>
                        </div>
                    )}

                    {meal.description && (
                        <p className={`mb-2 italic border-b border-slate-200 pb-2 ${meal.description.includes('⚠️') ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>
                            {meal.description}
                        </p>
                    )}
                    <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
                        <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded font-bold">{meal.calories} kcal</span>
                        <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-bold">P: {meal.macros.p}g</span>
                        <span className="bg-green-100 text-green-600 px-2 py-0.5 rounded font-bold">C: {meal.macros.c}g</span>
                        <span className="bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded font-bold">F: {meal.macros.f}g</span>
                    </div>

                    {/* MICROS ROW */}
                    <div className="flex gap-2 mb-2 overflow-x-auto pb-1 text-[10px]">
                        {meal.macros.fiber && <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded font-bold">Fiber: {meal.macros.fiber}g</span>}
                        {meal.macros.sugar && <span className="bg-pink-100 text-pink-600 px-2 py-0.5 rounded font-bold">Sugar: {meal.macros.sugar}g</span>}
                        {meal.macros.sodium && <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">Na: {meal.macros.sodium}mg</span>}
                    </div>

                    <p className="font-bold mb-1 text-dark">Ingredients:</p>
                    <p className="font-bold mb-1 text-dark">Ingredients:</p>
                    <ul className="mb-3 leading-relaxed text-slate-500 space-y-1">
                        {meal.ingredients.map((ing, i) => (
                            <li key={i}>
                                {ing.split(/(\(Raw Weight\)|\(Cooked Weight\))/g).map((part, j) => {
                                    if (part === '(Raw Weight)') return <span key={j} className="text-rose-500 font-bold bg-rose-50 px-1 rounded">{part}</span>;
                                    if (part === '(Cooked Weight)') return <span key={j} className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded">{part}</span>;
                                    return part;
                                })}
                            </li>
                        ))}
                    </ul>

                    {/* Volume Injection Visual */}
                    {meal.sideDish && (
                        <div className="mb-3 p-2 bg-emerald-50 border border-emerald-100 rounded-md flex items-start gap-2">
                            <Leaf className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <div>
                                <span className="block font-bold text-emerald-700">Volume Boost (Required):</span>
                                <span className="text-emerald-600">{meal.sideDish}</span>
                            </div>
                        </div>
                    )}

                    {meal.instructions && meal.instructions.length > 0 && !isReheat && (
                        <>
                            <p className="font-bold mb-1 text-dark">Instructions:</p>
                            <ol className="space-y-2">
                                {meal.instructions.map((step, i) => (
                                    <li key={i} className="flex gap-2">
                                        <span className="bg-primary/10 text-primary w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                                        <span>{step}</span>
                                    </li>
                                ))}
                            </ol>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ plan, isPaid, planTier, userId, userEmail }) => {
    const [activeMonthKey, setActiveMonthKey] = useState<'month1' | 'month2' | 'month3'>('month1');
    const [activeWeek, setActiveWeek] = useState(0);
    const [viewMode, setViewMode] = useState<'meals' | 'groceries'>('meals');
    const [waterConsumed, setWaterConsumed] = useState(0);
    const [isCheckoutLoading, setIsCheckoutLoading] = useState<string | null>(null); // NEW: Track which tier is loading

    // NEW: State for PDF Confirmation Modal
    const [showPdfConfirm, setShowPdfConfirm] = useState(false);

    // COUNTDOWN TIMER
    const [timeLeft, setTimeLeft] = useState(() => {
        const saved = localStorage.getItem('intro_timer');
        if (saved) {
            const diff = Math.floor((Date.now() - parseInt(saved)) / 1000);
            return Math.max(0, (14 * 60 * 60) - diff);
        }
        localStorage.setItem('intro_timer', Date.now().toString());
        return 14 * 60 * 60;
    });

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleUnlockClick = async (tier: '1month' | 'full') => {
        playPop();
        if (userId) {
            setIsCheckoutLoading(tier);
            try {
                // Determine if we are in production
                const isProduction = window.location.hostname !== 'localhost';
                if (isProduction && (window as any).gtag) {
                    // Safe execution of analytics
                    (window as any).gtag('event', 'begin_checkout', {
                        currency: plan.userStats.currency,
                        value: tier === '1month' ? 9.99 : 19.99,
                        items: [{ item_id: tier, item_name: `${tier} plan` }]
                    });
                }

                const checkoutUrl = await getCheckoutUrl(
                    userId,
                    userEmail,
                    plan.userStats.name,
                    plan.userStats.currency,
                    tier
                );

                // UX: Clear loading state after 5 seconds if redirect doesn't happen instantly
                // or if user clicks back button
                setTimeout(() => setIsCheckoutLoading(null), 5000); // Failsafe

                window.location.href = checkoutUrl;
            } catch (e) {
                console.error("Checkout Trigger Failed", e);
                alert("Could not initiate checkout. Please check your connection.");
                setIsCheckoutLoading(null);
            }
        } else {
            alert("Please log in first.");
        }
    };

    // 1. Trigger the confirmation modal
    const handleDownloadRequest = () => {
        playPop();
        setShowPdfConfirm(true);
    };

    // 2. Actually execute the download
    const handleConfirmDownload = () => {
        playPop();
        setShowPdfConfirm(false);
        generatePDF(plan);
        if (userId) {
            trackEvent(userId, 'download_pdf', { fileName: `${plan.userStats.name}_Plan.pdf` });
        }
    };

    const setMonth = (m: any) => {
        playPop();
        setActiveMonthKey(m);
        setActiveWeek(0);
    };

    const setWeek = (idx: number) => {
        playPop();
        setActiveWeek(idx);
        setViewMode('meals');
    };

    const currentMonthData: MonthPlan = plan.roadmap[activeMonthKey];

    const weeks = [];
    for (let i = 0; i < currentMonthData.dailyPlan.length; i += 7) {
        weeks.push(currentMonthData.dailyPlan.slice(i, i + 7));
    }

    const currentWeekDays = weeks[activeWeek] || [];
    const weekLabel = `Week ${activeWeek + 1}`;

    const groceryKeys = ['week1', 'week2', 'week3', 'week4'] as const;
    const currentGroceries = activeWeek < 4 ? currentMonthData.groceries[groceryKeys[activeWeek]] : [];

    const toggleWater = () => {
        playPop();
        if (waterConsumed >= plan.userStats.waterTargetLitres) {
            setWaterConsumed(0);
        } else {
            setWaterConsumed(prev => Math.min(prev + 0.25, plan.userStats.waterTargetLitres));
        }
    };

    // Logic to show shopping list "Pantry Factor" warning
    const getPantryFactor = () => {
        const baseCals = plan.roadmap.month1.targetCalories;
        const currentCals = currentMonthData.targetCalories;
        if (currentCals >= baseCals) return null;

        const diff = Math.round(((baseCals - currentCals) / baseCals) * 100);
        return diff;
    };

    const pantryFactor = getPantryFactor();
    const isLeftoverStrategy = plan.userStats.mealStrategy === 'leftovers';
    const includeSnacks = plan.userStats.includeSnacks; // Used for "Daily Fuel" label

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-32">

            {/* 1. Header & Global Stats */}
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-3 md:gap-4 px-2 md:px-0">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black text-dark tracking-tight">
                        Welcome, <span className="text-primary">{plan.userStats.name}</span>
                    </h2>
                    <p className="text-slate-400 text-sm md:text-base font-medium">Here is your daily transformation protocol.</p>
                </div>
                <div className="flex items-center gap-2 bg-white px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-slate-100 shadow-sm w-fit">
                    <User className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400" />
                    <span className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">{plan.userStats.goal} MODE</span>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 px-2 md:px-0">
                {/* Phase Target */}
                <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center gap-1.5 md:gap-2 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-orange-400"></div>
                    <div className="p-2 md:p-3 bg-orange-50 rounded-xl md:rounded-2xl text-orange-500 mb-0.5 md:mb-1 group-hover:scale-110 transition-transform">
                        <Flame className="w-5 h-5 md:w-6 md:h-6 fill-orange-500/20" />
                    </div>
                    <div>
                        <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Daily Fuel <span className="text-orange-300">({includeSnacks ? '4' : '3'} Meals)</span>
                        </p>
                        <p className="text-xl md:text-2xl font-black text-dark tracking-tight">{currentMonthData.targetCalories} <span className="text-[10px] md:text-xs text-slate-400 font-medium">kcal</span></p>
                    </div>
                </div>

                {/* Interactive Water Tracker */}
                <button
                    onClick={toggleWater}
                    className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center gap-1.5 md:gap-2 relative overflow-hidden group active:scale-95 transition-all cursor-pointer"
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
                    {/* Progress BG */}
                    <div
                        className="absolute bottom-0 left-0 right-0 bg-blue-50 transition-all duration-500"
                        style={{ height: `${(waterConsumed / plan.userStats.waterTargetLitres) * 100}%` }}
                    />

                    <div className="p-2 md:p-3 bg-blue-50 rounded-xl md:rounded-2xl text-blue-500 mb-0.5 md:mb-1 z-10">
                        <Droplets className="w-5 h-5 md:w-6 md:h-6 fill-blue-500/20" />
                    </div>
                    <div className="z-10">
                        <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hydration</p>
                        {plan.userStats.unit === 'imperial' ? (
                            <p className="text-xl md:text-2xl font-black text-dark tracking-tight">
                                {Math.round(waterConsumed * 33.814)} <span className="text-slate-300">/</span> {Math.round(plan.userStats.waterTargetLitres * 33.814)} <span className="text-[10px] md:text-xs text-slate-400 font-medium">oz</span>
                            </p>
                        ) : (
                            <p className="text-xl md:text-2xl font-black text-dark tracking-tight">
                                {waterConsumed.toFixed(1)} <span className="text-slate-300">/</span> {plan.userStats.waterTargetLitres} <span className="text-[10px] md:text-xs text-slate-400 font-medium">L</span>
                            </p>
                        )}
                    </div>
                </button>

                {/* BMR */}
                <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center gap-1.5 md:gap-2 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-emerald-400"></div>
                    <div className="p-2 md:p-3 bg-emerald-50 rounded-xl md:rounded-2xl text-emerald-500 mb-0.5 md:mb-1">
                        <Activity className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <div>
                        <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Base Burn</p>
                        <p className="text-xl md:text-2xl font-black text-dark tracking-tight">{Math.round(plan.userStats.bmr)}</p>
                    </div>
                </div>

                {/* BMI */}
                <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center gap-1.5 md:gap-2 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-purple-400"></div>
                    <div className="p-2 md:p-3 bg-purple-50 rounded-xl md:rounded-2xl text-purple-500 mb-0.5 md:mb-1">
                        <Activity className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <div>
                        <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">BMI</p>
                        <p className="text-xl md:text-2xl font-black text-dark tracking-tight">{plan.userStats.bmi}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 px-2 md:px-0">

                {/* BUDGET STRATEGY */}
                {plan.budgetStrategy && (
                    <div className="bg-emerald-50 border-l-4 border-emerald-400 p-3 md:p-4 rounded-xl flex items-start gap-3 shadow-sm">
                        <Wallet className="w-5 h-5 md:w-6 md:h-6 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-emerald-800 text-[10px] md:text-sm uppercase tracking-wider mb-0.5 md:mb-1">Budget Strategy Applied</h4>
                            <p className="text-xs md:text-sm text-emerald-700 leading-relaxed font-medium">
                                {plan.budgetStrategy}
                            </p>
                        </div>
                    </div>
                )}

                {/* CLIMATE ANALYSIS */}
                {plan.climateAnalysis && (
                    <div className="bg-sky-50 border-l-4 border-sky-400 p-3 md:p-4 rounded-xl flex items-start gap-3 shadow-sm">
                        <CloudSun className="w-5 h-5 md:w-6 md:h-6 text-sky-500 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-sky-800 text-[10px] md:text-sm uppercase tracking-wider mb-0.5 md:mb-1">Regional Climate Analysis</h4>
                            <p className="text-xs md:text-sm text-sky-700 leading-relaxed font-medium">
                                {plan.climateAnalysis.advice}
                            </p>
                        </div>
                    </div>
                )}

                {/* ELECTROLYTE WARNING (High Priority Safety) */}
                {plan.userStats.needsElectrolytes && (
                    <div className="bg-amber-50 border-l-4 border-amber-400 p-3 md:p-4 rounded-xl flex items-start gap-3 shadow-sm md:col-span-2">
                        <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-amber-800 text-sm md:text-base">High Hydration Warning</h4>
                            <p className="text-xs md:text-sm text-amber-700 leading-relaxed">
                                Based on your activity and region, your water target is high ({plan.userStats.unit === 'imperial' ? `${Math.round(plan.userStats.waterTargetLitres * 33.814)} oz` : `${plan.userStats.waterTargetLitres}L`}).
                                To prevent <strong>electrolyte imbalance</strong>, consider adding a pinch of sea salt or electrolytes to your water once a day.
                            </p>
                        </div>
                    </div>
                )}

                {/* MEDICATION WARNING (Medical Priority) */}
                {plan.medicationAnalysis && (
                    <div className="bg-rose-50 border-l-4 border-rose-500 p-3 md:p-4 rounded-xl flex items-start gap-3 shadow-sm md:col-span-2">
                        <Pill className="w-5 h-5 md:w-6 md:h-6 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-rose-800 text-sm md:text-base">Food-Drug Interaction Safety Check</h4>
                            <p className="text-xs md:text-sm text-rose-700 leading-relaxed font-medium">
                                {plan.medicationAnalysis}
                            </p>
                        </div>
                    </div>
                )}

                {/* METABOLIC TRANSPARENCY WIDGET (Remediation) */}
                {plan.metabolicLog && plan.metabolicLog.length > 0 && (
                    <div className="bg-indigo-50 border-l-4 border-indigo-500 p-3 md:p-4 rounded-xl flex items-start gap-3 shadow-sm md:col-span-2">
                        <Activity className="w-5 h-5 md:w-6 md:h-6 text-indigo-500 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-indigo-800 text-sm md:text-base">Metabolic Logic Engine</h4>
                            <p className="text-[10px] md:text-xs text-indigo-600 mb-1.5 md:mb-2 font-medium italic">Why are my calories/macros calculated this way?</p>
                            <ul className="text-[11px] md:text-sm text-indigo-700 leading-relaxed font-medium space-y-1">
                                {plan.metabolicLog.map((log, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></span>
                                        {log}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. PHASE (MONTH) SELECTOR */}
            <div className="bg-dark rounded-2xl md:rounded-[2rem] p-1.5 md:p-2 flex flex-col md:flex-row gap-2 shadow-xl shadow-slate-200 relative md:sticky md:top-2 z-30 mx-2 md:mx-0">
                <div className="flex-1 grid grid-cols-3 gap-1.5 md:gap-2">
                    {(['month1', 'month2', 'month3'] as const).map((m, idx) => (
                        <button
                            key={m}
                            onClick={() => setMonth(m)}
                            className={`py-3 md:py-4 px-1 md:px-2 rounded-xl md:rounded-3xl text-[11px] md:text-sm font-bold transition-all relative overflow-hidden ${activeMonthKey === m ? 'bg-primary text-white shadow-lg' : 'bg-transparent text-slate-400 hover:bg-slate-800'}`}
                        >
                            <span className="block text-[8px] md:text-[10px] opacity-70 uppercase tracking-widest mb-0.5 md:mb-1">Phase {idx + 1}</span>
                            {idx === 0 ? "Ignition" : idx === 1 ? "Momentum" : "Peak"}
                        </button>
                    ))}
                </div>
                <div className="hidden md:flex bg-slate-800/50 rounded-[20px] px-6 py-3 items-center justify-between gap-4 text-white">
                    <div className="text-left">
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Phase Focus</p>
                        <p className="font-bold text-sm md:text-lg text-secondary">{currentMonthData.phaseName}</p>
                    </div>
                </div>
            </div>

            {/* 3. Controls */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h2 className="text-2xl font-black text-dark flex items-center gap-2">
                        Monthly Roadmap
                        {!isPaid && <span className="bg-secondary text-white text-[10px] font-bold px-2 py-1 rounded-full">PREVIEW MODE</span>}
                    </h2>
                    <button
                        onClick={handleDownloadRequest}
                        className="flex bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-5 py-3 rounded-2xl font-bold items-center gap-2 transition-all shadow-sm active:scale-95 w-full md:w-auto justify-center"
                    >
                        <Download className="w-4 h-4" />
                        Download Plan
                    </button>
                </div>

                {/* Tab Navigation (Weeks) */}
                <div className="bg-white p-2 rounded-3xl shadow-sm border border-slate-100 flex overflow-x-auto gap-2 scrollbar-hide">
                    {weeks.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setWeek(idx)}
                            className={`flex-1 min-w-[100px] py-4 rounded-2xl font-bold text-sm transition-all whitespace-nowrap ${activeWeek === idx ? 'bg-dark text-white shadow-lg shadow-slate-200' : 'hover:bg-slate-50 text-slate-400'}`}
                        >
                            Week {idx + 1}
                        </button>
                    ))}
                </div>

                {/* Sub-View Toggle */}
                <div className="flex gap-6 border-b-2 border-slate-100 px-4">
                    <button
                        onClick={() => { playPop(); setViewMode('meals'); }}
                        className={`pb-3 flex items-center gap-2 font-bold text-lg transition-all border-b-4 -mb-[2px] ${viewMode === 'meals' ? 'border-primary text-primary' : 'border-transparent text-slate-300 hover:text-slate-400'}`}
                    >
                        <Utensils className="w-5 h-5" />
                        Meals
                    </button>
                    <button
                        onClick={() => { playPop(); setViewMode('groceries'); }}
                        className={`pb-3 flex items-center gap-2 font-bold text-lg transition-all border-b-4 -mb-[2px] ${viewMode === 'groceries' ? 'border-primary text-primary' : 'border-transparent text-slate-300 hover:text-slate-400'}`}
                    >
                        <ShoppingCart className="w-5 h-5" />
                        Shopping
                    </button>
                </div>

                {/* Content Area */}
                <div className="min-h-[400px]">
                    {viewMode === 'meals' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            {currentWeekDays.map((day) => {
                                // IMPROVED LOCKING LOGIC FOR TIERS
                                // Month 1: 1-month or full
                                // Month 2/3: only full
                                const isMonth1 = activeMonthKey === 'month1';
                                const isGlobalIndex = ((day.day - 1) >= 3);

                                let isLocked = true;
                                if (planTier === 'full') {
                                    isLocked = false;
                                } else if (planTier === '1month') {
                                    if (isMonth1) isLocked = false;
                                } else {
                                    // free
                                    if (isMonth1 && !isGlobalIndex) isLocked = false;
                                }

                                // LOGIC CHANGE: Day 1 Lunch cannot be leftover from previous night (does not exist).
                                // So we only apply reheat logic if day > 1.
                                const isReheatLunch = isLeftoverStrategy && day.day > 1;

                                return (
                                    <div
                                        key={day.day}
                                        className={`bg-white rounded-2xl md:rounded-[2rem] overflow-hidden border border-slate-100 shadow-sm relative transition-all duration-300 ${isLocked ? 'blur-[2px] select-none opacity-80' : 'hover:shadow-xl hover:-translate-y-1 hover:border-primary/20'}`}
                                    >
                                        {/* Card Header */}
                                        <div className={`p-3 md:p-5 flex justify-between items-center ${isLocked ? 'bg-slate-50' : 'bg-gradient-to-br from-slate-50 to-white'}`}>
                                            <div className="flex items-center gap-2 md:gap-3">
                                                <span className={`flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full font-black text-base md:text-lg ${isLocked ? 'bg-slate-200 text-slate-400' : 'bg-primary text-white shadow-lg shadow-primary/30'}`}>
                                                    {day.day}
                                                </span>
                                                <span className="font-bold text-slate-400 text-xs md:text-sm">Day</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-[10px] md:text-xs font-bold text-slate-600 bg-white px-2 md:px-3 py-1 md:py-1.5 rounded-full border border-slate-100 shadow-sm">
                                                <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                                                {day.dailyMacros.calories}
                                            </div>
                                        </div>

                                        {/* Card Body */}
                                        <div className="p-3 md:p-5 space-y-4 md:space-y-6">
                                            {!isLocked ? (
                                                <>
                                                    <MealDetail meal={day.meals.breakfast} type="Breakfast" />

                                                    <MealDetail
                                                        meal={day.meals.lunch}
                                                        type="Lunch"
                                                        isReheat={isReheatLunch} // <--- VISUAL LOGIC
                                                    />

                                                    <MealDetail meal={day.meals.dinner} type="Dinner" />

                                                    {day.meals.snack && <MealDetail meal={day.meals.snack} type="Snack" />}
                                                </>
                                            ) : (
                                                // Locked State Placeholders
                                                <div className="space-y-4 opacity-50">
                                                    <div className="h-16 bg-slate-100 rounded-xl w-full animate-pulse" />
                                                    <div className="h-16 bg-slate-100 rounded-xl w-full animate-pulse" />
                                                    <div className="h-16 bg-slate-100 rounded-xl w-full animate-pulse" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Lock Overlay */}
                                        {isLocked && (
                                            <div className="absolute inset-0 z-10 bg-white/40 backdrop-blur-[2px] flex items-center justify-center">
                                                <div className="bg-white p-4 rounded-full shadow-2xl scale-110">
                                                    <Lock className="w-8 h-8 text-slate-300" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 md:p-10 shadow-lg animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-4 bg-primary/10 rounded-2xl">
                                    <ShoppingCart className="w-8 h-8 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-dark">Shopping List</h3>
                                    <p className="text-slate-400 font-medium">Items for {weekLabel}</p>
                                </div>
                            </div>

                            {/* PANTRY TIPS */}
                            {plan.pantryTips && (
                                <div className="mb-6 p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 text-sm font-medium flex items-start gap-2">
                                    <ClipboardList className="w-5 h-5 shrink-0" />
                                    <p>
                                        <strong>Chef's Pantry Tips:</strong> {plan.pantryTips}
                                    </p>
                                </div>
                            )}

                            {/* PANTRY FACTOR WARNING */}
                            {pantryFactor && pantryFactor > 0 && (
                                <div className="mb-8 p-4 bg-blue-50 text-blue-800 rounded-xl border border-blue-100 text-sm font-medium flex items-start gap-2">
                                    <Zap className="w-5 h-5 shrink-0" />
                                    <p>
                                        <strong>Optimization Note:</strong> Your calories for this month have dropped by {pantryFactor}%.
                                        Please buy slightly less of your bulk proteins and carbs (Rice, Chicken, etc) than what is listed below to avoid waste.
                                    </p>
                                </div>
                            )}

                            {!isPaid ? (
                                <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                    <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                    <p className="text-slate-500 font-bold text-lg">Full List Locked</p>
                                    <p className="text-slate-400 text-sm max-w-xs mx-auto mt-2">Unlock the full 12-week transformation to access precise shopping lists for every week.</p>
                                </div>
                            ) : (
                                currentGroceries && currentGroceries.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                        {currentGroceries.map((cat, idx) => (
                                            <div key={idx} className="bg-slate-50/50 p-6 rounded-3xl">
                                                <h4 className="font-extrabold text-lg text-primary mb-4 uppercase tracking-wider flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-primary" />
                                                    {cat.category}
                                                </h4>
                                                <ul className="space-y-3">
                                                    {cat.items.map((item, i) => (
                                                        <li key={i} className="flex items-start gap-3 text-slate-600 font-semibold text-sm group">
                                                            <div className="w-5 h-5 rounded-md border-2 border-slate-200 flex items-center justify-center group-hover:border-primary transition-colors cursor-pointer">
                                                                <div className="w-2.5 h-2.5 rounded-sm bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            </div>
                                                            <span className="mt-0.5">{item}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-10 text-slate-400">
                                        <p>No specific shopping list generated for this week.</p>
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Paywall CTA - Dual Tier Redesign */}
            {
                !isPaid && (
                    <div className="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-light via-light/95 to-transparent z-50 flex justify-center pb-8 md:pb-12 pointer-events-none">
                        <div className="bg-dark text-white p-2 rounded-[2.5rem] shadow-2xl shadow-secondary/30 max-w-4xl w-full text-center relative overflow-hidden ring-4 ring-white pointer-events-auto">
                            <div className="bg-slate-900 rounded-[2.2rem] p-6 relative z-10">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-secondary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                                <div className="text-center mb-6">
                                    <div className="flex items-center justify-center gap-2 mb-1">
                                        <span className="bg-secondary text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Limited Offer</span>
                                        <span className="text-secondary font-mono font-bold bg-secondary/10 px-2 rounded text-xs">{formatTime(timeLeft)}</span>
                                    </div>
                                    <h3 className="text-2xl font-black tracking-tight">Unlock Your Transformation</h3>
                                    <p className="text-slate-400 text-sm font-medium">Choose your roadmap to success.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* TIER 1: 1 Month */}
                                    <div className="bg-slate-800/50 p-5 rounded-3xl border border-slate-700 hover:border-slate-500 transition-all group flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="p-2 bg-slate-700 rounded-xl">
                                                    <Utensils className="w-5 h-5 text-slate-300" />
                                                </div>
                                                <span className="text-2xl font-black">$9.99</span>
                                            </div>
                                            <h4 className="text-lg font-bold text-left mb-2">1-Month Kickstart</h4>
                                            <ul className="text-left space-y-2 mb-6 text-xs text-slate-400 font-medium">
                                                <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Full Month 1 Access</li>
                                                <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Basic Shopping List</li>
                                                <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> PDF Export</li>
                                            </ul>
                                        </div>
                                        <button
                                            onClick={() => handleUnlockClick('1month')}
                                            disabled={!!isCheckoutLoading}
                                            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {isCheckoutLoading === '1month' ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start 1 Month"}
                                        </button>
                                    </div>

                                    {/* TIER 2: 3 Months */}
                                    <div className="bg-secondary p-5 rounded-3xl border border-secondary shadow-lg shadow-secondary/20 hover:scale-[1.02] transition-all group flex flex-col justify-between relative overflow-hidden">
                                        <div className="absolute top-4 right-4 bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Best Value</div>
                                        <div className="relative z-10">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="p-2 bg-white/20 rounded-xl">
                                                    <Zap className="w-5 h-5 text-white fill-white" />
                                                </div>
                                                <span className="text-2xl font-black">$19.99</span>
                                            </div>
                                            <h4 className="text-lg font-bold text-left mb-2">Full 12-Week Roadmap</h4>
                                            <ul className="text-left space-y-2 mb-6 text-xs text-white/80 font-medium">
                                                <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5" /> Full 3-Month Access</li>
                                                <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5" /> All Phase Adjustments</li>
                                                <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5" /> Premium 12-Week PDF</li>
                                            </ul>
                                        </div>
                                        <button
                                            onClick={() => handleUnlockClick('full')}
                                            disabled={!!isCheckoutLoading}
                                            className="w-full bg-white text-secondary hover:bg-slate-50 font-black py-3 rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 relative z-10"
                                        >
                                            {isCheckoutLoading === 'full' ? <Loader2 className="w-4 h-4 animate-spin text-secondary" /> : "Unlock Full App"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Floating PDF Button - Hidden on Mobile if Unpaid to prevent Paywall Overlap */}
            <div className={`fixed bottom-8 right-8 z-40 animate-in zoom-in duration-300 ${!isPaid ? 'hidden md:block' : ''}`}>
                <button
                    onClick={handleDownloadRequest}
                    className="bg-primary text-white p-3 md:p-4 rounded-full shadow-2xl shadow-primary/40 hover:bg-primaryDark transition-all flex items-center gap-3 pr-6 md:pr-8 group hover:scale-105"
                >
                    <div className="bg-white/20 p-2 rounded-full">
                        <Download className="w-5 h-5 md:w-6 md:h-6 group-hover:scale-110 transition-transform" />
                    </div>
                    <span className="font-bold text-sm md:text-lg">PDF Book</span>
                </button>
            </div>

            {/* CONFIRMATION MODAL */}
            {
                showPdfConfirm && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-[2rem] max-w-sm w-full p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-start mb-6">
                                <div className="p-3 bg-primary/10 rounded-2xl">
                                    <FileText className="w-8 h-8 text-primary" />
                                </div>
                                <button onClick={() => setShowPdfConfirm(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-400" />
                                </button>
                            </div>

                            <h3 className="text-xl font-black text-dark mb-2">Ready to download?</h3>
                            <p className="text-slate-500 text-sm leading-relaxed mb-6 font-medium">
                                This will generate a complete 12-week PDF roadmap customized for <strong>{plan.userStats.name}</strong>.
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowPdfConfirm(false)}
                                    className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmDownload}
                                    className="flex-1 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/30 hover:bg-primaryDark transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    Generate
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Dashboard;
