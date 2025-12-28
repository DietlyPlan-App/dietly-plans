
import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RefreshCcw } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl flex flex-col items-center p-8 text-center border border-slate-100">
                        <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
                            <AlertOctagon className="w-8 h-8 text-rose-600" />
                        </div>

                        <h1 className="text-2xl font-black text-slate-800 mb-2">Something went wrong</h1>
                        <p className="text-slate-500 mb-6 leading-relaxed">
                            Our AI Chef encountered an unexpected ingredient. We have logged this error and are scrubbing the kitchen.
                        </p>

                        <div className="w-full bg-slate-100 p-4 rounded-lg mb-6 text-left">
                            <p className="font-mono text-xs text-slate-500 break-all">
                                {this.state.error?.message || "Unknown Application Error"}
                            </p>
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="bg-primary hover:bg-primaryDark text-white px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95"
                        >
                            <RefreshCcw className="w-4 h-4" />
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
