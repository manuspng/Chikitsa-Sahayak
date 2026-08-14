import React, { useState, useEffect } from "react";
import { Activity, LayoutDashboard, HeartPulse, Scale, History, ShieldPlus, ChevronDown, Settings, Key, HelpCircle, Lock, Check, ExternalLink, X, AlertTriangle, Cpu, Sun, Moon, Leaf, Search, Info, BookOpen, Share2, Copy, FileText, Home, Download, Smartphone } from "lucide-react";
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

  // Dynamic customization & Admin states
  const [logoUrl, setLogoUrl] = useState<string>(() => {
    try {
      return localStorage.getItem("app_logo_url") || logoImg;
    } catch {
      return logoImg;
    }
  });

  const [isPublished, setIsPublished] = useState<boolean>(() => {
    try {
      return localStorage.getItem("app_is_published") === "true";
    } catch {
      return false;
    }
  });

  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(() => {
    try {
      return localStorage.getItem("app_is_super_admin") === "true";
    } catch {
      return false;
    }
  });

  const [adminPasscode, setAdminPasscode] = useState<string>("");
  const [adminError, setAdminError] = useState<string>("");

  const handleTogglePublished = (published: boolean) => {
    setIsPublished(published);
    try {
      localStorage.setItem("app_is_published", published ? "true" : "false");
    } catch {}
  };

  const handleAuthenticateAdmin = () => {
    if (adminPasscode === "admin123") {
      setIsSuperAdmin(true);
      setAdminError("");
      setAdminPasscode("");
      try {
        localStorage.setItem("app_is_super_admin", "true");
      } catch {}
    } else {
      setAdminError("Invalid Super Admin passcode. Access denied.");
    }
  };

  const handleLogoutAdmin = () => {
    setIsSuperAdmin(false);
    try {
      localStorage.setItem("app_is_super_admin", "false");
    } catch {}
  };

  const handleUpdateLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Security constraint check:
    if (isPublished && !isSuperAdmin) {
      alert("Unauthorized Access: Logo/Photo updates are strictly reserved for Super Admins when the application is published.");
      return;
    }

    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setLogoUrl(base64String);
        try {
          localStorage.setItem("app_logo_url", base64String);
        } catch {}
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetLogo = () => {
    if (isPublished && !isSuperAdmin) {
      alert("Unauthorized Access: Logo/Photo updates are strictly reserved for Super Admins when the application is published.");
      return;
    }
    setLogoUrl(logoImg);
    try {
      localStorage.removeItem("app_logo_url");
    } catch {}
  };

  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);
  const [copiedInstructions, setCopiedInstructions] = useState<boolean>(false);

  const handleCopyAboutMarkdown = () => {
    const text = `# Chiktsa Sahayak™ - Clinical Suite\n\n` +
      `© 2026 Chiktsa Sahayak | Initiative by Dr. MP Singh\n\n` +
      `## Purpose of the Application\n` +
      `Chiktsa Sahayak is an amateur initiative aimed at providing simple solutions to simple but important healthcare-related problems. It combines practical tools, calculators, reference resources, and utilities that may help make routine educational and clinical tasks more convenient.\n\n` +
      `## Key Features\n` +
      `- **Explore Numeric Patient Data**: Comprehensive exploration of quantitative biological metrics, CBC parameters, liver panel trends, and renal clearances.\n` +
      `- **Camp Screening & Logistics Details**: Optimized module supporting non-profit rural health camps and mass checkups.\n` +
      `- **FIB-4 Index**: Derived from age, AST, ALT, and platelet count to help screen for liver fibrosis.\n` +
      `- **APRI Score**: AST-to-Platelet Ratio Index, providing a basic, clear calculation tool for hepatic scarring assessments.\n` +
      `- **BARD Score**: A prediction score weighting BMI, AST/ALT ratio, and type 2 diabetes status to assess fibrotic risks.\n` +
      `- **MELD Score**: Used to evaluate chronic liver disease severity based on objective lab indicators.\n` +
      `- **Child-Pugh Classification**: Prognosis grading grid evaluating bilirubin, albumin, INR, ascites, and encephalopathy.\n` +
      `- **Metabolic Syndrome Risk Assessment**: Quick reference tracking cardiometabolic and fatty liver disease risk factors.\n` +
      `- **BMI Calculator**: A standard mass tracker matching physiological indicators.\n` +
      `- **CBC Interpretation Support**: Assist the translation of blood parameters and platelet thresholds.\n` +
      `- **Albumin-Creatinine Ratio (ACR)**: Urine reference screen assisting standard microalbuminuria assessments.\n` +
      `- **AI-Assisted Report Analysis**: Real-time evaluation support with custom API configurations.\n\n` +
      `## Important Notice\n` +
      `The application is intended for educational, informational, and reference purposes only. Calculators, interpretations, and AI-generated outputs should always be reviewed alongside patient history, examination findings, clinical guidelines, and professional judgment.`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2000);
    });
  };

  const handleCopySystemInstructions = () => {
    const text = `# Project Instructions: Chiktsa Sahayak Integration\n\n` +
      `Apply these instructions to define this application's look, feel, and features across any other platform app:\n\n` +
      `\`\`\`markdown\n` +
      `# AGENTS.md\n\n` +
      `## App Persona & Vibe\n` +
      `- **Name**: Chiktsa Sahayak (Clinical Decision-Support Suite)\n` +
      `- **Founder/Initiative**: Dr. M. P. Singh\n` +
      `- **Theme**: Very light colored background with a gorgeous grid/mesh pattern (mint or slate checked styling).\n` +
      `- **Visual Palette**: Clean, crisp margins, card layouts with generous white space, and high contrast typography (Inter + Space Grotesk).\n\n` +
      `## Core Features to Carry Over\n` +
      `1. **Explore Patient Data**: Unified grids of blood panels, renal clearings, CBC differentials, and liver profiles.\n` +
      `2. **Camp Screening Suite**: Rural health camp trackers and aggregated statistics.\n` +
      `3. **Calculator Reference**: FIB-4, APRI, BARD, MELD, Child-Pugh, BMI, ACR, and Metabolic risk models.\n` +
      `4. **Secure Customization**: Super Admin role validation via passcode "admin123" for lockable customization parameters (e.g. logo, publication toggles).\n` +
      `5. **AI Report Copilot**: Direct Gemini Integration for supportive reports, with fallback selectors for custom API engines (Groq, OpenRouter).\n` +
      `\`\`\``;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedInstructions(true);
      setTimeout(() => setCopiedInstructions(false), 2000);
    });
  };

  // Dynamic AI Provider States
  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    try {
      return localStorage.getItem("selected_ai_provider") || "auto";
    } catch {
      return "auto";
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
      bg: "bg-checkered-mint text-slate-950",
      accentText: "text-slate-950 font-bold",
      logoText: "text-slate-950 font-serif",
      cardStyle: "bg-white border-2 border-slate-300 shadow-xs",
      badgeActive: "bg-emerald-100 text-emerald-950 border border-emerald-400 font-mono text-xs font-bold",
      tabActive: "bg-slate-950 text-white shadow-sm font-sans uppercase tracking-wider font-bold",
      header: "bg-white/95 backdrop-blur-md text-slate-950 border-b border-slate-300 shadow-xs",
      headerLogo: "text-slate-950 font-serif text-xl font-bold tracking-tight",
      headerDesc: "text-emerald-900 font-mono text-[10px] uppercase tracking-widest font-black",
    },
    obsidian: {
      bg: "bg-checkered-slate text-slate-950",
      accentText: "text-slate-950 font-bold",
      logoText: "text-slate-950 font-serif",
      cardStyle: "bg-white border-2 border-slate-300 shadow-xs",
      badgeActive: "bg-slate-200 text-slate-950 border border-slate-400 font-mono text-xs font-bold",
      tabActive: "bg-slate-950 text-white shadow-sm font-sans uppercase tracking-wider font-bold",
      header: "bg-white/95 backdrop-blur-md text-slate-950 border-b border-slate-300 shadow-xs",
      headerLogo: "text-slate-950 font-serif text-xl font-bold tracking-tight",
      headerDesc: "text-slate-950 font-mono text-[10px] uppercase tracking-widest font-black",
    }
  }[colorScheme];

  const switcherColors = {
    standard: {
      containerBorder: "border-slate-300 shadow-xs hover:border-slate-400",
      buttonActiveStyle: "bg-slate-950 text-white border border-slate-950 shadow-xs font-black",
      buttonInactiveStyle: "bg-white hover:bg-slate-100 border border-slate-300 text-slate-950 shadow-xs font-bold",
    },
    obsidian: {
      containerBorder: "border-slate-300 shadow-xs hover:border-slate-400",
      buttonActiveStyle: "bg-slate-950 text-white border border-slate-950 shadow-xs font-black",
      buttonInactiveStyle: "bg-white hover:bg-slate-100 border border-slate-300 text-slate-950 shadow-xs font-bold",
    }
  }[colorScheme];

  // Local storage synchronization
  useEffect(() => {
    // Keep it light theme as requested by the user
    document.documentElement.classList.remove("dark");
  }, []);

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
      {/* Bento Grid Header Layout with Minimalist Graphic Design */}
      <header className={`sticky top-0 z-50 ${schemeClasses.header} overflow-hidden`}>
        {/* Minimalist Graphic Design Element (subtle grid pattern / border) */}
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        <div className="absolute left-1/3 top-0 w-64 h-full bg-[linear-gradient(to_right,rgba(45,90,55,0.02)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

        <div style={{ backgroundColor: "#ce7f7f" }} className="w-full max-w-none px-4 sm:px-8 md:px-12 py-3 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <h1 className={`text-lg font-black tracking-wider ${schemeClasses.headerLogo} leading-none`}>
                Chiktsa Sahayak
              </h1>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <p className={`text-[9px] ${schemeClasses.headerDesc} font-bold uppercase tracking-widest text-left leading-none`}>Clinical Decision-Support</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Home button */}
            <button
              onClick={() => {
                setActiveTab("overview");
                setReportsDropdownOpen(false);
              }}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 h-8 rounded-lg border bg-white/95 hover:bg-white text-slate-800 hover:text-slate-950 border-slate-200/90 shadow-xs transition-all text-xs font-bold cursor-pointer shrink-0 ${
                activeTab === "overview" ? "ring-2 ring-slate-400/50" : ""
              }`}
              title="Go to Home / Overview"
            >
              <Home size={14} className="text-slate-700" />
            </button>

            {/* About button */}
            <button
              onClick={() => setAboutOpen(true)}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 h-8 rounded-lg border bg-white/95 hover:bg-white text-slate-800 hover:text-slate-950 border-slate-200/90 shadow-xs transition-all text-xs font-bold cursor-pointer shrink-0"
              title="About Chiktsa Sahayak Clinical Suite"
            >
              <Info size={14} className="text-slate-700" />
            </button>

            {/* Add to Home Screen button */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("open-install-prompt"))}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 h-8 rounded-lg border bg-white/95 hover:bg-emerald-50 text-emerald-950 border-emerald-400 shadow-xs transition-all text-xs font-black cursor-pointer shrink-0"
              title="How to Add Chiktsa Sahayak to Home Screen"
            >
              <Smartphone size={14} className="text-emerald-700 stroke-[2.5]" />
              <span className="hidden sm:inline">Add to Home Screen</span>
            </button>

            {/* AI Provider Config */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 h-8 rounded-lg border bg-white/95 hover:bg-white text-slate-800 hover:text-slate-950 border-slate-200/90 shadow-xs transition-all text-xs font-bold cursor-pointer shrink-0"
              title="Configure AI Provider systems and API keys"
            >
              <Key size={14} className="text-slate-700" />
              <span>AI Provider</span>
            </button>
          </div>
        </div>
      </header>

      {/* Primary Dashboard Container */}
      <main className="w-full max-w-none px-4 sm:px-8 md:px-12 py-8 space-y-6">
        {/* Search Drawer Panel */}
        {searchOpen && (
          <div className="bg-white/95 border border-[#2d5a37]/15 rounded-3xl p-6 text-slate-800 space-y-4 shadow-xl transition-all duration-300 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <Search size={14} className="text-emerald-700" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">Clinical Knowledge & Log Explorer</span>
              </div>
              <button 
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
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
                className="w-full bg-slate-50 border border-slate-300 focus:border-emerald-600 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-500 outline-none transition-all font-medium"
                autoFocus
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
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
                        return <p className="text-xs text-slate-600 italic font-medium">No medical dictionary entries found.</p>;
                      }
                      return filtered.map(item => (
                        <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-slate-900">{item.term}</span>
                            <span className="text-[9px] font-extrabold uppercase bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 px-1.5 py-0.5 rounded leading-none">{item.category}</span>
                          </div>
                          <p className="text-[11px] text-slate-700 leading-relaxed text-justify font-medium">{item.definition}</p>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Patient / Diagnosis Record Logs Matches */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">Evaluation History Matches ({
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
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center space-y-1">
                            <p className="text-xs text-slate-600 italic font-medium">No historical reports match the criteria.</p>
                            <p className="text-[10px] text-slate-500 font-semibold">Saved logs search is real-time across clinical profiles.</p>
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
                          className="w-full text-left bg-slate-50 hover:bg-[#2d5a37]/5 border border-slate-200 hover:border-emerald-500/30 rounded-xl p-3.5 space-y-2 transition-all cursor-pointer block text-slate-800"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">{rec.patientName || "Anonymous Patient"}</span>
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded leading-none ${
                              rec.riskLevel === "critical"
                                ? "bg-rose-500/15 text-rose-700 border border-rose-500/30"
                                : rec.riskLevel === "high"
                                ? "bg-amber-500/15 text-amber-700 border border-amber-500/30"
                                : rec.riskLevel === "moderate"
                                ? "bg-yellow-500/15 text-yellow-700 border border-yellow-500/30"
                                : "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
                            }`}>
                              {rec.riskLevel} risk
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-600 font-semibold">
                            <span className="uppercase text-slate-600">File: {rec.type} Report</span>
                            <span className="text-slate-600">{new Date(rec.date).toLocaleDateString()}</span>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center animate-fade-in">
                <p className="text-xs text-slate-700 font-semibold pb-1.5">Begin typing above to perform unified clinical dictionary and diagnostic history search.</p>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-[10px] bg-slate-200 border border-slate-300 px-2 py-0.5 rounded text-slate-800 font-bold">FIB-4</span>
                  <span className="text-[10px] bg-slate-200 border border-slate-300 px-2 py-0.5 rounded text-slate-800 font-bold">MELD</span>
                  <span className="text-[10px] bg-slate-200 border border-slate-300 px-2 py-0.5 rounded text-slate-800 font-bold">ALT</span>
                  <span className="text-[10px] bg-slate-200 border border-slate-300 px-2 py-0.5 rounded text-slate-800 font-bold">Platelets</span>
                  <span className="text-[10px] bg-slate-200 border border-slate-300 px-2 py-0.5 rounded text-slate-800 font-bold">Child-Pugh</span>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Clinology Navigation Desk */}
        <div className={`flex flex-wrap items-center p-1 sm:p-1.5 rounded-[16px] sm:rounded-[20px] border transition-all duration-300 gap-1.5 relative w-full ${schemeClasses.cardStyle} ${switcherColors.containerBorder}`}>
          <div className="relative w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReportsDropdownOpen(!reportsDropdownOpen);
              }}
              className={`flex items-center justify-between w-full px-3.5 sm:px-5 py-2 sm:py-2.5 h-9 sm:h-[42px] rounded-[11px] sm:rounded-[14px] text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap cursor-pointer hover:scale-[1.005] active:scale-[0.99] ${
                ["cbc", "lft", "bmi", "metabolic"].includes(activeTab)
                  ? switcherColors.buttonActiveStyle
                  : switcherColors.buttonInactiveStyle
              }`}
            >
              <div className="flex items-center gap-2">
                {activeTab === "lft" ? (
                  <HeartPulse size={14} className="scale-90 sm:scale-100" />
                ) : activeTab === "bmi" ? (
                  <Scale size={14} className="scale-90 sm:scale-100" />
                ) : activeTab === "metabolic" ? (
                  <Cpu size={14} className="scale-90 sm:scale-100" />
                ) : activeTab === "history" ? (
                  <History size={14} className="scale-90 sm:scale-100" />
                ) : (
                  <Activity size={14} className="scale-90 sm:scale-100" />
                )}
                <span className="font-extrabold">
                  {activeTab === "cbc"
                    ? "Analyze CBC Report"
                    : activeTab === "lft"
                    ? "Analyze LFT & Scores"
                    : activeTab === "bmi"
                    ? "Calculate BMI"
                    : activeTab === "metabolic"
                    ? "Metabolic Syndrome & ACR"
                    : activeTab === "history"
                    ? "Activity Logs"
                    : "Analyze Reports"}
                </span>
              </div>
              <ChevronDown size={14} className={`transition-transform duration-200 scale-90 sm:scale-100 ${reportsDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {reportsDropdownOpen && (
              <div className="absolute left-0 right-0 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-50 p-1.5 flex flex-col gap-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  onClick={() => {
                    setActiveTab("cbc");
                    setReportsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-xs text-left font-bold transition-all cursor-pointer rounded-lg ${
                    activeTab === "cbc"
                      ? "bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-xs font-black"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Activity size={15} />
                    <span>Analyze CBC Report</span>
                  </div>
                  {activeTab === "cbc" && <Check size={14} className="text-emerald-400 dark:text-emerald-200" />}
                </button>
                <button
                  onClick={() => {
                    setActiveTab("lft");
                    setReportsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-xs text-left font-bold transition-all cursor-pointer rounded-lg ${
                    activeTab === "lft"
                      ? "bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-xs font-black"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <HeartPulse size={15} />
                    <span>Analyze LFT & Scores</span>
                  </div>
                  {activeTab === "lft" && <Check size={14} className="text-emerald-400 dark:text-emerald-200" />}
                </button>
                <button
                  onClick={() => {
                    setActiveTab("bmi");
                    setReportsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-xs text-left font-bold transition-all cursor-pointer rounded-lg ${
                    activeTab === "bmi"
                      ? "bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-xs font-black"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Scale size={15} />
                    <span>Calculate BMI</span>
                  </div>
                  {activeTab === "bmi" && <Check size={14} className="text-emerald-400 dark:text-emerald-200" />}
                </button>
                <button
                  onClick={() => {
                    setActiveTab("metabolic");
                    setReportsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-xs text-left font-bold transition-all cursor-pointer rounded-lg ${
                    activeTab === "metabolic"
                      ? "bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-xs font-black"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Cpu size={15} />
                    <span>Metabolic Syndrome and ACR</span>
                  </div>
                  {activeTab === "metabolic" && <Check size={14} className="text-emerald-400 dark:text-emerald-200" />}
                </button>
                <div className="h-px bg-slate-200/80 dark:bg-slate-800/80 my-0.5" />
                <button
                  onClick={() => {
                    setActiveTab("history");
                    setReportsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-xs text-left font-bold transition-all cursor-pointer rounded-lg ${
                    activeTab === "history"
                      ? "bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-xs font-black"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <History size={15} />
                    <span>Activity Logs ({records.length})</span>
                  </div>
                  {activeTab === "history" && <Check size={14} className="text-emerald-400 dark:text-emerald-200" />}
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
      <footer className="border-t border-slate-200/60 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm py-8 px-4 sm:px-8 mt-12 transition-all duration-300">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left space-y-1">
            <p className="text-lg font-black text-brand-gold font-serif-brand tracking-tight">
              Chiktsa Sahayak™
            </p>
            <p className="text-[10px] text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
              © 2026 Chiktsa Sahayak
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
              className="text-[11px] font-bold text-slate-650 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 cursor-pointer text-slate-700"
            >
              <Search size={12} className="text-emerald-600" />
              <span>Diagnostic Search</span>
            </button>

            <span className="text-slate-300 dark:text-slate-700">|</span>

            <button
              onClick={() => setAboutOpen(true)}
              className="text-[11px] font-bold text-slate-650 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 cursor-pointer text-slate-700"
            >
              <Info size={12} className="text-emerald-600" />
              <span>About Clinical Staging</span>
            </button>

            <span className="text-slate-300 dark:text-slate-700">|</span>

            <button
              onClick={() => setSettingsOpen(true)}
              className="text-[11px] font-bold text-slate-650 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 cursor-pointer text-slate-700"
            >
              <Key size={12} className="text-emerald-600" />
              <span>AI Engine Setup</span>
            </button>


          </div>
        </div>
      </footer>

      {/* Guide prompt for shortcut installation on mobile */}
      <InstallPrompt />

      {/* About Modal Dialog */}
      {aboutOpen && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-zoom-in">
            {/* Modal Header Decorated Line */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 z-10" />

            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 scrollbar-thin text-slate-950 dark:text-white">
              {/* Close Button */}
              <button
                onClick={() => setAboutOpen(false)}
                className="absolute top-5 right-5 p-2 text-slate-950 hover:text-black dark:text-slate-100 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border border-slate-300 dark:border-slate-700"
              >
                <X size={18} />
              </button>

              {/* Logo & Application Title */}
              <div className="text-center space-y-3 pt-2">
                <div className="w-16 h-16 mx-auto rounded-xl overflow-hidden flex items-center justify-center border-2 border-slate-300 dark:border-slate-700 bg-white p-1 relative group shadow-sm">
                  <img 
                    src={logoUrl} 
                    alt="Chiktsa Sahayak Logo" 
                    className="w-full h-full object-contain select-none pointer-events-none"
                    referrerPolicy="no-referrer"
                  />
                  {isPublished && (
                    <div className="absolute bottom-0 right-0 p-0.5 bg-white rounded-full border border-slate-400" title="Published Application Mode">
                      <Lock size={12} className="text-emerald-900" />
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-slate-950 dark:text-white font-serif-brand tracking-tight">
                    Chiktsa Sahayak™
                  </h3>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-xs text-slate-900 dark:text-slate-200 font-bold uppercase tracking-wider">
                      © 2026 Chiktsa Sahayak
                    </p>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider bg-emerald-100 text-emerald-950 border border-emerald-400">
                      {isPublished ? "Published" : "Draft Mode"}
                    </span>
                    {isSuperAdmin && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider bg-blue-100 text-blue-950 border border-blue-400">
                        Super Admin
                      </span>
                    )}
                  </div>
                </div>
                {/* Attribution & Add to Home Screen Guide Button */}
                <div className="pt-1 space-y-3">
                  <div>
                    <p className="text-xs text-slate-900 dark:text-slate-200 font-black uppercase tracking-widest leading-none">An initiative by</p>
                    <p className="font-black text-slate-950 dark:text-white mt-1.5 text-base">Dr. M. P. Singh</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAboutOpen(false);
                      window.dispatchEvent(new CustomEvent("open-install-prompt"));
                    }}
                    className="w-full max-w-sm mx-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
                  >
                    <Smartphone size={15} />
                    <span>How to Add App to Home Screen</span>
                  </button>
                </div>
              </div>

              <hr className="border-slate-300 dark:border-slate-700" />

              {/* Main Description */}
              <div className="space-y-5 text-xs text-slate-950 dark:text-slate-100 leading-relaxed text-justify font-semibold">
                <p>
                  Chiktsa Sahayak is an amateur initiative aimed at providing simple solutions to simple but important healthcare-related problems. It combines practical tools, calculators, reference resources, and utilities that may help make routine educational and clinical tasks more convenient.
                </p>

                {/* Purpose Section */}
                <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
                  <h4 className="font-black text-slate-950 dark:text-white uppercase tracking-wider text-xs">
                    Purpose of the Application
                  </h4>
                  <p className="text-slate-900 dark:text-slate-100 font-medium">
                    Many clinical scores and assessment tools are simple in principle but can be difficult to remember, calculate, or apply consistently during routine practice. The application aims to make these tools readily accessible and easier to use.
                  </p>
                </div>

                <hr className="border-slate-300 dark:border-slate-700" />

                {/* Key Features Section */}
                <div className="space-y-3.5">
                  <h4 className="font-black text-slate-950 dark:text-white uppercase tracking-wider text-xs">
                    Key Features
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    {/* EXPLORE PATIENT DATA */}
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-xl border-2 border-emerald-300 dark:border-emerald-700 col-span-1 sm:col-span-2 shadow-xs">
                      <span className="text-sm font-black text-emerald-950 dark:text-emerald-300 block flex items-center gap-2">
                        <Activity size={16} className="text-emerald-800 dark:text-emerald-400" /> Explore Numeric Patient Data
                      </span>
                      <span className="text-xs text-slate-950 dark:text-slate-100 block mt-2 leading-relaxed font-semibold">
                        Comprehensive exploration of quantitative biological metrics, CBC parameters, liver panel trends, and renal clearances. Allows clinical providers to analyze numerical data fields, correlate metabolic syndromes, and visualize biometric scores with state-of-the-art interactive charts.
                      </span>
                    </div>

                    {/* CAMP SCREENING & LOGISTICS */}
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-xl border-2 border-emerald-300 dark:border-emerald-700 col-span-1 sm:col-span-2 shadow-xs">
                      <span className="text-sm font-black text-emerald-950 dark:text-emerald-300 block flex items-center gap-2">
                        <HeartPulse size={16} className="text-emerald-800 dark:text-emerald-400" /> Camp Screening & Logistics Details
                      </span>
                      <span className="text-xs text-slate-950 dark:text-slate-100 block mt-2 leading-relaxed font-semibold">
                        Optimized module supporting non-profit rural health camps and mass checkups. Keeps meticulous records of group screening sessions, calculates aggregate camp health summaries, tracks regional patient distributions, and facilitates seamless print generation of clinical records on the go.
                      </span>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-xs">
                      <span className="text-xs font-black text-slate-950 dark:text-white block">FIB-4 Index</span>
                      <span className="text-xs text-slate-900 dark:text-slate-100 block mt-1 leading-normal font-bold">
                        A non-invasive metric derived from age, AST, ALT, and platelet count to help screen for liver fibrosis.
                      </span>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-xs">
                      <span className="text-xs font-black text-slate-950 dark:text-white block">APRI Score</span>
                      <span className="text-xs text-slate-900 dark:text-slate-100 block mt-1 leading-normal font-bold">
                        AST-to-Platelet Ratio Index, providing a basic, clear calculation tool for hepatic scarring assessments.
                      </span>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-xs">
                      <span className="text-xs font-black text-slate-950 dark:text-white block">BARD Score</span>
                      <span className="text-xs text-slate-900 dark:text-slate-100 block mt-1 leading-normal font-bold">
                        A prediction score weighting BMI, AST/ALT ratio, and type 2 diabetes status to assess fibrotic risks.
                      </span>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-xs">
                      <span className="text-xs font-black text-slate-950 dark:text-white block">MELD Score</span>
                      <span className="text-xs text-slate-900 dark:text-slate-100 block mt-1 leading-normal font-bold">
                        A score system used to evaluate the severity of chronic liver disease based on objective laboratory indicators.
                      </span>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-xs">
                      <span className="text-xs font-black text-slate-950 dark:text-white block">Child-Pugh Classification</span>
                      <span className="text-xs text-slate-900 dark:text-slate-100 block mt-1 leading-normal font-bold">
                        A prognosis grading grid evaluating bilirubin, albumin, INR, ascites, and hepatic encephalopathy severity.
                      </span>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-xs">
                      <span className="text-xs font-black text-slate-950 dark:text-white block">Metabolic Syndrome Risk Assessment</span>
                      <span className="text-xs text-slate-900 dark:text-slate-100 block mt-1 leading-normal font-bold">
                        A quick reference tracking standard metrics of cardiometabolic and fatty liver disease development risk.
                      </span>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-xs">
                      <span className="text-xs font-black text-slate-950 dark:text-white block">BMI Calculator</span>
                      <span className="text-xs text-slate-900 dark:text-slate-100 block mt-1 leading-normal font-bold">
                        A standard mass tracker module matching physiological indicators instantly for daily tracking convenience.
                      </span>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-xs">
                      <span className="text-xs font-black text-slate-950 dark:text-white block">CBC Interpretation Support</span>
                      <span className="text-xs text-slate-900 dark:text-slate-100 block mt-1 leading-normal font-bold">
                        A basic supportive overview assisting the translation of blood parameters and platelet thresholds.
                      </span>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-xs">
                      <span className="text-xs font-black text-slate-950 dark:text-white block">Albumin-Creatinine Ratio (ACR)</span>
                      <span className="text-xs text-slate-900 dark:text-slate-100 block mt-1 leading-normal font-bold">
                        A clean reference screen assisting standard microalbuminuria assessments in chronic patients.
                      </span>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-xs">
                      <span className="text-xs font-black text-slate-950 dark:text-white block">AI-Assisted Report Analysis</span>
                      <span className="text-xs text-slate-900 dark:text-slate-100 block mt-1 leading-normal font-bold">
                        Optional integration allowing user-provided API keys to assist in parsing standard report values for educational purposes.
                      </span>
                    </div>
                  </div>
                </div>

                <hr className="border-slate-300 dark:border-slate-700" />

                {/* Important Notice Section */}
                <div className="p-4.5 bg-amber-100 dark:bg-amber-950/60 rounded-xl border-2 border-amber-500 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 font-black text-amber-950 dark:text-amber-200 text-xs">
                    <AlertTriangle size={16} className="text-amber-700 dark:text-amber-400" />
                    <span>Important Notice</span>
                  </div>
                  <p className="text-xs text-slate-950 dark:text-slate-100 leading-relaxed text-justify font-bold">
                    The application is intended for educational, informational, and reference purposes only. Calculators, interpretations, and AI-generated outputs should always be reviewed alongside patient history, examination findings, investigations, clinical guidelines, and professional judgment. The application does not replace diagnosis, treatment decisions, or specialist consultation.
                  </p>
                </div>

                {/* Share & Copy Section */}
                <div className="p-4.5 bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-500 rounded-xl space-y-3 shadow-xs">
                  <div className="flex items-center gap-2 font-black text-emerald-950 dark:text-emerald-200 text-xs">
                    <Share2 size={16} className="text-emerald-800 dark:text-emerald-400" />
                    <span>Copy & Replicate About Section</span>
                  </div>
                  <p className="text-xs text-slate-950 dark:text-slate-100 leading-relaxed text-justify font-bold">
                    You can copy the entire content of this About panel as rich Markdown, or copy the developer guide instructions (designed for <code className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded font-mono text-xs font-black text-slate-950 dark:text-white border border-slate-400 dark:border-slate-600">AGENTS.md</code>) to instantly replicate this look, feel, and features on any of your other workspace applications.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1.5">
                    <button
                      type="button"
                      onClick={handleCopyAboutMarkdown}
                      className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border-2 border-slate-400 dark:border-slate-600 text-slate-950 dark:text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm active:scale-98"
                    >
                      {copiedMarkdown ? (
                        <>
                          <Check size={14} className="text-emerald-700 animate-bounce" />
                          <span className="text-emerald-800 font-black">Copied Rich Markdown!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} className="text-emerald-800" />
                          <span>Copy Rich Markdown</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopySystemInstructions}
                      className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm active:scale-98"
                    >
                      {copiedInstructions ? (
                        <>
                          <Check size={14} className="text-white animate-bounce" />
                          <span className="font-black">Copied App Guide!</span>
                        </>
                      ) : (
                        <>
                          <FileText size={14} className="text-white" />
                          <span>Copy App Guide (AGENTS.md)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Closing */}
                <div className="text-center pt-2 text-slate-950 dark:text-slate-100 text-xs font-black italic">
                  Thank you for using Chiktsa Sahayak.
                </div>
              </div>

              {/* Close Button Footer */}
              <div className="flex items-center justify-end pt-4 border-t-2 border-slate-300 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAboutOpen(false)}
                  className="px-6 py-2.5 bg-slate-950 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 rounded-xl text-xs font-black transition-colors cursor-pointer shadow-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-md animate-fade-in animate-duration-200">
          <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden">
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
              <div className="p-4 bg-emerald-50 rounded-xl border-2 border-emerald-300 text-xs space-y-2 leading-relaxed text-left">
                <div className="flex items-center gap-2 font-black mb-1">
                  <ShieldPlus size={16} className="text-emerald-700 shrink-0" />
                  <span style={{ color: "#000000" }} className="text-slate-950 font-black text-xs">End-to-End Client Security Guarantee</span>
                </div>
                <p style={{ color: "#000000" }} className="text-justify font-bold text-slate-950 text-xs leading-relaxed">
                  All provider API keys are saved <strong style={{ color: "#000000" }} className="font-black">exclusively</strong> inside your browser's private sandboxed cache (<code style={{ color: "#000000" }} className="font-mono font-black bg-white px-1 py-0.5 rounded border border-emerald-300">localStorage</code>). No keys are ever written to cloud servers or exposed to tracking systems.
                </p>
              </div>

              {/* Provider Selection Dropdown */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Select Active AI Engine Mode
                </label>
                <div className="relative">
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-900/40 border-2 border-slate-300 dark:border-slate-800 rounded-xl text-xs font-black text-slate-950 dark:text-slate-100 outline-none appearance-none cursor-pointer focus:border-emerald-500"
                  >
                    <option value="auto">✨ Auto (Smart Multi-Agent Cascade - Recommended)</option>
                    <option value="gemini">Gemini Flash (Built-in Support / Zero-Cost)</option>
                    <option value="groq">Groq Llama 3.3 70B (High-Speed Cloud)</option>
                    <option value="openrouter">OpenRouter (Unified Multi-Model)</option>
                    <option value="openai">OpenAI GPT-4o-mini (Precision Diagnostics)</option>
                    <option value="claude">Claude 3.5 Haiku (Dense Clinical Detail)</option>
                    <option value="deepseek">DeepSeek Chat (Clinical Reasoning)</option>
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-700">
                    <ChevronDown size={14} />
                  </div>
                </div>
              </div>

              {/* Multi-Agent Cascade Status or Provider Details */}
              {selectedProvider === "auto" ? (
                <div className="space-y-3 pt-1">
                  <div className="bg-emerald-50 border-2 border-emerald-300 p-3.5 rounded-xl text-xs space-y-2 text-left">
                    <div className="flex items-center gap-2 font-black text-emerald-950">
                      <ShieldPlus size={16} className="text-emerald-700" />
                      <span>Smart Multi-Agent Failover Active</span>
                    </div>
                    <p className="text-slate-900 font-bold leading-relaxed">
                      The application will automatically test and cycle through all available AI engines in priority order. If any provider experiences rate limits, errors, or lacks a key, it seamlessly switches to the next available agent.
                    </p>
                    <div className="pt-2 border-t border-emerald-200 space-y-1 text-[11px] font-mono font-bold">
                      <div className="text-emerald-900 font-black uppercase text-[10px]">Failover Pipeline Priority:</div>
                      <div className="flex items-center gap-1.5 flex-wrap text-slate-800">
                        <span className="px-2 py-0.5 rounded bg-white border border-emerald-300 font-bold">1. Gemini Flash</span>
                        <span>→</span>
                        <span className={`px-2 py-0.5 rounded border font-bold ${keys.groq ? "bg-emerald-100 text-emerald-950 border-emerald-400 font-black" : "bg-white text-slate-600 border-slate-300"}`}>2. Groq Llama {keys.groq ? "✓" : ""}</span>
                        <span>→</span>
                        <span className={`px-2 py-0.5 rounded border font-bold ${keys.openrouter ? "bg-emerald-100 text-emerald-950 border-emerald-400 font-black" : "bg-white text-slate-600 border-slate-300"}`}>3. OpenRouter {keys.openrouter ? "✓" : ""}</span>
                        <span>→</span>
                        <span className={`px-2 py-0.5 rounded border font-bold ${keys.deepseek ? "bg-emerald-100 text-emerald-950 border-emerald-400 font-black" : "bg-white text-slate-600 border-slate-300"}`}>4. DeepSeek {keys.deepseek ? "✓" : ""}</span>
                        <span>→</span>
                        <span className={`px-2 py-0.5 rounded border font-bold ${keys.openai ? "bg-emerald-100 text-emerald-950 border-emerald-400 font-black" : "bg-white text-slate-600 border-slate-300"}`}>5. OpenAI {keys.openai ? "✓" : ""}</span>
                        <span>→</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-950 border border-emerald-400 font-black">6. Public Interest Engine (100% Reliable)</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-700 font-bold text-left">
                    Tip: To add personal keys for any provider in the cascade, select the specific provider from the dropdown above and paste your key.
                  </p>
                </div>
              ) : (() => {
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
                          {currentKeyVal ? "Personal key configured for custom quota allocation." : "Zero API Key required! Public Interest Engine active automatically."}
                        </p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setConfirmRedirectUrl(activeConfig.url)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#2d5a37] hover:bg-[#23482c] text-white font-bold rounded-lg text-[9px] uppercase tracking-wider transition-all shadow-sm shrink-0 cursor-pointer text-center"
                      >
                        <span>Get Personal Key</span>
                        <ExternalLink size={10} />
                      </button>
                    </div>

                    {/* Key input with status indicator */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Optional Custom API Key
                        </label>
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded leading-none ${
                          currentKeyVal ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-emerald-500/10 text-[#2d5a37] dark:text-emerald-400 border border-emerald-500/20"
                        }`}>
                          {currentKeyVal ? "Personal Key Connected ✓" : "Public Interest Mode Active ✓"}
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
                          className="w-full pl-10 pr-20 py-2.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/20 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-all outline-none"
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

              <hr className="border-slate-150 dark:border-slate-800" />

              {/* Super Admin / App Publication / Logo Update Customization */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Settings size={16} className="text-emerald-500" />
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-700 dark:text-slate-350">
                    App Publication & Logo Settings
                  </h4>
                </div>

                {/* Published Toggle Switch */}
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 text-left">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      Application Status: {isPublished ? "Published" : "Draft Mode"}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block leading-tight">
                      When published, logo rights are restricted to Super Admins only.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTogglePublished(!isPublished)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isPublished ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isPublished ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Super Admin Credentials Section */}
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Super Admin Access Rights
                    </span>
                    {isSuperAdmin ? (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20">
                        Authenticated
                      </span>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md">
                        Locked
                      </span>
                    )}
                  </div>

                  {isSuperAdmin ? (
                    <div className="flex items-center justify-between gap-2 pt-1 text-left">
                      <p className="text-[10px] text-emerald-500 font-medium">
                        ✓ Super Admin status active (Logo customization fully unlocked).
                      </p>
                      <button
                        type="button"
                        onClick={handleLogoutAdmin}
                        className="text-[10px] font-black text-rose-500 hover:text-rose-400 uppercase tracking-wider bg-rose-500/5 px-2 py-1 rounded-md border border-rose-500/10 cursor-pointer"
                      >
                        Log Out
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 text-left">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                        Enter passcode <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-700 dark:text-slate-350">admin123</code> to authenticate as Super Admin.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder="Super Admin Passcode..."
                          value={adminPasscode}
                          onChange={(e) => setAdminPasscode(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAuthenticateAdmin();
                            }
                          }}
                          className="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:border-emerald-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAuthenticateAdmin}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Verify
                        </button>
                      </div>
                      {adminError && (
                        <p className="text-[10px] text-rose-500 font-bold">{adminError}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Photo Update for Logo Rights Section */}
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5 text-left">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                        Customize Logo / Branding Photo
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block leading-tight">
                        Upload an image (Base64 saved locally).
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white flex items-center justify-center p-0.5 shrink-0">
                      <img src={logoUrl} alt="Preview Logo" className="w-full h-full object-contain" />
                    </div>
                  </div>

                  {/* Upload input enabled/disabled condition */}
                  {isPublished && !isSuperAdmin ? (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg flex items-start gap-2 text-[10px] text-amber-600 dark:text-amber-400 leading-normal text-left">
                      <Lock size={12} className="shrink-0 mt-0.5" />
                      <span>
                        Logo updates are currently <strong>locked</strong> because this application is published. Only authenticated <strong>Super Admins</strong> can update the logo.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1 text-left">
                      <div className="flex flex-wrap gap-2">
                        <label className="flex-1 flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold py-2 px-3 rounded-lg cursor-pointer transition-all">
                          <span>Upload Photo</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleUpdateLogoFile}
                            className="hidden"
                          />
                        </label>
                        {logoUrl !== logoImg && (
                          <button
                            type="button"
                            onClick={handleResetLogo}
                            className="text-xs font-bold text-rose-500 hover:text-rose-400 bg-rose-500/5 px-3 py-2 rounded-lg border border-rose-500/10 cursor-pointer"
                          >
                            Reset Default
                          </button>
                        )}
                      </div>
                      {isPublished && isSuperAdmin && (
                        <p className="text-[10px] text-blue-500 font-semibold">
                          ✓ Authorized: Super Admin rights verified. Logo editing is unlocked.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

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
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm bg-white border border-slate-300 rounded-2xl shadow-2xl p-6 space-y-4">
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
