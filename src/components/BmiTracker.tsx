import React, { useState } from "react";
import { HelpCircle, Save, Check, FileText, AlertCircle, RefreshCw, Layers, Trash2 } from "lucide-react";
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

  const handleClearAllInputs = () => {
    setFormData({
      weight: "",
      height: "",
      age: "45",
      gender: "male",
      waist: "",
      hip: "",
    });
    setPatientName("");
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
    setCurrentRecordId(null);
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
      {/* Quick Actions Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePopulateSample}
            className="text-xs font-bold tracking-wide px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer flex items-center gap-1.5 transition-colors"
          >
            <Layers size={13} />
            <span>Load sample values</span>
          </button>
        </div>
        <button
          type="button"
          onClick={handleClearAllInputs}
          className="text-xs font-bold tracking-wide px-3.5 py-1.5 rounded-xl border border-red-200 hover:bg-red-50 text-red-500 dark:border-red-500/20 dark:hover:bg-red-500/10 cursor-pointer flex items-center gap-1.5 transition-colors"
        >
          <Trash2 size={13} />
          <span>Clear inputs</span>
        </button>
      </div>

      {/* Manual Input Workspace */}
      <form onSubmit={handleCalculate} style={{ backgroundColor: "#ffffff" }} className="bento-card border-2 border-slate-300 space-y-6">
        <div>
          <h3 style={{ color: "#000000" }} className="text-base font-black uppercase tracking-wider flex items-center gap-2 font-sans mb-1">
            <span className="w-1.5 h-4.5 bg-emerald-600 rounded-full shrink-0" />
            <span>Patient & Metabolic Core Parameters</span>
          </h3>
          <p style={{ color: "#000000" }} className="text-xs font-bold">Incorporate patient demographics and clinical panels evaluated during full diagnostic screening cycles.</p>
        </div>

        {/* Patient Demographics Registration Profile */}
        <div className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Patient Full Name</label>
            <input 
              type="text" 
              placeholder="e.g. Robert Chen"
              value={patientName}
              onChange={e => {
                setPatientName(e.target.value);
                setCurrentRecordId(null);
              }}
              className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-bold placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 h-[42px]" 
            />
          </div>

          <div className="space-y-1.5">
            <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Patient Gender / Sex</label>
            <select
              value={formData.gender}
              onChange={e => handleInputChange("gender", e.target.value)}
              className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-bold focus:ring-2 focus:ring-emerald-500 cursor-pointer h-[42px]"
            >
              <option value="male" className="text-slate-950">Male</option>
              <option value="female" className="text-slate-950">Female</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Patient Age</label>
            <div className="relative">
              <input 
                type="number" 
                placeholder="45"
                value={formData.age}
                onChange={e => handleInputChange("age", e.target.value)}
                className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-12 font-mono focus:ring-2 focus:ring-emerald-500 h-[42px]" 
              />
              <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">Years</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center flex-wrap gap-4 border-t border-slate-200 pt-4">
          <div>
            <h3 style={{ color: "#000000" }} className="text-xs font-black uppercase tracking-wide flex items-center gap-2">
              <span className="w-1.5 h-3 bg-emerald-600 rounded-full shrink-0" />
              <span>Biological Core Markers</span>
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Weight <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="e.g. 75"
                value={formData.weight}
                onChange={e => handleInputChange("weight", e.target.value)}
                className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-10 font-mono focus:ring-2 focus:ring-emerald-500" 
              />
              <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">kg</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Height <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="e.g. 175"
                value={formData.height}
                onChange={e => handleInputChange("height", e.target.value)}
                className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-10 font-mono focus:ring-2 focus:ring-emerald-500" 
              />
              <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">cm</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Age</label>
            <div className="relative">
              <input 
                type="number" 
                placeholder="e.g. 35"
                value={formData.age}
                onChange={e => handleInputChange("age", e.target.value)}
                className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-10 font-mono focus:ring-2 focus:ring-emerald-500" 
              />
              <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">yrs</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h4 style={{ color: "#000000" }} className="text-xs font-black uppercase tracking-wide flex items-center gap-2">
              <span className="w-1.5 h-3 bg-emerald-600 rounded-full shrink-0" />
              <span>Visceral Fat Adiposity Parameters (WHR Ratio)</span>
            </h4>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleInputChange("gender", "male")}
                className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  formData.gender === "male"
                    ? "bg-indigo-700 text-white shadow-xs"
                    : "bg-slate-200 text-slate-950 hover:bg-slate-300"
                }`}
              >
                Male Thresholds
              </button>
              <button
                type="button"
                onClick={() => handleInputChange("gender", "female")}
                className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  formData.gender === "female"
                    ? "bg-indigo-700 text-white shadow-xs"
                    : "bg-slate-200 text-slate-950 hover:bg-slate-300"
                }`}
              >
                Female Thresholds
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Waist Circumference</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 90 cm"
                  value={formData.waist}
                  onChange={e => handleInputChange("waist", e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-10 font-mono focus:ring-2 focus:ring-emerald-500" 
                />
                <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">cm</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Hip Circumference</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 95 cm"
                  value={formData.hip}
                  onChange={e => handleInputChange("hip", e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-10 font-mono focus:ring-2 focus:ring-emerald-500" 
                />
                <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">cm</span>
              </div>
            </div>
          </div>
        </div>

        <button 
          type="submit"
          className="w-full py-3.5 rounded-2xl bg-indigo-700 hover:bg-indigo-800 text-white font-black text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
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
          
          <div style={{ backgroundColor: "#f0fdf4", color: "#000000" }} className="p-4 border-2 border-emerald-300 rounded-2xl text-xs leading-relaxed font-bold">
            Category classification: <span className="font-black text-slate-950">{results.category}</span>. {results.metabolicRisk}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Ideal Weight Card */}
            <div style={{ backgroundColor: "#ffffff" }} className="bento-card border-2 border-slate-300 space-y-1.5 p-6">
              <span style={{ color: "#000000" }} className="card-title font-mono font-black text-xs uppercase tracking-wider block">Clinician Healthy Target Weight Range</span>
              <div style={{ color: "#000000" }} className="text-xl font-black font-mono">
                {results.idealWeightMin} - {results.idealWeightMax} <span className="text-xs font-bold font-sans">kg</span>
              </div>
              <p style={{ color: "#000000" }} className="text-xs font-bold leading-normal">
                Weight parameters required to represent a standard compensated body index (18.5 - 24.9) at current stature limits.
              </p>
            </div>

            {/* WHR Card */}
            <div style={{ backgroundColor: "#ffffff" }} className="bento-card border-2 border-slate-300 space-y-1.5 p-6">
              <span style={{ color: "#000000" }} className="card-title font-mono font-black text-xs uppercase tracking-wider block">Waist-to-Hip Ratio (WHR)</span>
              {results.whr !== undefined ? (
                <div>
                  <div style={{ color: "#000000" }} className="text-xl font-black font-mono">
                    {results.whr}
                  </div>
                  <p style={{ color: "#000000" }} className="text-xs font-bold leading-normal">
                    {results.whrInterpretation}
                  </p>
                </div>
              ) : (
                <p style={{ color: "#000000" }} className="text-xs font-bold pt-1">Lock: Enter waist and hip values to track active abdominal lipid metrics.</p>
              )}
            </div>
          </div>

          {/* Local & AI Clinical Interpretation Panel */}
          <div style={{ backgroundColor: "#f8fafc" }} className="p-6 border-2 border-slate-300 rounded-3xl space-y-4 shadow-sm">
            <div className="flex justify-between items-center pb-2 border-b border-slate-300">
              <h4 style={{ color: "#065f46" }} className="text-sm font-black tracking-wider uppercase flex items-center gap-1.5">
                <FileText size={16} />
                <span>Clinical Diagnostics Board</span>
              </h4>
              <span className="text-[10px] bg-emerald-100 text-emerald-950 px-2.5 py-1 rounded-md font-black uppercase tracking-wider border border-emerald-300">
                Local + AI
              </span>
            </div>

            {/* Part A: Offline Rule-Based Basic Interpretation */}
            <div style={{ backgroundColor: "#ffffff" }} className="space-y-1 p-4 rounded-2xl border-2 border-slate-300 shadow-xs">
              <span style={{ color: "#065f46" }} className="text-xs uppercase font-black tracking-widest block">
                Local Basic Interpretation (Offline)
              </span>
              <p style={{ color: "#000000" }} className="text-xs leading-relaxed font-semibold mt-1 text-justify">
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
                <div style={{ backgroundColor: "#ffffff" }} className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-2xl space-y-3">
                  <p style={{ color: "#000000" }} className="text-xs text-center font-bold leading-relaxed">
                    Need an deep expert clinical review of obesity/metabolic indexes, fat deposit locations, and customized dietary and health plans with {activeProviderName}?
                  </p>
                  <button
                    type="button"
                    onClick={handleTriggerAiAnalysis}
                    disabled={isAiLoading}
                    className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-black transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={13} className={isAiLoading ? "animate-spin" : ""} />
                    <span>Interpret Using AI</span>
                  </button>
                </div>
              )}

              {isAiLoading && (
                <div style={{ backgroundColor: "#ffffff" }} className="h-28 flex flex-col items-center justify-center space-y-2 rounded-2xl border-2 border-slate-300">
                  <RefreshCw className="animate-spin text-emerald-800" size={24} />
                  <p style={{ color: "#000000" }} className="text-xs font-black">Generating expert clinical interpretation with {activeProviderName}...</p>
                </div>
              )}

              {aiError && (
                <div style={{ backgroundColor: "#fef2f2" }} className="p-4 border-2 border-red-300 rounded-2xl space-y-2">
                  <p style={{ color: "#991b1b" }} className="text-xs flex items-center gap-1.5 font-black">
                    <AlertCircle size={15} className="text-red-600" />
                    <span>{aiError}</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleTriggerAiAnalysis}
                    disabled={isAiLoading}
                    className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-black uppercase transition-colors"
                  >
                    Retry AI analysis
                  </button>
                </div>
              )}

              {aiInsight && (
                <div style={{ backgroundColor: "#ffffff" }} className="space-y-2 p-4 border-2 border-slate-300 rounded-2xl shadow-xs">
                  <span style={{ color: "#065f46" }} className="text-xs uppercase font-black tracking-widest block">
                    Clinical AI Analysis ({activeProviderName})
                  </span>
                  <div style={{ color: "#000000" }} className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed text-justify pr-2 max-h-96 overflow-y-auto font-medium">
                    {aiInsight}
                  </div>
                </div>
              )}
            </div>

            <div style={{ color: "#000000" }} className="border-t border-slate-300 pt-3 text-xs font-bold space-y-1.5 leading-relaxed">
              <p>
                <strong style={{ color: "#000000" }} className="font-black">Medical Disclaimer:</strong> Decision-support only. This information should always be analyzed alongside professional clinicians.
              </p>
              <p className="border-l-2 border-emerald-600 pl-2">
                AI-generated interpretation. Not a medical diagnosis. Consult a qualified doctor.
              </p>
            </div>
          </div>

          {/* Save panel */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 border-t border-slate-300 gap-4">
            <span style={{ color: "#000000" }} className="text-xs font-bold">Ensure values are verified before sharing or saving to logs.</span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrintPDF}
                className="px-5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-black transition-all duration-300 flex items-center gap-1.5 shadow-sm cursor-pointer"
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
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all duration-300 flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Save size={14} />
                  <span>Save to History Logs</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1 text-xs text-emerald-950 bg-emerald-100 border border-emerald-400 px-4 py-2 rounded-xl font-black">
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
