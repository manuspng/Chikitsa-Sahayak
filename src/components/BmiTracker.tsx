import React, { useState } from "react";
import { HelpCircle, Save, Check, FileText, AlertCircle, RefreshCw, Layers } from "lucide-react";
import { BMIInputs, BMIResults, AnalysisRecord } from "../types";
import { calculateBMI } from "../utils/calculations";
import { printClinicalReport } from "../utils/printHelper";
import { runGeminiAnalyze } from "../utils/geminiClient";
import ScoreGauge from "./ScoreGauge";
import MetricCard from "./MetricCard";

function getOfflineBmiSummary(inputs: BMIInputs, results: BMIResults): string {
  const line1 = `Local Basic Interpretation: BMI of ${results.bmi} indicates a status of ${results.category}.`;
  let line2 = ` ${results.metabolicRisk}.`;
  let line3 = "";
  if (results.whr !== undefined && results.whrInterpretation?.toLowerCase().includes("high")) {
    line3 += " Visceral fat accumulation markers are high based on Waist-to-Hip Ratio, signifying heightened cardiovascular risk.";
  } else if (results.whr !== undefined) {
    line3 += " Waist-to-Hip ratio is within standard reference boundaries.";
  }
  return `${line1}${line2}${line3}`;
}

interface BmiTrackerProps {
  onAddRecord: (record: Omit<AnalysisRecord, "id" | "date"> & { id?: string }) => void;
}

