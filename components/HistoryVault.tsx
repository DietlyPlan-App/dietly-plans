
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
            <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-300 relative flex flex-col max-h-[85vh]">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 z-20 p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="pt-8 px-8 pb-6 border-b border-slate-50">
                    <div className="flex items-center gap-4">
                        <div className="p-3.5 bg-slate-900 rounded-2xl shadow-xl shadow-slate-200">
                            <Folder className="w-8 h-8 text-white fill-white/20" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                                The Vault
                            </h2>
                            <p className="text-sm text-slate-500 font-medium mt-0.5">Your personal plan archive.</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar space-y-4">
                    {loading ? (
                        <div className="py-12 text-center text-slate-400 animate-pulse flex flex-col items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-full"></div>
                            <p className="font-bold text-xs uppercase tracking-wider opacity-50">Loading History...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="py-12 text-center">
                            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-4xl shadow-sm -rotate-3">🕸️</div>
                            <h3 className="text-slate-900 font-black text-lg mb-2">The Vault is empty</h3>
                            <p className="text-slate-500 text-sm mb-8 leading-relaxed max-w-[200px] mx-auto">Generate your first plan to start building your history.</p>
                            <button onClick={onClose} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-slate-900/10 hover:scale-[1.02] active:scale-95 transition-all">
                                Generate New Plan
                            </button>
                        </div>
                    ) : (
                        history.map((item, idx) => {
                            const meta = getPlanDisplay(item);

                            return (
                                <div key={idx} className="group p-5 bg-white border border-slate-100 hover:border-slate-300 rounded-[1.5rem] transition-all shadow-sm hover:shadow-lg hover:-translate-y-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-5">
                                        <div className={`h-14 w-14 rounded-2xl ${meta.bg} flex items-center justify-center border ${meta.border} shadow-sm group-hover:scale-110 transition-transform duration-300 shrink-0`}>
                                            {meta.icon}
                                        </div>
                                        <div>
                                            <h3 className="text-slate-900 font-extrabold text-base leading-tight mb-1.5">
                                                {meta.title}
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                <span className="bg-slate-50 px-2 py-1 rounded-md">{new Date(item.date).toLocaleDateString()}</span>
                                                {item.calories && <span className="flex items-center gap-1"><Flame className="w-3 h-3" /> {item.calories} kcal</span>}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end">
                                        {item.pdfUrl ? (
                                            <a
                                                href={item.pdfUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                                            >
                                                <Download className="w-4 h-4" />
                                                Download
                                            </a>
                                        ) : item.plan ? (
                                            <button
                                                onClick={() => item.plan && handleRegenerate(item.plan, idx)}
                                                disabled={generatingId === idx}
                                                className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-slate-900/20 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                                            >
                                                {generatingId === idx ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                {generatingId === idx ? "Building..." : "Regenerate"}
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-2 group/tooltip relative">
                                                <div className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-400 text-[10px] font-bold select-none">
                                                    Unavailable
                                                </div>
                                                <Info className="w-4 h-4 text-slate-300 cursor-help" />

                                                {/* Tooltip */}
                                                <div className="absolute bottom-full right-0 mb-2 w-48 p-3 bg-slate-800 text-white text-[10px] rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none shadow-xl z-10 leading-relaxed font-medium">
                                                    Plan data is missing from the archive and cannot be regenerated.
                                                    <div className="absolute -bottom-1 right-4 w-2 h-2 bg-slate-800 rotate-45"></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Secure Footer */}
                <div className="py-5 bg-slate-50 border-t border-slate-100 text-center flex items-center justify-center gap-2 opacity-60 shrink-0">
                    <Shield className="w-3 h-3 text-slate-400" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Encrypted Storage</span>
                </div>
            </div>
        </div>
    );
};
