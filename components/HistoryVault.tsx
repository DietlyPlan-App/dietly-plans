
import React, { useEffect, useState } from 'react';
import { fetchUserHistory, supabase } from '../services/supabaseClient';
import { generatePDF } from '../services/pdfService';
import { AIResponse, Goal } from '../types';
import {
    X,
    Folder,
    FileText,
    Flame,
    Dumbbell,
    Shield,
    Info,
    RefreshCw,
    Download,
    Loader2
} from 'lucide-react';

interface HistoryItem {
    date: string;
    title: string;
    pdfUrl?: string;
    calories?: number;
    plan?: AIResponse;
}

interface HistoryVaultProps {
    userId: string;
    onClose: () => void;
}

export const HistoryVault: React.FC<HistoryVaultProps> = ({ userId, onClose }) => {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [generatingId, setGeneratingId] = useState<number | null>(null);

    useEffect(() => {
        const loadHistory = async () => {
            const data = await fetchUserHistory(userId);
            setHistory(data);
            setLoading(false);
        };
        loadHistory();
    }, [userId]);

    const handleRegenerate = async (plan: AIResponse, index: number) => {
        setGeneratingId(index);
        try {
            generatePDF(plan);
        } catch (e) {
            console.error("Regeneration failed", e);
            alert("Failed to regenerate PDF.");
        } finally {
            setGeneratingId(null);
        }
    };

    // --- HELPERS ---
    const getPlanDisplay = (item: HistoryItem) => {
        const goal = item.plan?.userStats.goal;

        switch (goal) {
            case 'lose':
                return {
                    title: "Rapid Fat Loss Protocol",
                    icon: <Flame className="w-6 h-6 text-orange-500 fill-orange-500/20" />,
                    bg: "bg-orange-50",
                    border: "border-orange-100"
                };
            case 'gain':
                return {
                    title: "Muscle Building Roadmap",
                    icon: <Dumbbell className="w-6 h-6 text-blue-500 fill-blue-500/20" />,
                    bg: "bg-blue-50",
                    border: "border-blue-100"
                };
            case 'maintain':
                return {
                    title: "Metabolic Maintenance",
                    icon: <Shield className="w-6 h-6 text-emerald-500 fill-emerald-500/20" />,
                    bg: "bg-emerald-50",
                    border: "border-emerald-100"
                };
            default:
                return {
                    title: item.title || "Custom Diet Plan",
                    icon: <FileText className="w-6 h-6 text-slate-400" />,
                    bg: "bg-slate-50",
                    border: "border-slate-100"
                };
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] w-full max-w-sm md:max-w-md overflow-hidden shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-300 relative flex flex-col max-h-[80vh]">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 md:top-6 md:right-6 z-20 p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="pt-6 px-6 pb-4 md:pt-8 md:px-8 md:pb-6 border-b border-slate-50">
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="p-3 bg-slate-900 rounded-xl md:rounded-2xl shadow-xl shadow-slate-200">
                            <Folder className="w-6 h-6 md:w-8 md:h-8 text-white fill-white/20" />
                        </div>
                        <div>
                            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                                The Vault
                            </h2>
                            <p className="text-xs md:text-sm text-slate-500 font-medium mt-0.5">Your personal plan archive.</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar space-y-3 md:space-y-4">
                    {loading ? (
                        <div className="py-12 text-center text-slate-400 animate-pulse flex flex-col items-center gap-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-100 rounded-full"></div>
                            <p className="font-bold text-[10px] md:text-xs uppercase tracking-wider opacity-50">Loading History...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-sm -rotate-3">🕸️</div>
                            <h3 className="text-slate-900 font-black text-base mb-1">The Vault is empty</h3>
                            <p className="text-slate-500 text-xs mb-6 leading-relaxed max-w-[180px] mx-auto">Generate your first plan to start building history.</p>
                            <button onClick={onClose} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg shadow-slate-900/10 active:scale-95 transition-all text-sm">
                                Generate New Plan
                            </button>
                        </div>
                    ) : (
                        history.map((item, idx) => {
                            const meta = getPlanDisplay(item);

                            return (
                                <div key={idx} className="group p-4 bg-white border border-slate-100 hover:border-slate-300 rounded-2xl md:rounded-[1.5rem] transition-all shadow-sm hover:shadow-lg flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                                        <div className={`h-10 w-10 md:h-12 md:w-12 rounded-xl ${meta.bg} flex items-center justify-center border ${meta.border} shadow-sm shrink-0`}>
                                            {React.cloneElement(meta.icon as React.ReactElement, { className: "w-5 h-5 md:w-6 md:h-6" })}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-slate-900 font-extrabold text-sm md:text-base leading-tight mb-1 truncate pr-2">
                                                {meta.title}
                                            </h3>
                                            <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                <span className="bg-slate-50 px-1.5 py-0.5 rounded text-nowrap">{new Date(item.date).toLocaleDateString()}</span>
                                                {item.calories && <span className="hidden sm:flex items-center gap-1">• {item.calories} kcal</span>}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end shrink-0">
                                        {item.pdfUrl ? (
                                            <a
                                                href={item.pdfUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-3 py-2 md:px-4 md:py-2.5 rounded-lg md:rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] md:text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 active:scale-95"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                <span className="hidden sm:inline">Download</span>
                                            </a>
                                        ) : item.plan ? (
                                            <button
                                                onClick={() => item.plan && handleRegenerate(item.plan, idx)}
                                                disabled={generatingId === idx}
                                                className="px-3 py-2 md:px-4 md:py-2.5 rounded-lg md:rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[10px] md:text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-slate-900/20 active:scale-95 disabled:opacity-70"
                                            >
                                                {generatingId === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                                <span className="hidden sm:inline">{generatingId === idx ? "Building..." : "Regenerate"}</span>
                                                <span className="sm:hidden">{generatingId === idx ? "..." : "Fix"}</span>
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-2 group/tooltip relative">
                                                <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-[9px] font-bold select-none border border-slate-200">
                                                    Unavailable
                                                </div>
                                                <Info className="w-3.5 h-3.5 text-slate-300 md:hidden" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Secure Footer */}
                <div className="py-3 md:py-4 bg-slate-50 border-t border-slate-100 text-center flex items-center justify-center gap-1.5 opacity-60 shrink-0">
                    <Shield className="w-2.5 h-2.5 text-slate-400" />
                    <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-wider">Encrypted Storage</span>
                </div>
            </div>
        </div>
    );
};