export default function BmiTracker({ onAddRecord }: BmiTrackerProps) {
  const [formData, setFormData] = useState({
    weight: "",
    height: "",
    age: "35",
    gender: "male" as "male" | "female",
    waist: "",
    hip: "",
  });

  const [results, setResults] = useState<BMIResults | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);

  // Mapped dynamic AI provider translations
  const currentProvider = localStorage.getItem("selected_ai_provider") || "gemini";
  const providerNames: Record<string, string> = {
    gemini: "Gemini Flash",
    groq: "Groq Llama",
    openrouter: "OpenRouter Flash",
    openai: "OpenAI GPT-4o",
    claude: "Claude Haiku",
    deepseek: "DeepSeek Expert",
  };
  const activeProviderName = providerNames[currentProvider] || "Clinical AI";

  const handleInputChange = (key: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
    setCurrentRecordId(null);
  };

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.weight || !formData.height) {
      alert("Missing weight or height parameters!");
      return;
    }

    const inputs: BMIInputs = {
      weight: parseFloat(formData.weight),
      height: parseFloat(formData.height),
      age: parseInt(formData.age),
      gender: formData.gender,
      waist: formData.waist ? parseFloat(formData.waist) : undefined,
      hip: formData.hip ? parseFloat(formData.hip) : undefined,
    };

    const calculated = calculateBMI(inputs);
    setResults(calculated);
    setAiInsight(null);
    setAiError(null);
    setIsSaved(false);

    // Generate/Reuse temporary record identifier for auto-increments
    const newRecordId = "REC-" + Math.random().toString(36).substring(2, 9).toUpperCase();
    setCurrentRecordId(newRecordId);

    // Automatically call onAddRecord to dynamically increment the counts and logs instantly
    onAddRecord({
      id: newRecordId,
      type: "bmi",
      title: `BMI & WHR Screen (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: formData.gender,
      patientAge: formData.age ? parseInt(formData.age) : undefined,
      inputs,
      results: calculated,
      riskLevel: calculated.riskLevel,
    });
  };

  const handleTriggerAiAnalysis = () => {
    if (!results || !currentRecordId) return;

    if (isAiLoading) return; // Prevent repeated rapid requests

    if (!navigator.onLine) {
        setAiError("You appear to be offline. Please connect to the internet to use AI diagnostics.");
        return;
    }

    const inputs: BMIInputs = {
      weight: parseFloat(formData.weight),
      height: parseFloat(formData.height),
      age: parseInt(formData.age),
      gender: formData.gender,
      waist: formData.waist ? parseFloat(formData.waist) : undefined,
      hip: formData.hip ? parseFloat(formData.hip) : undefined,
    };

    requestAiInsight(inputs, results, currentRecordId);
  };

  const requestAiInsight = async (inputs: BMIInputs, calculated: BMIResults, recordId: string) => {
    setIsAiLoading(true);
    setAiError(null);

    try {
      const prompt = `Interpret the following Patient Metabolic Assessment results:
- Weight: ${inputs.weight} kg
- Height: ${inputs.height} cm
- BMI: ${calculated.bmi} kg/m^2 (${calculated.category})
- Waist: ${inputs.waist ?? "N/A"} cm
- Hip: ${inputs.hip ?? "N/A"} cm
- Waist-to-Hip Ratio (WHR): ${calculated.whr ?? "N/A"} (${calculated.whrInterpretation ?? "Normal"})
- Gender: ${inputs.gender}
- Age: ${inputs.age}

Calculated Metabolic Markers:
- Metabolic Risk classification: ${calculated.metabolicRisk}
- Visceral Fat Load Risk level: ${calculated.riskLevel}

Please write an expert, professional clinical interpretation of this patient's metabolic risk factors as they pertain to fat deposition, Non-Alcoholic Fatty Liver Disease (NAFLD/MASH), insulin resistance, and overall cardiovascular fitness. Provide physical recommendations for diet changes, weight tracking, or abdominal exercise regimes.`;

      const provider = localStorage.getItem("selected_ai_provider") || "gemini";
      const data = await runGeminiAnalyze("bmi", prompt, provider);

      if (data && data.insight) {
        setAiInsight(data.insight);
        
        // Dynamically update the newly generated record inside history to reflect current AiInsight
        onAddRecord({
          id: recordId,
          type: "bmi",
          title: `BMI & WHR Screen (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
          patientName: patientName || "Not Specified",
          patientGender: formData.gender,
          patientAge: formData.age ? parseInt(formData.age) : undefined,
          inputs,
          results: calculated,
          aiInsight: data.insight,
          riskLevel: calculated.riskLevel,
        });
      } else {
        setAiError("Failed to generate Clinical AI Analysis");
      }
    } catch (err: any) {
      setAiError(err.message || "Connection to AI engine failed. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSave = () => {
    if (!results) return;

    onAddRecord({
      id: currentRecordId || undefined,
      type: "bmi",
      title: `BMI & WHR Screen (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: formData.gender,
      patientAge: formData.age ? parseInt(formData.age) : undefined,
      inputs: {
        weight: parseFloat(formData.weight),
        height: parseFloat(formData.height),
        age: parseInt(formData.age),
        gender: formData.gender,
        waist: formData.waist ? parseFloat(formData.waist) : undefined,
        hip: formData.hip ? parseFloat(formData.hip) : undefined,
      },
      results,
      aiInsight: aiInsight || undefined,
      riskLevel: results.riskLevel,
    });
    setIsSaved(true);
  };

  const handlePrintPDF = () => {
    if (!results) return;
    printClinicalReport({
      type: "bmi",
      title: `BMI & WHR Screen (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: formData.gender,
      patientAge: formData.age ? parseInt(formData.age) : undefined,
      inputs: {
        weight: parseFloat(formData.weight),
        height: parseFloat(formData.height),
        age: parseInt(formData.age),
        gender: formData.gender,
        waist: formData.waist ? parseFloat(formData.waist) : undefined,
        hip: formData.hip ? parseFloat(formData.hip) : undefined,
      },
      results,
      aiInsight: aiInsight || undefined,
      riskLevel: results.riskLevel,
    });
  };

  const handlePopulateSample = () => {
    setFormData({
      weight: "92",
      height: "172",
      age: "42",
      gender: "male",
      waist: "104",
      hip: "96",
    });
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
  };

  return (
    <div className="space-y-6">
      {/* Input panel */}
      <form onSubmit={handleCalculate} className="bento-card dark:bg-slate-800 space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-4 text-justify">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Patient & Metabolic Core Parameters</h3>
            <p className="text-xs text-slate-400">Incorporate patient demographics and clinical panels evaluated during full diagnostic screening cycles.</p>
          </div>

          <button
            type="button"
            onClick={handlePopulateSample}
            className="text-[10px] font-bold tracking-wide uppercase px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 cursor-pointer flex items-center gap-1"
          >
            <Layers size={10} />
            <span>Load sample values</span>
          </button>
        </div>

        {/* Patient Demographics Registration Profile */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-200/50 dark:border-slate-800/60 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Patient Full Name</label>
            <input 
              type="text" 
              placeholder="e.g. Robert Chen"
              value={patientName}
              onChange={e => {
                setPatientName(e.target.value);
                setCurrentRecordId(null);
              }}
              className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-100/10 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 bg-transparent" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Patient Gender / Sex</label>
            <div className="flex bg-white dark:bg-slate-900/60 rounded-xl p-1 border border-slate-200 dark:border-slate-100/10">
              <button
                type="button"
                onClick={() => handleInputChange("gender", "male")}
                className={`flex-1 py-1 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  formData.gender === "male"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              >
                Male
              </button>
              <button
                type="button"
                onClick={() => handleInputChange("gender", "female")}
                className={`flex-1 py-1 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  formData.gender === "female"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              >
                Female
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Patient Age</label>
            <div className="relative">
              <input 
                type="number" 
                placeholder="45"
                value={formData.age}
                onChange={e => handleInputChange("age", e.target.value)}
                className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-100/10 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:ring-1 focus:ring-indigo-500 bg-transparent" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">Years</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center flex-wrap gap-4 border-t border-slate-100 dark:border-slate-800/40 pt-4">
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Biological Core Markers</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Weight <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="e.g. 75"
                value={formData.weight}
                onChange={e => handleInputChange("weight", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">kg</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Height <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="e.g. 175"
                value={formData.height}
                onChange={e => handleInputChange("height", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">cm</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Age</label>
            <div className="relative">
              <input 
                type="number" 
                placeholder="e.g. 35"
                value={formData.age}
                onChange={e => handleInputChange("age", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">yrs</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-50 dark:border-slate-700/30 pt-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Visceral Fat Adiposity Parameters (WHR Ratio)</h4>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleInputChange("gender", "male")}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  formData.gender === "male"
                    ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                Male Thresholds
              </button>
              <button
                type="button"
                onClick={() => handleInputChange("gender", "female")}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  formData.gender === "female"
                    ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                Female Thresholds
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Waist Circumference</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 90 cm"
                  value={formData.waist}
                  onChange={e => handleInputChange("waist", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">cm</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Hip Circumference</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 95 cm"
                  value={formData.hip}
                  onChange={e => handleInputChange("hip", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">cm</span>
              </div>
            </div>
          </div>
        </div>

        <button 
          type="submit"
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/10 cursor-pointer"
        >
          <span>Calculate Visceral Metabolic Indexes</span>
        </button>
      </form>

      {/* Results panel */}
      {results && (
        <div className="space-y-6 pt-2">
          {/* Main Risk Bracket */}
          <ScoreGauge 
            label="Metabolic BMI Index"
            score={results.bmi}
            maxScore={45}
            riskLevel={results.riskLevel}
          />
          
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            Category classification: <span className="font-extrabold text-slate-800 dark:text-slate-100">{results.category}</span>. {results.metabolicRisk}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Ideal Weight Card */}
            <div className="bento-card dark:bg-slate-800 space-y-1.5 p-6">
              <span className="card-title">Clinician Healthy Target Weight Range</span>
              <div className="text-xl font-extrabold text-slate-800 dark:text-slate-100 font-mono">
                {results.idealWeightMin} - {results.idealWeightMax} <span className="text-xs font-semibold text-slate-500 font-sans">kg</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Weight parameters required to represent a standard compensated body index (18.5 - 24.9) at current stature limits.
              </p>
            </div>

            {/* WHR Card */}
            <div className="bento-card dark:bg-slate-800 space-y-1.5 p-6">
              <span className="card-title">Waist-to-Hip Ratio (WHR)</span>
              {results.whr !== undefined ? (
                <div>
                  <div className="text-xl font-extrabold text-slate-800 dark:text-slate-100 font-mono">
                    {results.whr}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    {results.whrInterpretation}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-400 pt-1">Lock: Enter waist and hip values to track active abdominal lipid metrics.</p>
              )}
            </div>
          </div>

          {/* Local & AI Clinical Interpretation Panel */}
          <div className="p-6 bg-slate-900 border border-slate-800 text-white rounded-3xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h4 className="text-sm font-extrabold tracking-wider text-emerald-400 uppercase flex items-center gap-1.5">
                <FileText size={16} />
                <span>Clinical Diagnostics Board</span>
              </h4>
              <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-extrabold uppercase tracking-wider">
                Local + AI
              </span>
            </div>

            {/* Part A: Offline Rule-Based Basic Interpretation */}
            <div className="space-y-1 bg-slate-950/40 p-4 rounded-2xl border border-slate-850/60">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#22c55e]">
                Local Basic Interpretation (Offline)
              </span>
              <p className="text-xs text-slate-200 leading-relaxed font-semibold mt-1 text-justify">
                {results ? getOfflineBmiSummary({
                  weight: parseFloat(formData.weight) || 0,
                  height: parseFloat(formData.height) || 0,
                  age: parseInt(formData.age) || 35,
                  gender: formData.gender,
                  waist: formData.waist ? parseFloat(formData.waist) : undefined,
                  hip: formData.hip ? parseFloat(formData.hip) : undefined,
                }, results) : ""}
              </p>
            </div>

            {/* Part B: On-Demand AI Interpretation */}
            <div className="space-y-3 pt-1">
              {!aiInsight && !isAiLoading && !aiError && (
                <div className="flex flex-col items-center justify-center p-4 bg-slate-950/20 border border-dashed border-slate-800 rounded-2xl space-y-2">
                  <p className="text-[11px] text-slate-300 text-center font-medium leading-relaxed">
                    Need an deep expert clinical review of obesity/metabolic indexes, fat deposit locations, and customized dietary and health plans with {activeProviderName}?
                  </p>
                  <button
                    type="button"
                    onClick={handleTriggerAiAnalysis}
                    disabled={isAiLoading}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={12} className={isAiLoading ? "animate-spin" : ""} />
                    <span>Interpret Using AI</span>
                  </button>
                </div>
              )}

              {isAiLoading && (
                <div className="h-28 flex flex-col items-center justify-center space-y-2 bg-slate-950/20 rounded-2xl border border-slate-850/40">
                  <RefreshCw className="animate-spin text-emerald-400" size={24} />
                  <p className="text-xs text-slate-300 font-bold">Generating expert clinical interpretation with {activeProviderName}...</p>
                </div>
              )}

              {aiError && (
                <div className="p-4 bg-red-950/30 border border-red-900/40 rounded-2xl space-y-2">
                  <p className="text-xs text-red-400 flex items-center gap-1.5 font-bold">
                    <AlertCircle size={14} />
                    <span>{aiError}</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleTriggerAiAnalysis}
                    disabled={isAiLoading}
                    className="px-4 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-300 border border-red-800/40 rounded-lg text-[10px] font-bold uppercase transition-colors disabled:opacity-50"
                  >
                    Retry AI analysis
                  </button>
                </div>
              )}

              {aiInsight && (
                <div className="space-y-2 p-4 bg-slate-950/30 border border-slate-850/40 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#22c55e]">
                    Clinical AI Analysis ({activeProviderName})
                  </span>
                  <div className="text-slate-200 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed text-justify pr-2 max-h-96 overflow-y-auto">
                    {aiInsight}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 pt-3 text-[10px] text-slate-500 font-medium space-y-1.5 leading-relaxed">
              <p>
                <strong>Medical Disclaimer:</strong> Decision-support only. This information should always be analyzed alongside professional clinicians.
              </p>
              <p className="text-slate-400 font-bold border-l-2 border-emerald-500/40 pl-2">
                AI-generated interpretation. Not a medical diagnosis. Consult a qualified doctor.
              </p>
            </div>
          </div>

          {/* Save panel */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 border-t border-slate-200/50 dark:border-slate-800/40 gap-4">
            <span className="text-xs text-slate-400">Ensure values are verified before sharing or saving to logs.</span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrintPDF}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all duration-300 flex items-center gap-1.5 shadow-md shadow-indigo-600/10 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                  <path d="M6 14h12v8H6z"/>
                </svg>
                <span>Share PDF Report</span>
              </button>

              {!isSaved ? (
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-xs font-bold transition-all duration-300 flex items-center gap-1.5 shadow-md shadow-emerald-500/10 cursor-pointer"
                >
                  <Save size={14} />
                  <span>Save to History Logs</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1 text-xs text-emerald-500 bg-emerald-50/10 border border-emerald-500/10 px-4 py-2 rounded-xl font-bold">
                  <Check size={14} />
                  <span>Saved successfully</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
