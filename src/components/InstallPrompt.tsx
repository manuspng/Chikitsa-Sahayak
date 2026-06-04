import React, { useState, useEffect } from "react";
import { Smartphone, Share2, MoreVertical, Plus, X, Download, ArrowDown } from "lucide-react";

export default function InstallPrompt() {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(true);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    // Check if running on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    // Check if running on Android
    const isAndroid = /Android/i.test(navigator.userAgent);

    // Check if running in standalone mode (installed as PWA/shortcut)
    const isInStandaloneMode = 
      (window.navigator as any).standalone || 
      window.matchMedia('(display-mode: standalone)').matches;

    setIsStandalone(isInStandaloneMode);

    if (isIOS) {
      setPlatform("ios");
    } else if (isAndroid) {
      setPlatform("android");
    }

    // Check if user has already dismissed it
    try {
      const dismissed = localStorage.getItem("chikitsa_pwa_dismissed");
      if (dismissed === "true") {
        setIsVisible(false);
        return;
      }
    } catch {}

    // Only show if mobile and NOT in standalone mode
    if ((isIOS || isAndroid) && !isInStandaloneMode) {
      // Show prompt shortly after load
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    try {
      localStorage.setItem("chikitsa_pwa_dismissed", "true");
    } catch {}
  };

  if (!isVisible || !platform) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900 text-slate-100 rounded-3xl p-5 border border-emerald-500/30 shadow-2xl shadow-emerald-950/40 relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-emerald-500/10 blur-xl pointer-events-none" />
        
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <img 
              src="/logo.svg" 
              alt="Chikitsa Sahayak Logo" 
              className="w-11 h-11 rounded-xl bg-slate-950 border border-emerald-500/30 shadow-md transform hover:scale-105 transition-transform" 
              referrerPolicy="no-referrer"
            />
            <div>
              <h4 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                Install Chikitsa Sahayak
              </h4>
              <p className="text-[10px] text-emerald-400 font-bold tracking-wide uppercase">Add shortcut to home screen</p>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        {/* Dynamic Instructional Content */}
        <p className="text-xs text-slate-300 mb-4 leading-relaxed font-normal">
          Access Chikitsa Sahayak instantly with fullscreen experience, faster loading, offline caching and direct access from your home screen.
        </p>

        {platform === "ios" ? (
          <div className="space-y-3 bg-slate-950/60 rounded-2xl p-4 border border-slate-800/40">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <p className="text-xs text-slate-300 leading-normal">
                Tap the <strong className="text-white inline-flex items-center gap-1">Share <Share2 size={13} className="text-emerald-400 inline" /></strong> button in Safari's bottom browser bar.
              </p>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <p className="text-xs text-slate-300 leading-normal">
                Scroll down the share menu and select <strong className="text-white inline-flex items-center gap-1">Add to Home Screen <Plus size={13} className="text-emerald-400 inline bg-slate-800 rounded p-0.5" /></strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 bg-slate-950/60 rounded-2xl p-4 border border-slate-800/40">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <p className="text-xs text-slate-300 leading-normal">
                Tap the <strong className="text-white inline-flex items-center gap-1">Menu <MoreVertical size={13} className="text-emerald-400 inline" /></strong> icon at the top right of your browser.
              </p>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <p className="text-xs text-slate-300 leading-normal">
                Tap <strong className="text-white">Add to Home Screen</strong> or <strong className="text-white">Install App</strong> to save the shortcut.
              </p>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-4 pt-1 flex items-center justify-between text-[10px] text-slate-400 font-medium">
          <span>Identified: {platform === "ios" ? "Apple iOS (Safari)" : "Android Mobile"}</span>
          <button 
            onClick={handleDismiss}
            className="text-emerald-400 hover:text-emerald-300 font-bold tracking-wider uppercase transition-colors"
          >
            I'll install later
          </button>
        </div>
      </div>
    </div>
  );
}
