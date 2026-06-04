import React, { useState, useEffect } from "react";
import { Activity, LayoutDashboard, HeartPulse, Scale, History, ShieldPlus, ChevronDown, Settings, Key, HelpCircle, Lock, Check, ExternalLink, X, AlertTriangle, Cpu } from "lucide-react";
import { AnalysisRecord } from "./types";
import ClinicalMonitor from "./components/ClinicalMonitor";
import LftAnalyzer from "./components/LftAnalyzer";
import CbcAnalyzer from "./components/CbcAnalyzer";
import BmiTracker from "./components/BmiTracker";
import AnalysisHistory from "./components/AnalysisHistory";
import MetabolicAnalyzer from "./components/MetabolicAnalyzer";
import InstallPrompt from "./components/InstallPrompt";
import logoImg from "./assets/images/regenerated_image_1779900749774.jpg";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [reportsDropdownOpen, setReportsDropdownOpen] = useState<boolean>(false);
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [showKey, setShowKey] = useState<boolean>(false);
  const [confirmRedirectUrl, setConfirmRedirectUrl] = useState<string | null>(null);

  // Dynamic AI Provider States
  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    try {
      return localStorage.getItem("selected_ai_provider") || "gemini";
    } catch {
      return "gemini";
    }
  });

  const [keys, setKeys] = useState(() => ({
    gemini: localStorage.getItem("user_gemini_api_key") || "",
    groq: localStorage.getItem("user_groq_api_key") || "",
    openrouter: localStorage.getItem("user_openrouter_api_key") || "",
    openai: localStorage.getItem("user_openai_api_key") || "",
    claude: localStorage.getItem("user_claude_api_key") || "",
    deepseek: localStorage.getItem("user_deepseek_api_key") || "",
  }));

  const handleKeyChange = (provider: string, value: string) => {
    setKeys(prev => ({ ...prev, [provider]: value }));
  };

  useEffect(() => {
    if (!reportsDropdownOpen) return;
    const handleOutsideClick = () => {
      setReportsDropdownOpen(false);
    };
    const timeout = setTimeout(() => {
      window.addEventListener("click", handleOutsideClick);
    }, 50);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("click", handleOutsideClick);
    };
  }, [reportsDropdownOpen]);
  const [colorScheme, setColorScheme] = useState<"standard" | "teal" | "obsidian">(() => {
    try {
      return (localStorage.getItem("hepatic_color_scheme") as "standard" | "teal" | "obsidian") || "standard";
    } catch {
      return "standard";
    }
  });

  const handleSchemeChange = (scheme: "standard" | "teal" | "obsidian") => {
    setColorScheme(scheme);
    try {
      localStorage.setItem("hepatic_color_scheme", scheme);
    } catch {}
  };

  const schemeClasses = {
    standard: {
      bg: "bg-[#f1f5f9] text-[#1e293b] dark:bg-slate-900 dark:text-slate-200",
      accentText: "text-[#2563eb]",
      logoText: "text-slate-900 dark:text-white",
      cardStyle: "bg-white dark:bg-slate-900/80 border-slate-250/60 dark:border-slate-800/80",
      badgeActive: "bg-[#2563eb]/10 text-[#2563eb]",
      tabActive: "bg-[#2563eb] text-white shadow-md shadow-[#2563eb]/10",
    },
    teal: {
      bg: "bg-[#f0f7f6] text-[#0f2d2b] dark:bg-[#091514] dark:text-[#ecfbf9]",
      accentText: "text-[#0d9488]",
      logoText: "text-[#0f2d2b] dark:text-[#ecfbf9]",
      cardStyle: "bg-white dark:bg-[#0c1f1d] border-teal-200/50 dark:border-teal-900/40",
      badgeActive: "bg-[#0d9488]/10 text-[#0d9488]",
      tabActive: "bg-[#0d9488] text-white shadow-md shadow-[#0d9488]/10",
    },
    obsidian: {
      bg: "bg-[#05070f] text-[#ced5e3]",
      accentText: "text-[#6366f1]",
      logoText: "text-[#f1f5f9] dark:text-[#f1f5f9]",
      cardStyle: "bg-[#0c1020] dark:bg-[#0c1020] border-slate-800/80",
      badgeActive: "bg-[#6366f1]/20 text-[#c7d2fe]",
      tabActive: "bg-[#6366f1] text-[#ffffff] shadow-md shadow-[#6366f1]/30",
    }
  }[colorScheme];

  // Local storage synchronization
  useEffect(() => {
    if (colorScheme === "obsidian") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [colorScheme]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("hepatic_analysis_records");
      if (stored) {
        setRecords(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Local storage access blocked or unavailable:", e);
    }
  }, []);

  const saveRecords = (newRecords: AnalysisRecord[]) => {
    setRecords(newRecords);
    try {
      localStorage.setItem("hepatic_analysis_records", JSON.stringify(newRecords));
    } catch (e) {
      console.warn("Could not save records to local storage:", e);
    }
  };

  const handleAddRecord = (record: Omit<AnalysisRecord, "id" | "date"> & { id?: string }) => {
    if (record.id) {
      const exists = records.some(r => r.id === record.id);
      if (exists) {
        const updated = records.map(r => {
          if (r.id === record.id) {
            return {
              ...r,
              ...record,
              date: r.date // Keep original creation date
            } as AnalysisRecord;
          }
          return r;
        });
        saveRecords(updated);
        return;
      }
    }
    const completeRecord: AnalysisRecord = {
      ...record,
      id: record.id || "REC-" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      date: new Date().toISOString(),
    } as AnalysisRecord;
    const updated = [...records, completeRecord];
    saveRecords(updated);
  };

  const handleDeleteRecord = (id: string) => {
    const updated = records.filter(r => r.id !== id);
    saveRecords(updated);
  };

  const handleClearAll = () => {
    if (confirm("Reset clinical logs? This will delete all saved screening evaluations.")) {
      saveRecords([]);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${schemeClasses.bg}`}>
      {/* Bento Grid Header Layout with Minimalist Green Gradient */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-emerald-950 via-[#06241e] to-slate-950 text-white border-b border-emerald-900/30 shadow-lg shadow-emerald-950/20 overflow-hidden">
        {/* Minimalist Graphic Design Element (subtle glow / structure) */}
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
        <div className="absolute -right-16 -top-16 w-32 h-32 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute left-1/3 top-0 w-64 h-full bg-[linear-gradient(to_right,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

        <div className="w-full max-w-none px-4 sm:px-8 md:px-12 py-3 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-[68px] h-[68px] rounded-2xl overflow-hidden flex items-center justify-center shadow-lg border border-slate-800/10 bg-white">
              <img 
                src={logoImg} 
                alt="Chikitsa Sahayak Logo" 
                className="w-full h-full object-contain p-0.5 select-none pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-black tracking-wider uppercase text-white leading-none">
                CHIKITSA SAHAYAK
              </h1>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                <p className="text-[9px] text-emerald-400 font-normal uppercase tracking-widest text-left leading-none">Clinical Decision-Support</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0 -mt-1 sm:-mt-1.5">
            <button
              onClick={() => setSettingsOpen(true)}
              className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/50 hover:bg-emerald-900/40 text-slate-200 hover:text-white transition-all text-[11px] sm:text-xs font-semibold cursor-pointer shadow-inner shrink-0"
              title="Configure AI Provider systems and API keys"
            >
              <Key size={12} className="text-emerald-400 group-hover:scale-110 transition-transform duration-300" />
              <span>AI Provider</span>
            </button>
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-emerald-400 bg-slate-900/50 px-2 py-0.5 rounded border border-emerald-500/20 uppercase leading-none">
              By-MPS
            </span>
          </div>
        </div>
      </header>

      {/* Primary Dashboard Container */}
      <main className="w-full max-w-none px-4 sm:px-8 md:px-12 py-8 space-y-6">
        {/* Clinology Navigation Desk */}
        <div className={`flex items-center p-1.5 rounded-[20px] shadow-sm border overflow-visible gap-1.5 relative ${schemeClasses.cardStyle}`}>
          <button
            onClick={() => {
              setActiveTab("overview");
              setReportsDropdownOpen(false);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-[14px] text-xs font-bold transition-all whitespace-nowrap cursor-pointer hover:scale-[1.01] active:scale-[0.98] ${
              activeTab === "overview"
                ? schemeClasses.badgeActive
                : "bg-slate-100/90 hover:bg-slate-200/85 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border border-slate-200/40 dark:border-slate-700/30 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 shadow-sm"
            }`}
          >
            <LayoutDashboard size={14} />
            <span>Biological Overview</span>
          </button>

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReportsDropdownOpen(!reportsDropdownOpen);
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-[14px] text-xs font-bold transition-all whitespace-nowrap cursor-pointer hover:scale-[1.01] active:scale-[0.98] ${
                ["cbc", "lft", "bmi", "metabolic"].includes(activeTab)
                  ? schemeClasses.tabActive
                  : "bg-slate-100/90 hover:bg-slate-200/85 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border border-slate-200/40 dark:border-slate-700/30 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 shadow-sm"
              }`}
            >
              <Activity size={14} />
              <span>Analyze Reports</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${reportsDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {reportsDropdownOpen && (
              <div className="absolute left-0 mt-2 w-60 rounded-xl border border-slate-200 dark:border-slate-800/85 bg-white dark:bg-slate-900 shadow-xl z-50 py-1.5 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  onClick={() => {
                    setActiveTab("cbc");
                    setReportsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left font-bold transition-colors cursor-pointer rounded-lg ${
                    activeTab === "cbc"
                      ? schemeClasses.badgeActive
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <Activity size={14} />
                  <span>analyze CBC report</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab("lft");
                    setReportsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left font-bold transition-colors cursor-pointer rounded-lg ${
                    activeTab === "lft"
                      ? schemeClasses.badgeActive
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <HeartPulse size={14} />
                  <span>analyze LFT & Scores</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab("bmi");
                    setReportsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left font-bold transition-colors cursor-pointer rounded-lg ${
                    activeTab === "bmi"
                      ? schemeClasses.badgeActive
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <Scale size={14} />
                  <span>Calculate BMI</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab("metabolic");
                    setReportsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left font-bold transition-colors cursor-pointer rounded-lg ${
                    activeTab === "metabolic"
                      ? schemeClasses.badgeActive
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <Cpu size={14} />
                  <span>Metabolic Syndrome and ACR</span>
                </button>
                <div className="h-px bg-slate-200/60 dark:bg-slate-800/60 my-0.5" />
                <button
                  onClick={() => {
                    setActiveTab("history");
                    setReportsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left font-bold transition-colors cursor-pointer rounded-lg ${
                    activeTab === "history"
                      ? schemeClasses.badgeActive
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <History size={14} />
                  <span>Activity Logs ({records.length})</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setActiveTab("history");
              setReportsDropdownOpen(false);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-[14px] text-xs font-bold transition-all whitespace-nowrap ml-auto cursor-pointer hover:scale-[1.01] active:scale-[0.98] ${
              activeTab === "history"
                ? schemeClasses.badgeActive
                : "bg-slate-100/90 hover:bg-slate-200/85 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border border-slate-200/40 dark:border-slate-700/30 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 shadow-sm"
            }`}
          >
            <History size={14} />
            <span>Activity Logs ({records.length})</span>
          </button>
        </div>

        {/* Tab Viewport */}
        <div className="transition-all duration-300">
          {activeTab === "overview" && <ClinicalMonitor records={records} onSetTab={setActiveTab} />}
          {activeTab === "lft" && <LftAnalyzer onAddRecord={handleAddRecord} />}
          {activeTab === "cbc" && <CbcAnalyzer onAddRecord={handleAddRecord} />}
          {activeTab === "bmi" && <BmiTracker onAddRecord={handleAddRecord} />}
          {activeTab === "metabolic" && <MetabolicAnalyzer onAddRecord={handleAddRecord} />}
          {activeTab === "history" && (
            <AnalysisHistory 
              records={records} 
              onDeleteRecord={handleDeleteRecord} 
              onClearAll={handleClearAll} 
            />
          )}
        </div>
      </main>

      {/* Footer credits */}
      <footer className="border-t border-slate-100 dark:border-slate-800 text-center py-6 text-[10px] text-slate-400 font-medium">
        HEPATIC Diagnostics Platform &copy; {new Date().getFullYear()} • Secure Decision-Support Suite
      </footer>

      {/* Guide prompt for shortcut installation on mobile */}
      <InstallPrompt />

      {/* API Key Settings Modal Panel */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in animate-duration-200">
          <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-[#0c1020] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header decor lines */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 via-[#0d9488] to-emerald-600 z-10" />
            
            {/* Scrollable Container Wrapper */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
              {/* Top Close Button */}
              <button
                onClick={() => setSettingsOpen(false)}
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              {/* Icon & Title */}
              <div className="flex items-start gap-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Key size={22} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Clinical AI Provider Settings
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Select your dynamic diagnostic AI provider and manage your keys
                  </p>
                </div>
              </div>

              {/* Security Shield Banner */}
              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100/40 dark:border-emerald-950/30 text-xs text-emerald-850 dark:text-emerald-300 space-y-2 leading-relaxed">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <ShieldPlus size={14} className="text-emerald-600 dark:text-emerald-400" />
                  <span>End-to-End Client Security Guarantee</span>
                </div>
                <p className="text-justify">
                  All provider API keys are saved **exclusively** inside your browser's private sandboxed cache (`localStorage`). No keys are ever written to cloud servers or exposed to tracking systems.
                </p>
              </div>

              {/* Provider Selection Dropdown */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Select Active AI Engine
                </label>
                <div className="relative">
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-205 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-855 dark:text-slate-200 outline-none appearance-none cursor-pointer focus:border-emerald-500"
                  >
                    <option value="gemini">Gemini Flash (Built-in Support)</option>
                    <option value="groq">Groq Llama (High-Speed & Adaptive)</option>
                    <option value="openrouter">OpenRouter (Unified Multi-Model)</option>
                    <option value="openai">OpenAI GPT-4o (High-Precision Diagnostics)</option>
                    <option value="claude">Claude Haiku (Exquisite Medical Detail)</option>
                    <option value="deepseek">DeepSeek Expert (Robust Clinical Reasoning)</option>
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <ChevronDown size={14} />
                  </div>
                </div>
              </div>

              {/* Provider Details, Key Links & Warning Trigger */}
              {(() => {
                const config: Record<string, { desc: string; url: string; label: string; placeholder: string }> = {
                  gemini: {
                    desc: "Official Gemini 2.5/3.5 Flash engine for medical report analysis.",
                    url: "https://aistudio.google.com/apikey",
                    label: "Gemini AI Studio Portal",
                    placeholder: "Paste Gemini API Key here (AIzaSy...)"
                  },
                  groq: {
                    desc: "Groq high-speed cloud utilizing ultra-fast llama-3.3-70b-versatile engine.",
                    url: "https://console.groq.com/keys",
                    label: "Groq Console Portal",
                    placeholder: "Paste Groq API Key here (gsk_...)"
                  },
                  openrouter: {
                    desc: "Multi-model router proxying request endpoints to global providers.",
                    url: "https://openrouter.ai/keys",
                    label: "OpenRouter Console",
                    placeholder: "Paste OpenRouter API Key here (sk-or-...)"
                  },
                  openai: {
                    desc: "OpenAI GPT-4o-mini enterprise diagnostic screening engine.",
                    url: "https://platform.openai.com/api-keys",
                    label: "OpenAI Platform Dashboard",
                    placeholder: "Paste OpenAI API Key here (sk-proj-...)"
                  },
                  claude: {
                    desc: "Anthropic Claude 3.5 Haiku engine optimized for dense diagnostic screening data.",
                    url: "https://console.anthropic.com/settings/keys",
                    label: "Anthropic Console",
                    placeholder: "Paste Claude API Key here (sk-ant-...)"
                  },
                  deepseek: {
                    desc: "DeepSeek Chat clinical reasoning deep analytical diagnostics LMM.",
                    url: "https://platform.deepseek.com/api_keys",
                    label: "DeepSeek Platform Portal",
                    placeholder: "Paste DeepSeek API Key here (sk-...)"
                  }
                };

                const activeConfig = config[selectedProvider as keyof typeof config] || config.gemini;
                const currentKeyVal = keys[selectedProvider as keyof typeof keys] || "";

                return (
                  <div className="space-y-4 pt-1">
                    {/* Tiny info banner and key portal link */}
                    <div className="bg-slate-50 dark:bg-slate-900/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-left">
                          {activeConfig.desc}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 text-left">
                          Configure your own credential to lift shared visitor limitations.
                        </p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setConfirmRedirectUrl(activeConfig.url)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[9px] uppercase tracking-wider transition-all shadow-sm shrink-0 cursor-pointer text-center"
                      >
                        <span>Get Key</span>
                        <ExternalLink size={10} />
                      </button>
                    </div>

                    {/* Key input with status indicator */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Credential Pattern
                        </label>
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded leading-none ${
                          currentKeyVal ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20" : "bg-amber-500/15 text-amber-500 border border-amber-500/20"
                        }`}>
                          {currentKeyVal ? "Connected ✓" : "API Key Missing"}
                        </span>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Lock size={14} />
                        </div>
                        <input
                          type={showKey ? "text" : "password"}
                          value={currentKeyVal}
                          onChange={(e) => handleKeyChange(selectedProvider, e.target.value)}
                          placeholder={activeConfig.placeholder}
                          className="w-full pl-10 pr-20 py-2.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/20 rounded-xl text-xs font-mono text-slate-855 dark:text-slate-100 placeholder-slate-400 transition-all outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-250 cursor-pointer"
                        >
                          {showKey ? "HIDE" : "SHOW"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Warning disclaimer note */}
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal text-justify">
                <strong>Disclaimer Statement:</strong> This tool acts as an assistive decision-support interface. All computed metrics and clinician recommendations are generated through AI and must be re-checked with local clinical practitioners.
              </p>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => {
                    handleKeyChange(selectedProvider, "");
                    const storageKeys: Record<string, string> = {
                      gemini: "user_gemini_api_key",
                      groq: "user_groq_api_key",
                      openrouter: "user_openrouter_api_key",
                      openai: "user_openai_api_key",
                      claude: "user_claude_api_key",
                      deepseek: "user_deepseek_api_key",
                    };
                    const keyName = storageKeys[selectedProvider];
                    if (keyName) {
                      localStorage.removeItem(keyName);
                    }
                    alert(`Personal settings for ${selectedProvider.toUpperCase()} cleared successfully.`);
                  }}
                  className="px-4 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-colors cursor-pointer mr-auto"
                >
                  Clear Key
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem("selected_ai_provider", selectedProvider);
                    
                    const storageKeys: Record<string, string> = {
                      gemini: "user_gemini_api_key",
                      groq: "user_groq_api_key",
                      openrouter: "user_openrouter_api_key",
                      openai: "user_openai_api_key",
                      claude: "user_claude_api_key",
                      deepseek: "user_deepseek_api_key",
                    };

                    Object.entries(keys).forEach(([pName, pKey]) => {
                      const storageKey = storageKeys[pName];
                      if (storageKey) {
                        const keyVal = pKey as string;
                        if (keyVal.trim()) {
                          localStorage.setItem(storageKey, keyVal.trim());
                        } else {
                          localStorage.removeItem(storageKey);
                        }
                      }
                    });

                    setSettingsOpen(false);
                    alert("AI engine credentials and provider configurations saved successfully!");
                  }}
                  className="px-4.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors shadow-md hover:shadow-emerald-600/20 cursor-pointer"
                >
                  Apply Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Helper Pre-Redirect Alert Overlay */}
      {confirmRedirectUrl && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-sm bg-white dark:bg-[#0f142a] border border-slate-205 dark:border-slate-850 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/10 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                <AlertTriangle size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  External Provider Navigation
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-justify">
                  This action may require sign in or account creation to generate API keys on the official provider's portal. Do you want to continue?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRedirectUrl(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  window.open(confirmRedirectUrl, "_blank");
                  setConfirmRedirectUrl(null);
                }}
                className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors shadow-md hover:shadow-amber-500/10 cursor-pointer"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
