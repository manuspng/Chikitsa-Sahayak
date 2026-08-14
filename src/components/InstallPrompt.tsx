import React, { useState, useEffect } from "react";
import { Smartphone, Share2, MoreVertical, Plus, X, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function InstallPrompt() {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop" | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(true);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // 1. Detect platform
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isIOS) {
      setPlatform("ios");
    } else if (isAndroid) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }

    // 2. Check if already installed / standalone
    const isInStandaloneMode = 
      (window.navigator as any).standalone || 
      window.matchMedia("(display-mode: standalone)").matches;

    setIsStandalone(isInStandaloneMode);

    // 3. Listen for the native beforeinstallprompt event (for Android, Chrome, Edge, Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser's automatic mini-infobar UI from showing
      e.preventDefault();
      // Store the event for triggering it later on user interaction
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Check if user has dismissed it within this session
      try {
        const dismissed = localStorage.getItem("chikitsa_pwa_dismissed");
        if (dismissed === "true") {
          return;
        }
      } catch {}

      // If not in standalone mode, display the prompt
      if (!isInStandaloneMode) {
        setIsVisible(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Listen for successful app installation to auto-clean state
    const handleAppInstalled = () => {
      console.log("Chikitsa Sahayak was successfully installed!");
      setDeferredPrompt(null);
      setIsVisible(false);
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    // 4. Fallback/manual trigger for iOS devices (since iOS doesn't support beforeinstallprompt)
    if (isIOS && !isInStandaloneMode) {
      try {
        const dismissed = localStorage.getItem("chikitsa_pwa_dismissed");
        if (dismissed !== "true") {
          const timer = setTimeout(() => {
            setIsVisible(true);
          }, 1500);
          return () => {
            clearTimeout(timer);
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
            window.removeEventListener("appinstalled", handleAppInstalled);
          };
        }
      } catch {}
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    try {
      localStorage.setItem("chikitsa_pwa_dismissed", "true");
    } catch {}
  };

  const handleNativeInstall = async () => {
    if (!deferredPrompt) return;
    
    // Trigger browser's native install dialog
    await deferredPrompt.prompt();
    
    // Wait for the user option selection
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === "accepted") {
        console.log("✓ User added application via native installer");
      } else {
        console.log("✗ User dismissed native installer");
      }
      setDeferredPrompt(null);
      setIsVisible(false);
    });
  };

  // If already installed, return null
  if (isStandalone) return null;

  // We only show Android/Desktop card if we have a valid deferredPrompt,
  // or if it's iOS which requires manual guidance.
  const canShowNativeInstall = deferredPrompt !== null;
  const isIOS = platform === "ios";

  if (!isIOS && !canShowNativeInstall && isVisible) {
    // If visible is true but no native prompt is loaded yet on Android/Desktop,
    // wait for beforeinstallprompt event before showing to prevent non-functional prompts.
    return null;
  }

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900 text-slate-100 rounded-3xl p-5 border border-emerald-500/30 shadow-2xl shadow-emerald-950/40 relative overflow-hidden">
        {/* Decorative background circle */}
        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-emerald-500/10 blur-xl pointer-events-none" />
        
        {/* Header content with App Brand logo */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-950 border border-emerald-500/30 overflow-hidden flex items-center justify-center shadow-md">
              <img 
                src="/apple-touch-icon.png" 
                alt="Chikitsa Sahayak Logo" 
                className="w-full h-full object-contain p-0.5 select-none pointer-events-none" 
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h4 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                Chikitsa Sahayak
              </h4>
              <p className="text-[10px] text-emerald-400 font-bold tracking-wide uppercase">
                {isIOS ? "Add Shortcut to Home Screen" : "Official App Hub"}
              </p>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Dismiss Install Prompt"
          >
            <X size={16} />
          </button>
        </div>

        {/* Informational pitch */}
        <p className="text-xs text-slate-300 mb-4 leading-relaxed font-normal">
          Access Chikitsa Sahayak directly from your home screen with a full-screen experience, zero browser frame, offline capabilities, and instant loading.
        </p>

        {/* Conditional rendering for iOS versus Native install path */}
        {isIOS ? (
          <div className="space-y-3 bg-slate-950/60 rounded-2xl p-4 border border-slate-800/40">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <p className="text-xs text-slate-300 leading-normal">
                Tap the <strong className="text-white inline-flex items-center gap-1">Share <Share2 size={13} className="text-emerald-400 inline" /></strong> button in Safari's bottom toolbar.
              </p>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <p className="text-xs text-slate-300 leading-normal">
                Scroll down and select <strong className="text-white inline-flex items-center gap-1">Add to Home Screen <Plus size={13} className="text-emerald-400 inline bg-slate-800 rounded p-0.5" /></strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleNativeInstall}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Download size={16} className="stroke-[2.5]" />
              <span>Install Official App</span>
            </button>
          </div>
        )}

        {/* Footer info/controls */}
        <div className="mt-4 pt-1 flex items-center justify-between text-[10px] text-slate-400 font-medium border-t border-slate-800/40">
          <span>
            {isIOS ? "Apple iOS Setup (Safari)" : `${platform === "android" ? "Android Mobile" : "Desktop Web"} Installer`}
          </span>
          <button 
            onClick={handleDismiss}
            className="text-emerald-400 hover:text-emerald-300 font-bold tracking-wider uppercase transition-colors cursor-pointer"
          >
            I'll install later
          </button>
        </div>
      </div>
    </div>
  );
}
