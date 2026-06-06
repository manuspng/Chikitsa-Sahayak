import React, { useState, useEffect } from "react";
import { Activity, LayoutDashboard, HeartPulse, Scale, History, ShieldPlus, ChevronDown, Settings, Key, HelpCircle, Lock, Check, ExternalLink, X, AlertTriangle, Cpu, Sun, Moon, Leaf, Search, Info, BookOpen } from "lucide-react";
import { AnalysisRecord } from "./types";
import ClinicalMonitor from "./components/ClinicalMonitor";
import LftAnalyzer from "./components/LftAnalyzer";
import CbcAnalyzer from "./components/CbcAnalyzer";
import BmiTracker from "./components/BmiTracker";
import AnalysisHistory from "./components/AnalysisHistory";
import MetabolicAnalyzer from "./components/MetabolicAnalyzer";
import InstallPrompt from "./components/InstallPrompt";
import logoImg from "./assets/images/regenerated_image_1779900749774.jpg";

// Clinical terminology & diagnostic helper references for search
const MEDICAL_DICTIONARY = [
  { id: "fib4", term: "FIB-4 Index (Fibrosis-4)", category: "Clinical Index", definition: "A non-invasive index used to estimate liver scarring (fibrosis) in patients with NAFLD, HCV, or HBV. Calculated using Age, AST, ALT, and Platelet count, with a high negative predictive value to rule out advanced fibrosis." },
  { id: "apri", term: "APRI (AST-to-Platelet Ratio Index)", category: "Clinical Index", definition: "A simple, cost-effective score to evaluate advanced fibrosis and cirrhosis in chronic hepatitis. Calculated as [AST / AST Upper Limit of Normal] / [Platelet Count] * 100." },
  { id: "meld", term: "MELD Score (Model for End-Stage Liver Disease)", category: "Prognostic Index", definition: "A scoring system from 6 to 40 used to assess the severity of chronic liver disease and prioritize organ allocation for transplantation. Calculated using Serum Creatinine, Bilirubin, INR, and Sodium." },
  { id: "child_pugh", term: "Child-Pugh Classification", category: "Prognostic Index", definition: "A system to assess the prognosis of chronic liver disease, primarily cirrhosis. Scores are grouped into Classes A, B, and C based on 5 clinical and biochemical measures: Bilirubin, Albumin, INR, Ascites, and Hepatic Encephalopathy." },
  { id: "bard", term: "BARD Score", category: "NAFLD Staging", definition: "A non-invasive clinical prediction score for advanced fibrosis in Non-Alcoholic Fatty Liver Disease (NAFLD). Assigns weighted points to BMI (>= 28 is +1), AST/ALT Ratio (>=0.8 is +2), and Type 2 Diabetes (+1)." },
  { id: "ast", term: "AST (Aspartate Aminotransferase)", category: "Biomarker", definition: "An enzyme found mainly in liver and heart cells. Used to screen, diagnose, and monitor liver damage in collaboration with ALT and other biomarkers." },
  { id: "alt", term: "ALT (Alanine Aminotransferase)", category: "Biomarker", definition: "An enzyme found primarily in the liver. It is a highly specific marker of hepatocyte injury; elevated ALT levels indicate active liver cell damage." },
  { id: "plt", term: "Platelets (Thrombocytes)", category: "Hematology", definition: "Formed elements of blood essential for clotting. Thrombocytopenia (low platelet count) is heavily linked to portal hypertension, splenomegaly, and advanced liver cirrhosis." },
  { id: "inr", term: "INR (International Normalized Ratio)", category: "Coagulation", definition: "A standardized measurement of prothrombin time, reflecting the extrinsic coagulation pathway. Since clotting factors are produced by hepatocytes, elevated INR demonstrates impaired liver synthetic function." },
  { id: "alb", term: "Albumin", category: "Liver Synthesis", definition: "The main protein manufactured by the liver to maintain oncotic pressure and transport molecules. Low serum levels (hypoalbuminemia) suggest chronic liver insufficiency or damage." },
  { id: "bil", term: "Bilirubin (Total / Direct)", category: "Excretory Marker", definition: "A yellow breakdown product of hemoglobin cleared and excreted by the liver. Elevated bilirubin leads to jaundice and suggests biliary obstruction or cellular liver dysfunction." },
  { id: "metabolic", term: "Metabolic Syndrome (MetS)", category: "Cardiometabolic Risk", definition: "A cluster of conditions—including abdominal obesity, hypertension, elevated fasting glucose, high triglycerides, and low HDL—that increase risk of coronary disease, stroke, and NAFLD/NASH progression." },
  { id: "acr", term: "ACR (Albumin-to-Creatinine Ratio)", category: "Renal Function", definition: "A urine test measuring microalbuminuria to screen for early diabetic kidney disease or hepatorenal nephropathies, frequently assessed alongside metabolic syndromes." }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [reportsDropdownOpen, setReportsDropdownOpen] = useState<boolean>(false);
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [showKey, setShowKey] = useState<boolean>(false);
  const [confirmRedirectUrl, setConfirmRedirectUrl] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState<boolean>(false);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

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
  const [colorScheme, setColorScheme] = useState<"standard" | "obsidian">(() => {
    try {
      const stored = localStorage.getItem("hepatic_color_scheme");
      if (stored === "standard" || stored === "obsidian") {
        return stored as "standard" | "obsidian";
      }
      return "standard";
    } catch {
      return "standard";
    }
  });

  const handleSchemeChange = (scheme: "standard" | "obsidian") => {
    setColorScheme(scheme);
    try {
      localStorage.setItem("hepatic_color_scheme", scheme);
    } catch {}
  };

  const schemeClasses = {
    standard: {
      bg: "bg-[#f4f7f4] text-[#2c3e30] dark:bg-slate-900 dark:text-slate-200",
      accentText: "text-[#2d5a37] dark:text-[#10b981] font-extrabold",
      logoText: "text-[#1b3d22] dark:text-white",
      cardStyle: "bg-white dark:bg-slate-900/80 border-[#e2e8e3] dark:border-slate-800/80",
      badgeActive: "bg-[#2d5a37]/10 text-[#2d5a37] border border-[#2d5a37]/15 dark:bg-[#10b981]/10 dark:text-[#a7f3d0] dark:border-[#10b981]/20",
      tabActive: "bg-[#2d5a37] text-white shadow-md shadow-[#2d5a37]/10 dark:bg-[#10b981] dark:text-slate-950 dark:shadow-[#10b981]/10",
    },
    obsidian: {
      bg: "bg-[#05070f] text-[#ced5e3]",
      accentText: "text-[#10b981]",
      logoText: "text-[#f1f5f9] dark:text-[#f1f5f9]",
      cardStyle: "bg-[#0c1020] dark:bg-[#0c1020] border-slate-800/80",
      badgeActive: "bg-[#10b981]/20 text-[#a7f3d0] border border-emerald-500/20",
      tabActive: "bg-[#10b981] text-[#090d16] shadow-md shadow-[#10b981]/30",
    }
  }[colorScheme];

  const switcherColors = {
    standard: {
      containerBorder: "border-[#e0ecd9] dark:border-[#10b981]/45 shadow-[0_0_12px_rgba(45,90,55,0.04)] hover:border-[#2d5a37]/50 dark:hover:border-emerald-500/60",
      buttonActiveStyle: "bg-[#2d5a37] text-white border border-[#2d5a37] shadow-md shadow-[#2d5a37]/20 dark:bg-[#10b981] dark:text-slate-950 dark:border-[#10b981] dark:shadow-[#10b981]/20",
      buttonInactiveStyle: "bg-white hover:bg-[#fafdfb] border border-[#d2dfd5] text-slate-700 hover:text-[#2d5a37] dark:bg-slate-900/60 dark:hover:bg-slate-800/80 dark:border-[#10b981]/30 dark:text-slate-400 dark:hover:text-white shadow-sm",
    },
    obsidian: {
      containerBorder: "border-[#10b981]/45 shadow-[0_0_12px_rgba(16,185,129,0.12)] hover:border-[#10b981]/60",
      buttonActiveStyle: "bg-[#10b981] text-slate-950 border border-[#10b981] shadow-md shadow-[#10b981]/30",
      buttonInactiveStyle: "bg-[#0c1020] hover:bg-[#0c1020]/80 border border-[#10b981]/35 text-[#ced5e3] hover:text-[#a7f3d0] shadow-sm",
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
              <h1 className="text-lg font-black tracking-wider text-white leading-none">
                Chikitsa Sahayak
              </h1>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                <p className="text-[9px] text-emerald-400 font-normal uppercase tracking-widest text-left leading-none">Clinical Decision-Support</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Theme Toggle Button */}
            <button
              onClick={() => handleSchemeChange(colorScheme === "standard" ? "obsidian" : "standard")}
              className="p-1.5 bg-slate-950/50 rounded-lg border border-slate-800/40 text-slate-400 hover:text-white hover:border-slate-700/80 transition-all cursor-pointer flex items-center justify-center w-8 h-8 shrink-0"
              title={colorScheme === "standard" ? "Switch to Obsidian Dark Mode" : "Switch to Slate Light Mode"}
            >
              {colorScheme === "standard" ? <Moon size={14} /> : <Sun size={14} />}
            </button>

            {/* Search toggler button */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center w-8 h-8 shrink-0 ${
                searchOpen 
                  ? "bg-emerald-500 border-emerald-400 text-slate-950 shadow-md" 
                  : "border-slate-800/40 bg-slate-950/50 text-slate-400 hover:text-white hover:border-slate-750"
              }`}
              title="Search Index Criteria & Logs"
            >
              <Search size={14} />
            </button>

            {/* About button */}
            <button
              onClick={() => setAboutOpen(true)}
              className="p-1.5 bg-slate-950/50 rounded-lg border border-slate-800/40 text-slate-400 hover:text-white hover:border-slate-750 transition-all cursor-pointer flex items-center justify-center w-8 h-8 shrink-0"
              title="About Chikitsa Sahayak Clinical Suite"
            >
              <Info size={14} />
            </button>

            {/* AI Provider Config */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/50 hover:bg-emerald-900/40 text-slate-200 hover:text-white transition-all text-[11px] font-semibold cursor-pointer shadow-inner h-8"
              title="Configure AI Provider systems and API keys"
            >
              <Key size={12} className="text-emerald-400 group-hover:scale-110 transition-transform duration-300" />
              <span>AI Provider</span>
            </button>
          </div>
        </div>
      </header>

      {/* Primary Dashboard Container */}
      <main className="w-full max-w-none px-4 sm:px-8 md:px-12 py-8 space-y-6">
        {/* Search Drawer Panel */}
        {searchOpen && (
          <div className="bg-slate-900 border border-emerald-500/20 rounded-3xl p-6 text-white space-y-4 shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Search size={14} className="text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Clinical Knowledge & Log Explorer</span>
              </div>
              <button 
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search index criteria, laboratory biomarkers (AST, ALT, Bilirubin, MELD) or client files..."
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition-all"
                autoFocus
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                >
                  CLEAR
                </button>
              )}
            </div>

            {searchQuery.trim() !== "" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[320px] overflow-y-auto scrollbar-thin pt-1">
                {/* Dictionary Results */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-[#0d9488]">Medical Lexicon Matches ({
                    (() => {
                      const query = searchQuery.toLowerCase().trim();
                      return MEDICAL_DICTIONARY.filter(item => 
                        item.term.toLowerCase().includes(query) ||
                        item.category.toLowerCase().includes(query) ||
                        item.definition.toLowerCase().includes(query)
                      ).length;
                    })()
                  })</h4>
                  <div className="space-y-2">
                    {(() => {
                      const query = searchQuery.toLowerCase().trim();
                      const filtered = MEDICAL_DICTIONARY.filter(item => 
                        item.term.toLowerCase().includes(query) ||
                        item.category.toLowerCase().includes(query) ||
                        item.definition.toLowerCase().includes(query)
                      );
                      if (filtered.length === 0) {
                        return <p className="text-xs text-slate-500 italic">No medical dictionary entries found.</p>;
                      }
                      return filtered.map(item => (
                        <div key={item.id} className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-white">{item.term}</span>
                            <span className="text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded leading-none">{item.category}</span>
                          </div>
                          <p className="text-[11px] text-slate-350 leading-relaxed text-justify">{item.definition}</p>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Patient / Diagnosis Record Logs Matches */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500">Evaluation History Matches ({
                    (() => {
                      const query = searchQuery.toLowerCase().trim();
                      return records.filter(rec => 
                        (rec.patientName || "").toLowerCase().includes(query) ||
                        (rec.type || "").toLowerCase().includes(query) ||
                        (rec.riskLevel || "").toLowerCase().includes(query) ||
                        (rec.id || "").toLowerCase().includes(query)
                      ).length;
                    })()
                  })</h4>
                  <div className="space-y-2">
                    {(() => {
                      const query = searchQuery.toLowerCase().trim();
                      const filtered = records.filter(rec => 
                        (rec.patientName || "").toLowerCase().includes(query) ||
                        (rec.type || "").toLowerCase().includes(query) ||
                        (rec.riskLevel || "").toLowerCase().includes(query) ||
                        (rec.id || "").toLowerCase().includes(query)
                      );
                      if (filtered.length === 0) {
                        return (
                          <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-6 text-center space-y-1">
                            <p className="text-xs text-slate-500 italic">No historical reports match the criteria.</p>
                            <p className="text-[10px] text-slate-600 font-medium">Saved logs search is real-time across clinical profiles.</p>
                          </div>
                        );
                      }
                      return filtered.map(rec => (
                        <button
                          key={rec.id}
                          onClick={() => {
                            setActiveTab("history");
                            setSearchOpen(false);
                            setSearchQuery("");
                          }}
                          className="w-full text-left bg-slate-950/50 hover:bg-slate-900/50 border border-slate-800/60 hover:border-emerald-500/25 rounded-xl p-3.5 space-y-2 transition-all cursor-pointer block text-white"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-100">{rec.patientName || "Anonymous Patient"}</span>
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded leading-none ${
                              rec.riskLevel === "critical"
                                ? "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                                : rec.riskLevel === "high"
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                                : rec.riskLevel === "moderate"
                                ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
                                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                            }`}>
                              {rec.riskLevel} risk
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                            <span className="uppercase">File: {rec.type} Report</span>
                            <span>{new Date(rec.date).toLocaleDateString()}</span>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/20 border border-slate-900 rounded-2xl p-6 text-center">
                <p className="text-xs text-slate-500 font-medium pb-1.5">Begin typing above to perform unified clinical dictionary and diagnostic history search.</p>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400 font-medium">FIB-4</span>
                  <span className="text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400 font-medium">MELD</span>
                  <span className="text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400 font-medium">ALT</span>
                  <span className="text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400 font-medium">Platelets</span>
                  <span className="text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400 font-medium">Child-Pugh</span>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Clinology Navigation Desk */}
        <div className={`flex flex-wrap items-center p-1 sm:p-1.5 rounded-[16px] sm:rounded-[20px] border transition-all duration-300 gap-1.5 relative w-fit max-w-full ${schemeClasses.cardStyle} ${switcherColors.containerBorder}`}>
          <button
            onClick={() => {
              setActiveTab("overview");
              setReportsDropdownOpen(false);
            }}
            className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 h-9 sm:h-[42px] rounded-[11px] sm:rounded-[14px] text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap cursor-pointer hover:scale-[1.01] active:scale-[0.98] ${
              activeTab === "overview"
                ? switcherColors.buttonActiveStyle
                : switcherColors.buttonInactiveStyle
            }`}
          >
            <LayoutDashboard size={14} className="scale-90 sm:scale-100" />
            <span>Biological Overview</span>
          </button>

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReportsDropdownOpen(!reportsDropdownOpen);
              }}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 h-9 sm:h-[42px] rounded-[11px] sm:rounded-[14px] text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap cursor-pointer hover:scale-[1.01] active:scale-[0.98] ${
                ["cbc", "lft", "bmi", "metabolic"].includes(activeTab)
                  ? switcherColors.buttonActiveStyle
                  : switcherColors.buttonInactiveStyle
              }`}
            >
              <Activity size={14} className="scale-90 sm:scale-100" />
              <span>Analyze Reports</span>
              <ChevronDown size={14} className={`transition-transform duration-200 scale-90 sm:scale-100 ${reportsDropdownOpen ? 'rotate-180' : ''}`} />
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

      {/* Footer Layout with matching options */}
      <footer className="border-t border-slate-200/50 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/30 backdrop-blur-sm py-8 px-4 sm:px-8 mt-12 transition-all duration-300">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left space-y-1">
            <p className="text-lg font-black text-brand-gold font-serif-brand tracking-tight">
              Chikitsa Sahayak™
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-450 font-semibold uppercase tracking-wider">
              © 2026 Chikitsa Sahayak
            </p>
          </div>

          {/* Footer Interactive Actions matching Header */}
          <div className="flex flex-wrap items-center justify-center gap-3.5">
            <button
              onClick={() => {
                setSearchOpen(!searchOpen);
                if (!searchOpen) {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              className="text-[11px] font-bold text-slate-500 hover:text-emerald-500 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Search size={12} />
              <span>Diagnostic Search</span>
            </button>

            <span className="text-slate-200 dark:text-slate-800">|</span>

            <button
              onClick={() => setAboutOpen(true)}
              className="text-[11px] font-bold text-slate-500 hover:text-emerald-500 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Info size={12} />
              <span>About Clinical Staging</span>
            </button>

            <span className="text-slate-200 dark:text-slate-800">|</span>

            <button
              onClick={() => setSettingsOpen(true)}
              className="text-[11px] font-bold text-slate-500 hover:text-emerald-500 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Key size={12} className="text-emerald-500/80" />
              <span>AI Engine Setup</span>
            </button>

            <span className="text-slate-200 dark:text-slate-800">|</span>

            {/* Theme switcher copy */}
            <button
              onClick={() => handleSchemeChange(colorScheme === "standard" ? "obsidian" : "standard")}
              className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all cursor-pointer flex items-center justify-center w-7 h-7"
              title={colorScheme === "standard" ? "Switch to Obsidian Dark Mode" : "Switch to Slate Light Mode"}
            >
              {colorScheme === "standard" ? <Moon size={12} /> : <Sun size={12} />}
            </button>
          </div>
        </div>
      </footer>

      {/* Guide prompt for shortcut installation on mobile */}
      <InstallPrompt />

      {/* About Modal Dialog */}
      {aboutOpen && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-[#0c1020] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-zoom-in">
            {/* Modal Header Decorated Line */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 via-[#2d5a37] to-emerald-600 z-10" />

            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 scrollbar-thin">
              {/* Close Button */}
              <button
                onClick={() => setAboutOpen(false)}
                className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              {/* Logo & Application Title */}
              <div className="text-center space-y-3 pt-2">
                <div className="w-16 h-16 mx-auto rounded-xl overflow-hidden flex items-center justify-center border border-slate-200/80 dark:border-slate-700/60 bg-white p-1">
                  <img 
                    src={logoImg} 
                    alt="Chikitsa Sahayak Logo" 
                    className="w-full h-full object-contain select-none pointer-events-none"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-brand-gold font-serif-brand tracking-tight">
                    Chikitsa Sahayak™
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-450 font-semibold uppercase tracking-wider">
                    © 2026 Chikitsa Sahayak
                  </p>
                </div>
                {/* Attribution */}
                <div className="text-xs pt-1">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-none">An initiative by</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Dr. M. P. Singh</p>
                </div>
              </div>

              <hr className="border-slate-100 dark:border-slate-800/80" />

              {/* Main Description */}
              <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
                <p>
                  Chikitsa Sahayak is an amateur initiative aimed at providing simple solutions to simple but important healthcare-related problems. It combines practical tools, calculators, reference resources, and utilities that may help make routine educational and clinical tasks more convenient.
                </p>

                {/* Purpose Section */}
                <div className="space-y-2">
                  <h4 className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide text-[11px]">
                    Purpose of the Application
                  </h4>
                  <p>
                    Many clinical scores and assessment tools are simple in principle but can be difficult to remember, calculate, or apply consistently during routine practice. The application aims to make these tools readily accessible and easier to use.
                  </p>
                </div>

                <hr className="border-slate-100 dark:border-slate-800/80" />

                {/* Key Features Section */}
                <div className="space-y-3">
                  <h4 className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide text-[11px]">
                    Key Features
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">FIB-4 Index</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                        A non-invasive metric derived from age, AST, ALT, and platelet count to help screen for liver fibrosis.
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">APRI Score</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                        AST-to-Platelet Ratio Index, providing a basic, clear calculation tool for hepatic scarring assessments.
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">BARD Score</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                        A prediction score weighting BMI, AST/ALT ratio, and type 2 diabetes status to assess fibrotic risks.
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">MELD Score</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                        A score system used to evaluate the severity of chronic liver disease based on objective laboratory indicators.
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">Child-Pugh Classification</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-450 block mt-1">
                        A prognosis grading grid evaluating bilirubin, albumin, INR, ascites, and hepatic encephalopathy severity.
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">Metabolic Syndrome Risk Assessment</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                        A quick reference tracking standard metrics of cardiometabolic and fatty liver disease development risk.
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">BMI Calculator</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                        A standard mass tracker module matching physiological indicators instantly for daily tracking convenience.
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">CBC Interpretation Support</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                        A basic supportive overview assisting the translation of blood parameters and platelet thresholds.
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">Albumin-Creatinine Ratio (ACR) Assessment</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                        A clean reference screen assisting standard microalbuminuria assessments in chronic patients.
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">AI-Assisted Report Analysis</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                        Optional integration allowing user-provided API keys to assist in parsing standard report values for educational purposes.
                      </span>
                    </div>
                  </div>
                </div>

                <hr className="border-slate-100 dark:border-slate-800/80" />

                {/* Important Notice Section */}
                <div className="p-4 bg-amber-500/5 dark:bg-amber-500/10 rounded-xl border border-amber-500/15 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-amber-400 text-xs">
                    <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
                    <span>Important Notice</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
                    The application is intended for educational, informational, and reference purposes only. Calculators, interpretations, and AI-generated outputs should always be reviewed alongside patient history, examination findings, investigations, clinical guidelines, and professional judgment. The application does not replace diagnosis, treatment decisions, or specialist consultation.
                  </p>
                </div>

                {/* Closing */}
                <div className="text-center pt-2 text-slate-500 dark:text-slate-450 text-[11px] font-semibold italic">
                  Thank you for using Chikitsa Sahayak.
                </div>
              </div>

              {/* Close Button Footer */}
              <div className="flex items-center justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAboutOpen(false)}
                  className="px-5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Close & Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
