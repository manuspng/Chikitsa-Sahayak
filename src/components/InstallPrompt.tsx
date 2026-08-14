import React, { useState, useEffect } from "react";
import { Smartphone, Share2, MoreVertical, Plus, X, Laptop, CheckCircle2 } from "lucide-react";

export default function InstallPrompt() {
  const [activeTab, setActiveTab] = useState<"ios" | "android" | "desktop">("ios");
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    // 1. Detect platform for default tab
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isIOS) {
      setActiveTab("ios");
    } else if (isAndroid) {
      setActiveTab("android");
    } else {
      setActiveTab("desktop");
    }

    // 2. Check if running in installed/standalone mode
    const isInStandaloneMode = 
      Boolean((window.navigator as any).standalone) || 
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      document.referrer.includes("android-app://");

    // 3. Auto-show popup every time the link is opened in standard browser mode
    let timer: any;
    if (!isInStandaloneMode) {
      timer = setTimeout(() => {
        setIsVisible(true);
      }, 750);
    }

    // 4. Allow manual trigger from anywhere via custom event
    const handleOpenPrompt = () => {
      setIsVisible(true);
    };
    window.addEventListener("open-install-prompt", handleOpenPrompt);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("open-install-prompt", handleOpenPrompt);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-3xl shadow-2xl overflow-hidden animate-zoom-in text-slate-950 dark:text-white">
        {/* Top Decorative Line */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 z-10" />

        {/* Header Section */}
        <div className="p-6 pb-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white border-2 border-emerald-500/40 p-1 shadow-md flex items-center justify-center shrink-0">
              <img 
                src="/apple-touch-icon.png" 
                alt="Chiktsa Sahayak Logo" 
                className="w-full h-full object-contain select-none pointer-events-none rounded-xl" 
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-slate-950 dark:text-white flex items-center gap-1.5 font-serif-brand">
                Chiktsa Sahayak™
              </h3>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider">
                How to Add Web App to Home Screen
              </p>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
            title="Close Guide"
          >
            <X size={18} />
          </button>
        </div>

        {/* Informational Pitch */}
        <div className="px-6 pt-3 pb-1">
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-semibold">
            Install <strong>Chiktsa Sahayak</strong> on your device for instant 1-tap home screen access, full-screen view, and offline diagnostic tools.
          </p>
        </div>

        {/* Platform Selector Tabs */}
        <div className="px-6 pt-3">
          <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-black">
            <button
              type="button"
              onClick={() => setActiveTab("ios")}
              className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "ios"
                  ? "bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow-sm border border-slate-300 dark:border-slate-600"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-950"
              }`}
            >
              <Smartphone size={14} />
              <span>iPhone (iOS)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("android")}
              className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "android"
                  ? "bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow-sm border border-slate-300 dark:border-slate-600"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-950"
              }`}
            >
              <Smartphone size={14} />
              <span>Android</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("desktop")}
              className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "desktop"
                  ? "bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow-sm border border-slate-300 dark:border-slate-600"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-950"
              }`}
            >
              <Laptop size={14} />
              <span>PC / Laptop</span>
            </button>
          </div>
        </div>

        {/* Step-by-Step Directions Content */}
        <div className="p-6 pt-4 space-y-3 max-h-[50vh] overflow-y-auto scrollbar-thin">
          {activeTab === "ios" && (
            <div className="space-y-3 bg-emerald-50/60 dark:bg-emerald-950/20 border-2 border-emerald-300 dark:border-emerald-800/60 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  1
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  Open this website in <strong>Apple Safari</strong> on your iPhone or iPad.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  2
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  Tap the <strong className="text-slate-950 dark:text-white inline-flex items-center gap-1 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600">Share <Share2 size={12} className="text-emerald-700 dark:text-emerald-400 inline" /></strong> icon at the bottom of the screen.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  3
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  Scroll down the share menu and select <strong className="text-slate-950 dark:text-white inline-flex items-center gap-1 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600">Add to Home Screen <Plus size={12} className="text-emerald-700 dark:text-emerald-400 inline" /></strong>.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  4
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  Tap <strong className="text-slate-950 dark:text-white font-black">"Add"</strong> in the top-right corner. The official Chiktsa Sahayak app icon will appear directly on your home screen!
                </div>
              </div>
            </div>
          )}

          {activeTab === "android" && (
            <div className="space-y-3 bg-indigo-50/60 dark:bg-indigo-950/20 border-2 border-indigo-300 dark:border-indigo-800/60 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  1
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  Open this page in <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or <strong>Samsung Internet</strong> on your Android phone.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  2
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  Tap the <strong className="text-slate-950 dark:text-white inline-flex items-center gap-1 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600">3-Dots Menu <MoreVertical size={12} className="text-indigo-700 dark:text-indigo-400 inline" /></strong> in the top-right corner of the browser.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  3
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  Tap <strong className="text-slate-950 dark:text-white inline-flex items-center gap-1 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600">Install app</strong> or <strong className="text-slate-950 dark:text-white inline-flex items-center gap-1 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600">Add to Home screen</strong>.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  4
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  Confirm by tapping <strong className="text-slate-950 dark:text-white font-black">"Install"</strong>. The app icon will now appear on your phone home screen!
                </div>
              </div>
            </div>
          )}

          {activeTab === "desktop" && (
            <div className="space-y-3 bg-slate-100 dark:bg-slate-800/60 border-2 border-slate-300 dark:border-slate-700 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-800 dark:bg-slate-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  1
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  In <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or <strong>Brave</strong> on your computer:
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-800 dark:bg-slate-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  2
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  Click the <strong>Install icon ⊕</strong> located on the right side of the top address bar.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-800 dark:bg-slate-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  3
                </div>
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal">
                  Click <strong className="text-slate-950 dark:text-white font-black">"Install"</strong> to launch Chiktsa Sahayak as a standalone desktop application window.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black shadow-sm transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 size={15} />
            <span>Got It, Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
