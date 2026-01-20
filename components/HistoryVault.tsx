
import React, { useEffect, useState } from 'react';
import { fetchUserHistory, supabase } from '../services/supabaseClient';

interface HistoryItem {
    date: string;
    title: string;
    pdfUrl?: string;
    calories?: number;
}

interface HistoryVaultProps {
    userId: string;
    onClose: () => void;
}

export const HistoryVault: React.FC<HistoryVaultProps> = ({ userId, onClose }) => {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadHistory = async () => {
            const data = await fetchUserHistory(userId);
            setHistory(data);
            setLoading(false);
        };
        loadHistory();
    }, [userId]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] ring-1 ring-black/5 animate-in zoom-in-95 duration-300 relative">

                {/* Close Button (Absolute) */}
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 z-20 p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                    ✕
                </button>

                {/* Header */}
                <div className="pt-8 px-8 pb-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100">
                            <span className="text-2xl">📂</span>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                The Vault
                                <span className="text-[8px] font-black px-1.5 py-0.5 bg-slate-900 text-white rounded-full uppercase tracking-wider">Beta</span>
                            </h2>
                            <p className="text-sm text-slate-500 font-medium">Your diet plan archive.</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="px-5 pb-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="py-12 text-center text-slate-400 animate-pulse flex flex-col items-center gap-3">
                            <div className="w-12 h-12 bg-slate-50 rounded-full"></div>
                            <p className="font-medium text-xs uppercase tracking-wider">Loading History...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="py-12 text-center px-8">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-sm rotate-3">🕸️</div>
                            <h3 className="text-slate-900 font-bold mb-2">The Vault is empty</h3>
                            <p className="text-slate-500 text-sm mb-6 leading-relaxed">Generate your first plan to start building your transformation history.</p>
                            <button onClick={onClose} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg shadow-slate-900/20 hover:scale-[1.02] active:scale-95 transition-all">
                                Generate Plan
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {history.map((item, idx) => (
                                <div key={idx} className="group p-4 bg-white border border-slate-200 hover:border-emerald-200 rounded-2xl transition-all shadow-sm hover:shadow-md flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-xl shadow-sm group-hover:scale-110 group-hover:bg-emerald-50 group-hover:border-emerald-100 transition-all">
                                            📄
                                        </div>
                                        <div>
                                            <h3 className="text-slate-900 font-bold text-sm leading-tight mb-1 group-hover:text-emerald-700 transition-colors">
                                                {item.title}
                                            </h3>
                                            <div className="flex gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                <span>{new Date(item.date).toLocaleDateString()}</span>
                                                {item.calories && <span>• {item.calories} kcal</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {item.pdfUrl ? (
                                        <a
                                            href={item.pdfUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 hover:-translate-y-0.5 active:scale-95"
                                        >
                                            <span className="hidden sm:inline">Download</span>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        </a>
                                    ) : (
                                        <div className="flex flex-col items-end">
                                            <span className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 text-[10px] font-bold shadow-sm opacity-70 cursor-not-allowed">
                                                Processing...
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Secure Footer - Styled like Paywall Trust Signal */}
                <div className="py-4 bg-slate-50 border-t border-slate-100 text-center flex items-center justify-center gap-2 opacity-60">
                    <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Secure Storage</span>
                </div>
            </div>
        </div>
    );
};
