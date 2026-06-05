import React, { useState, useRef } from "react";
import { Upload, Save, Check, AlertCircle, RefreshCw, Layers, FileText, X, Plus, Trash2, Sparkles, Cpu, ShieldCheck } from "lucide-react";
import { MetabolicInputs, MetabolicResults, AnalysisRecord } from "../types";
import { calculateMetabolic } from "../utils/calculations";
import { printClinicalReport } from "../utils/printHelper";
import ScoreGauge from "./ScoreGauge";
import MetricCard from "./MetricCard";
import Tesseract from "tesseract.js";
import { preprocessImageForOcr } from "../utils/ocrPreprocessing";
import { parseMetabolicReport } from "../utils/labReportParser";
import { runGeminiAnalyze } from "../utils/geminiClient";

function getOfflineMetabolicSummary(inputs: MetabolicInputs, results: MetabolicResults): string {
  const segments: string[] = [];

  if (results.ncepMetabolicSyndrome) {
    if (results.ncepMetabolicSyndrome.met) {
      segments.push(`NCEP ATP III criteria indicates metabolic syndrome is present (${results.ncepMetabolicSyndrome.count}/5 criteria satisfied). This is associated with higher visceral risk and requires lifestyle/medical correlation.`);
    } else {
      segments.push(`NCEP ATP III criteria for Metabolic Syndrome is not met (${results.ncepMetabolicSyndrome.count}/5 criteria met).`);
    }
  }

  if (results.acrAssessment) {
    segments.push(`Urine ACR of ${results.acrAssessment.value} mg/g belongs to the '${results.acrAssessment.category}' category. ${results.acrAssessment.description} ${results.acrAssessment.clinicalSignificance}`);
  }

  return segments.join(" ");
}

interface MetabolicAnalyzerProps {
  onAddRecord: (record: Omit<AnalysisRecord, "id" | "date"> & { id?: string }) => void;
}

export default function MetabolicAnalyzer({ onAddRecord }: MetabolicAnalyzerProps) {
  const [formData, setFormData] = useState({
    gender: "male" as "male" | "female",
    age: "45",
    diabetes: false,
    fastingBloodGlucose: "",
    triglycerides: "",
    hdlCholesterol: "",
    systolicBp: "",
    diastolicBp: "",
    onHypertensionMeds: false,
    urineAcr: "",
    urineAlbumin: "",
    urineCreatinine: "",
    waistCircumference: "",
  });

  const [acrInputType, setAcrInputType] = useState<"calculate" | "direct">("calculate");
  const [results, setResults] = useState<MetabolicResults | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrStatusText, setOcrStatusText] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [isVerifiedCheck, setIsVerifiedCheck] = useState(false);

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

  // Multi-page image queue
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (key: string, value: any) => {
    setFormData(prev => {
      const next = { ...prev, [key]: value };
      if (key === "urineAlbumin" || key === "urineCreatinine") {
        const alb = parseFloat(key === "urineAlbumin" ? value : prev.urineAlbumin);
        const cr = parseFloat(key === "urineCreatinine" ? value : prev.urineCreatinine);
        if (!isNaN(alb) && !isNaN(cr) && cr > 0) {
          next.urineAcr = ((alb / cr) * 100).toFixed(1);
        } else {
          next.urineAcr = "";
        }
      }
      return next;
    });
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
    setCurrentRecordId(null);
    setIsVerifiedCheck(false);
  };

  const handleAcrTypeChange = (type: "calculate" | "direct") => {
    setAcrInputType(type);
    if (type === "calculate") {
      const alb = parseFloat(formData.urineAlbumin);
      const cr = parseFloat(formData.urineCreatinine);
      if (!isNaN(alb) && !isNaN(cr) && cr > 0) {
        setFormData(prev => ({
          ...prev,
          urineAcr: ((alb / cr) * 100).toFixed(1)
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          urineAcr: ""
        }));
      }
    }
  };

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();

    // Check if at least some metabolic parameters are provided
    const inputs: MetabolicInputs = {
      gender: formData.gender,
      age: formData.age ? parseInt(formData.age) : undefined,
      diabetes: formData.diabetes,
      fastingBloodGlucose: formData.fastingBloodGlucose ? parseFloat(formData.fastingBloodGlucose) : undefined,
      triglycerides: formData.triglycerides ? parseFloat(formData.triglycerides) : undefined,
      hdlCholesterol: formData.hdlCholesterol ? parseFloat(formData.hdlCholesterol) : undefined,
      systolicBp: formData.systolicBp ? parseFloat(formData.systolicBp) : undefined,
      diastolicBp: formData.diastolicBp ? parseFloat(formData.diastolicBp) : undefined,
      onHypertensionMeds: formData.onHypertensionMeds,
      urineAcr: formData.urineAcr ? parseFloat(formData.urineAcr) : undefined,
      waistCircumference: formData.waistCircumference ? parseFloat(formData.waistCircumference) : undefined,
    };

    const calculated = calculateMetabolic(inputs);
    setResults(calculated);
    setAiInsight(null);
    setAiError(null);
    setIsSaved(false);

    const newRecordId = "REC-" + Math.random().toString(36).substring(2, 9).toUpperCase();
    setCurrentRecordId(newRecordId);

    onAddRecord({
      id: newRecordId,
      type: "metabolic",
      title: `Metabolic & ACR Profile (${new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: formData.gender,
      patientAge: formData.age ? parseInt(formData.age) : undefined,
      inputs: inputs as any,
      results: calculated as any,
      riskLevel: calculated.riskLevel,
    });
  };

  const handleTriggerAiAnalysis = async () => {
    if (!results || !currentRecordId) return;

    setIsAiLoading(true);
    setAiError(null);

    try {
      const inputs: MetabolicInputs = {
        gender: formData.gender,
        age: formData.age ? parseInt(formData.age) : undefined,
        diabetes: formData.diabetes,
        fastingBloodGlucose: formData.fastingBloodGlucose ? parseFloat(formData.fastingBloodGlucose) : undefined,
        triglycerides: formData.triglycerides ? parseFloat(formData.triglycerides) : undefined,
        hdlCholesterol: formData.hdlCholesterol ? parseFloat(formData.hdlCholesterol) : undefined,
        systolicBp: formData.systolicBp ? parseFloat(formData.systolicBp) : undefined,
        diastolicBp: formData.diastolicBp ? parseFloat(formData.diastolicBp) : undefined,
        onHypertensionMeds: formData.onHypertensionMeds,
        urineAcr: formData.urineAcr ? parseFloat(formData.urineAcr) : undefined,
        waistCircumference: formData.waistCircumference ? parseFloat(formData.waistCircumference) : undefined,
      };

      const basePrompt = `Please evaluate the following patient data for Metabolic Syndrome and Diabetic Nephropathy Kidney Risk (Albumin to Creatinine Ratio context):

PATIENT BIOLOGICAL PROFILE:
- Name: ${patientName || "Anonymous Patient"}
- Assigned Sex: ${formData.gender === "male" ? "Male" : "Female"}
- Age: ${formData.age || "Not specified"}

METRIC REVIEWS:
- Waist Circumference: ${formData.waistCircumference ? `${formData.waistCircumference} cm` : "Not provided"}
- Fasting Blood Glucose: ${formData.fastingBloodGlucose ? `${formData.fastingBloodGlucose} mg/dL` : "Not provided"}
- Serum Triglycerides: ${formData.triglycerides ? `${formData.triglycerides} mg/dL` : "Not provided"}
- HDL Cholesterol: ${formData.hdlCholesterol ? `${formData.hdlCholesterol} mg/dL` : "Not provided"}
- Blood Pressure: ${formData.systolicBp && formData.diastolicBp ? `${formData.systolicBp}/${formData.diastolicBp} mmHg` : "Not provided"}
- On Hypertension Medications: ${formData.onHypertensionMeds ? "Yes" : "No"}
- Clinical History of Type 2 Diabetes: ${formData.diabetes ? "Yes" : "No"}
- Urine Albumin-to-Creatinine Ratio (ACR): ${formData.urineAcr ? `${formData.urineAcr} mg/g` : "Not provided"}

OFFLINE CRITERIA SYNTHESIS:
- NCEP ATP III Status: ${results.ncepMetabolicSyndrome ? results.ncepMetabolicSyndrome.conclusion : "No Metabolic parameters provided"}
- Urine ACR Risk Category: ${results.acrAssessment ? `${results.acrAssessment.category} (${results.acrAssessment.clinicalSignificance})` : "No Urine ACR provided"}
- Aggregated Visceral/Renal Risk: ${results.riskLevel.toUpperCase()}`;

      const provider = localStorage.getItem("selected_ai_provider") || "gemini";
      const data = await runGeminiAnalyze("metabolic", basePrompt, provider);

      if (data && data.insight) {
        setAiInsight(data.insight);
        
        onAddRecord({
          id: currentRecordId,
          type: "metabolic",
          title: `Metabolic & ACR Profile (${new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric" })})`,
          patientName: patientName || "Not Specified",
          patientGender: formData.gender,
          patientAge: formData.age ? parseInt(formData.age) : undefined,
          inputs: inputs as any,
          results: results as any,
          aiInsight: data.insight,
          riskLevel: results.riskLevel,
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
    if (!results || !currentRecordId) return;

    const inputs: MetabolicInputs = {
      gender: formData.gender,
      age: formData.age ? parseInt(formData.age) : undefined,
      diabetes: formData.diabetes,
      fastingBloodGlucose: formData.fastingBloodGlucose ? parseFloat(formData.fastingBloodGlucose) : undefined,
      triglycerides: formData.triglycerides ? parseFloat(formData.triglycerides) : undefined,
      hdlCholesterol: formData.hdlCholesterol ? parseFloat(formData.hdlCholesterol) : undefined,
      systolicBp: formData.systolicBp ? parseFloat(formData.systolicBp) : undefined,
      diastolicBp: formData.diastolicBp ? parseFloat(formData.diastolicBp) : undefined,
      onHypertensionMeds: formData.onHypertensionMeds,
      urineAcr: formData.urineAcr ? parseFloat(formData.urineAcr) : undefined,
      waistCircumference: formData.waistCircumference ? parseFloat(formData.waistCircumference) : undefined,
    };

    onAddRecord({
      id: currentRecordId,
      type: "metabolic",
      title: `Metabolic & ACR Profile (${new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: formData.gender,
      patientAge: formData.age ? parseInt(formData.age) : undefined,
      inputs: inputs as any,
      results: results as any,
      aiInsight: aiInsight || undefined,
      riskLevel: results.riskLevel,
    });

    setIsSaved(true);
  };

  const handlePrint = () => {
    if (!results || !currentRecordId) return;

    const inputs: MetabolicInputs = {
      gender: formData.gender,
      age: formData.age ? parseInt(formData.age) : undefined,
      diabetes: formData.diabetes,
      fastingBloodGlucose: formData.fastingBloodGlucose ? parseFloat(formData.fastingBloodGlucose) : undefined,
      triglycerides: formData.triglycerides ? parseFloat(formData.triglycerides) : undefined,
      hdlCholesterol: formData.hdlCholesterol ? parseFloat(formData.hdlCholesterol) : undefined,
      systolicBp: formData.systolicBp ? parseFloat(formData.systolicBp) : undefined,
      diastolicBp: formData.diastolicBp ? parseFloat(formData.diastolicBp) : undefined,
      onHypertensionMeds: formData.onHypertensionMeds,
      urineAcr: formData.urineAcr ? parseFloat(formData.urineAcr) : undefined,
      waistCircumference: formData.waistCircumference ? parseFloat(formData.waistCircumference) : undefined,
    };

    printClinicalReport({
      id: currentRecordId,
      type: "metabolic",
      patientName: patientName || "Not Specified",
      patientGender: formData.gender,
      patientAge: formData.age ? parseInt(formData.age) : undefined,
      inputs: inputs as any,
      results: results as any,
      aiInsight: aiInsight || undefined,
      riskLevel: results.riskLevel,
      date: new Date().toISOString(),
    });
  };

  const processFilesForOcr = async (filesToProcess: File[]) => {
    if (filesToProcess.length === 0) return;
    setIsOcrLoading(true);
    setOcrError(null);
    setOcrStatusText("Starting multi-page biological imaging scan...");

    try {
      let combinedOcrText = "";

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        setOcrStatusText(`Preprocessing and filtering report page ${i + 1} of ${filesToProcess.length}...`);
        
        const preprocessedImgSrc = await preprocessImageForOcr(file);
        
        setOcrStatusText(`Running character recognition on page ${i + 1} of ${filesToProcess.length}...`);
        
        const result = await Tesseract.recognize(
          preprocessedImgSrc,
          "eng",
          {
            logger: m => {
              if (m.status === "recognizing text") {
                setOcrStatusText(`Scanning page ${i + 1}: ${(m.progress * 100).toFixed(0)}%`);
              }
            }
          }
        );
        combinedOcrText += "\n" + result.data.text;
      }

      setOcrStatusText("Normalizing structured laboratory metrics...");
      const parsedData = parseMetabolicReport(combinedOcrText);

      setOcrStatusText("Assigning mapped biological parameters...");
      
      if (parsedData.patientName) setPatientName(parsedData.patientName);
      if (parsedData.patientGender) handleInputChange("gender", parsedData.patientGender);
      if (parsedData.patientAge) handleInputChange("age", parsedData.patientAge);

      if (parsedData.waistCircumference !== undefined) {
        handleInputChange("waistCircumference", String(parsedData.waistCircumference));
      }
      if (parsedData.fastingBloodGlucose !== undefined) {
        handleInputChange("fastingBloodGlucose", String(parsedData.fastingBloodGlucose));
      }
      if (parsedData.triglycerides !== undefined) {
        handleInputChange("triglycerides", String(parsedData.triglycerides));
      }
      if (parsedData.hdlCholesterol !== undefined) {
        handleInputChange("hdlCholesterol", String(parsedData.hdlCholesterol));
      }
      if (parsedData.systolicBp !== undefined) {
        handleInputChange("systolicBp", String(parsedData.systolicBp));
      }
      if (parsedData.diastolicBp !== undefined) {
        handleInputChange("diastolicBp", String(parsedData.diastolicBp));
      }
      if (parsedData.urineAcr !== undefined) {
        handleInputChange("urineAcr", String(parsedData.urineAcr));
      }

      setOcrStatusText(null);
    } catch (err: any) {
      setOcrError("Optical character recognition failed. Please upload a high-contrast image or input parameters manually.");
      setOcrStatusText(null);
    } finally {
      setIsOcrLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setOcrError(null);

    const files = Array.from(e.dataTransfer.files).filter((f: any) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    const newFiles = [...selectedFiles, ...files].slice(0, 3);
    setSelectedFiles(newFiles);
    processFilesForOcr(newFiles);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOcrError(null);
    if (e.target.files) {
      const files = Array.from(e.target.files).filter((f: any) => f.type.startsWith("image/"));
      const newFiles = [...selectedFiles, ...files].slice(0, 3);
      setSelectedFiles(newFiles);
      processFilesForOcr(newFiles);
    }
  };

  return (
    <div className="space-y-6" id="metabolic-analyzer-root">
      {/* OCR Multi-page Image Dropbox */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`bento-card p-8 text-center transition-all duration-300 relative overflow-hidden select-none border-2 border-dashed ${
          isDragging 
            ? "border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20" 
            : "border-slate-200 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-900/10"
        }`}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          multiple
          className="hidden" 
        />
        
        <div className="max-w-md mx-auto space-y-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mx-auto w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 dark:hover:bg-indigo-500 hover:text-white dark:hover:text-slate-950 transition-all duration-300 flex items-center justify-center cursor-pointer shadow-sm hover:shadow-indigo-500/20 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-indigo-500 select-none"
            title="Upload Report Photo"
          >
            {isOcrLoading ? (
              <RefreshCw className="animate-spin" size={24} />
            ) : (
              <Upload size={24} className="group-hover:-translate-y-0.5 transition-transform duration-300" />
            )}
          </button>
          
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isOcrLoading ? "Scanning physical report details..." : "Import Lab Report Images (up to 3 Pages)"}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Drag & drop up to 3 lab report image pages here, or{" "}
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-indigo-500 hover:text-indigo-600 font-bold underline bg-transparent border-none cursor-pointer"
              >
                browse
              </button>
            </p>
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/60 rounded-2xl p-4 text-left max-w-lg mx-auto space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-700/40">
                <span className="text-xs font-extrabold text-slate-600 dark:text-slate-400 tracking-wider">
                  UPLOADED PAGES ({selectedFiles.length}/3)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFiles([]);
                    setOcrError(null);
                  }}
                  className="text-[10px] text-red-500 dark:text-red-400 font-bold hover:underline bg-transparent border-none cursor-pointer"
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-2">
                {selectedFiles.map((file, idx) => (
                  <div 
                    key={idx} 
                    className="flex justify-between items-center bg-white dark:bg-slate-800/80 border border-slate-150 dark:border-slate-700/50 px-3 py-2 rounded-xl text-xs gap-3 shadow-sm hover:border-indigo-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate font-medium text-slate-700 dark:text-slate-300">{file.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const update = selectedFiles.filter((_, i) => i !== idx);
                        setSelectedFiles(update);
                        if (update.length > 0) processFilesForOcr(update);
                        else setOcrError(null);
                      }}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ocrStatusText && (
            <div className="max-w-xs mx-auto flex items-center justify-center gap-2 mt-4 text-[11px] text-indigo-600 dark:text-indigo-400 font-extrabold tracking-wider bg-indigo-500/5 px-2.5 py-1.5 rounded-xl border border-indigo-500/15 animate-pulse">
              <RefreshCw className="animate-spin" size={12} />
              <span>{ocrStatusText.toUpperCase()}</span>
            </div>
          )}

          {ocrError && (
            <div className="max-w-md mx-auto p-3 bg-red-500/5 border border-red-500/10 rounded-xl mt-4 flex items-start gap-2.5 text-left text-xs text-red-600 dark:text-red-400">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p className="leading-relaxed">{ocrError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Prominent Checkpoint Warning */}
      <div className="bento-card p-4 border-l-4 border-l-amber-500 bg-amber-500/5 flex items-start gap-3">
        <ShieldCheck className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-pulse" size={18} />
        <div className="space-y-1">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
            ⚠️ Verification and Safety Warning
          </p>
          <p className="text-[11px] text-slate-650 dark:text-slate-300 font-medium leading-relaxed">
            Please verify all extracted values against the original report before relying on the interpretation, as OCR may occasionally introduce errors.
          </p>
        </div>
      </div>

      {/* Input / Calculation form */}
      <form onSubmit={handleCalculate} className="bento-card p-6 space-y-6">
        <div className="border-b border-slate-100 dark:border-slate-800/40 pb-3">
          <h2 className="text-base font-extrabold text-slate-905 dark:text-white uppercase tracking-wider flex items-center gap-2 font-sans">
            <span className="w-1.5 h-4 bg-indigo-600 rounded-full shrink-0" />
            <span>Patient Demographics & Medical Profiles</span>
          </h2>
          <p className="text-xs text-slate-650 dark:text-slate-300 font-medium mt-1">
            Fill in general demographic profiles or match criteria limits dynamically.
          </p>
        </div>

        {/* Name, Gender, Age Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-650 dark:text-slate-300 tracking-wide block">Patient Name</label>
            <input 
              type="text" 
              placeholder="e.g. Suresh Kumar"
              value={patientName}
              onChange={e => {
                setPatientName(e.target.value);
                setCurrentRecordId(null);
              }}
              className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-850 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 font-medium" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-650 dark:text-slate-300 tracking-wide block">Patient Assigned Sex</label>
            <div className="flex bg-slate-50 dark:bg-slate-900/60 rounded-xl p-1 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleInputChange("gender", "male")}
                className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  formData.gender === "male"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Male
              </button>
              <button
                type="button"
                onClick={() => handleInputChange("gender", "female")}
                className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  formData.gender === "female"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Female
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-650 dark:text-slate-300 tracking-wide block">Patient Biological Age</label>
            <div className="relative">
              <input 
                type="number" 
                placeholder="45"
                value={formData.age}
                onChange={e => handleInputChange("age", e.target.value)}
                className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-850 dark:text-slate-100 pr-12 font-mono focus:ring-1 focus:ring-indigo-500 font-semibold" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-600 dark:text-slate-350">Years</span>
            </div>
          </div>
        </div>

        {/* Input Parameters - METABOLIC SYNDROME */}
        <div className="space-y-4 pt-2">
          <div className="flex justify-between items-center border-b border-slate-205 dark:border-slate-800 pb-2">
            <h3 className="text-xs font-extrabold text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-2 font-sans">
              <span className="w-1.5 h-3 bg-indigo-650 rounded-full shrink-0" />
              <span>Metabolic Syndrome (NCEP ATP III Criteria) Panels</span>
            </h3>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-808 dark:text-slate-105 px-2.5 py-0.5 rounded font-extrabold uppercase tracking-widest">
              Standard Indian Lab Units
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-650 dark:text-slate-300 tracking-wide">Waist Circumference</label>
                <span className="text-[9px] text-indigo-500 font-bold uppercase">{formData.gender === "female" ? "≤ 88 cm target" : "≤ 102 cm target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder={formData.gender === "female" ? "e.g. 85" : "e.g. 95"}
                  value={formData.waistCircumference}
                  onChange={e => handleInputChange("waistCircumference", e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:ring-1 focus:ring-indigo-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-600 dark:text-slate-350">cm</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-650 dark:text-slate-300 tracking-wide">Fasting Blood Glucose</label>
                <span className="text-[9px] text-indigo-500 font-bold uppercase">{"< 100 mg/dL target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 95"
                  value={formData.fastingBloodGlucose}
                  onChange={e => handleInputChange("fastingBloodGlucose", e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:ring-1 focus:ring-indigo-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-600 dark:text-slate-350">mg/dL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-650 dark:text-slate-300 tracking-wide">Serum Triglycerides</label>
                <span className="text-[9px] text-indigo-500 font-bold uppercase">{"< 150 mg/dL target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 140"
                  value={formData.triglycerides}
                  onChange={e => handleInputChange("triglycerides", e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:ring-1 focus:ring-indigo-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-600 dark:text-slate-350">mg/dL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-650 dark:text-slate-300 tracking-wide">HDL Cholesterol</label>
                <span className="text-[9px] text-indigo-500 font-bold uppercase">{formData.gender === "female" ? "≥ 50 mg/dL target" : "≥ 40 mg/dL target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 45"
                  value={formData.hdlCholesterol}
                  onChange={e => handleInputChange("hdlCholesterol", e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:ring-1 focus:ring-indigo-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-600 dark:text-slate-350">mg/dL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-650 dark:text-slate-300 tracking-wide">Systolic Blood Pressure</label>
                <span className="text-[9px] text-indigo-500 font-bold uppercase">{"< 130 mmHg target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 120"
                  value={formData.systolicBp}
                  onChange={e => handleInputChange("systolicBp", e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-16 font-mono focus:ring-1 focus:ring-indigo-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-600 dark:text-slate-350">mmHg</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-650 dark:text-slate-300 tracking-wide">Diastolic Blood Pressure</label>
                <span className="text-[9px] text-indigo-500 font-bold uppercase">{"< 85 mmHg target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 80"
                  value={formData.diastolicBp}
                  onChange={e => handleInputChange("diastolicBp", e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-16 font-mono focus:ring-1 focus:ring-indigo-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-600 dark:text-slate-350">mmHg</span>
              </div>
            </div>
          </div>

          {/* Quick toggle medication status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 cursor-pointer select-none transition-colors hover:bg-slate-100/40">
              <input
                type="checkbox"
                checked={formData.onHypertensionMeds}
                onChange={e => handleInputChange("onHypertensionMeds", e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
              />
              <div className="text-left">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">Antihypertensive Treatment</span>
                <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">Mark if patient is on antihypertensive medications</span>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 cursor-pointer select-none transition-colors hover:bg-slate-100/40">
              <input
                type="checkbox"
                checked={formData.diabetes}
                onChange={e => handleInputChange("diabetes", e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
              />
              <div className="text-left">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">Type 2 Diabetes Staging</span>
                <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">Mark if patient has a clinical history of Type 2 Diabetes</span>
              </div>
            </label>
          </div>
        </div>

        {/* Albumin to Creatinine Ratio */}
        <div className="space-y-4 pt-2">
          <div className="flex justify-between items-center border-b border-slate-205 dark:border-slate-800 pb-2">
            <h3 className="text-xs font-extrabold text-slate-955 dark:text-white uppercase tracking-wider flex items-center gap-2 font-sans">
              <span className="w-1.5 h-3 bg-indigo-650 rounded-full shrink-0" />
              <span>Urine Albumin-to-Creatinine Ratio (Urine ACR)</span>
            </h3>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-805 dark:text-slate-105 px-2.5 py-0.5 rounded font-extrabold uppercase tracking-widest">
              Standard Kidney marker
            </span>
          </div>

          {/* Toggle for Direct input vs calculation */}
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900/75 rounded-xl border border-slate-200 dark:border-slate-800 max-w-sm">
            <button
              type="button"
              onClick={() => handleAcrTypeChange("calculate")}
              className={`flex-1 py-1 px-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                acrInputType === "calculate"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-850 dark:text-slate-305 dark:hover:text-slate-100"
              }`}
            >
              Calculate with Albumin & Creatinine
            </button>
            <button
              type="button"
              onClick={() => handleAcrTypeChange("direct")}
              className={`flex-1 py-1 px-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                acrInputType === "direct"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-850 dark:text-slate-305 dark:hover:text-slate-100"
              }`}
            >
              Direct ACR Input
            </button>
          </div>

          {acrInputType === "calculate" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tracking-wide">Urine Albumin</label>
                    <span className="text-[9px] text-indigo-500 font-bold uppercase">mg/L</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="any"
                      placeholder="e.g. 30"
                      value={formData.urineAlbumin}
                      onChange={e => handleInputChange("urineAlbumin", e.target.value)}
                      className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-16 font-mono focus:ring-1 focus:ring-indigo-500 font-bold placeholder-slate-405 dark:placeholder-slate-500" 
                    />
                    <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-700 dark:text-slate-300">mg/L</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tracking-wide">Urine Creatinine</label>
                    <span className="text-[9px] text-indigo-500 font-bold uppercase">mg/dL</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="any"
                      placeholder="e.g. 100"
                      value={formData.urineCreatinine}
                      onChange={e => handleInputChange("urineCreatinine", e.target.value)}
                      className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-16 font-mono focus:ring-1 focus:ring-indigo-500 font-bold placeholder-slate-405 dark:placeholder-slate-500" 
                    />
                    <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-700 dark:text-slate-300">mg/dL</span>
                  </div>
                </div>
              </div>

              {/* Live result displayed underneath */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/85 rounded-xl space-y-2 mt-2">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <span className="text-[11px] font-bold text-slate-850 dark:text-slate-100 uppercase tracking-wider">Urinary ACR Formula Reference</span>
                  <span className="text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400 font-mono">ACR (mg/g) = (Albumin [mg/L] / Creatinine [mg/dL]) * 100</span>
                </div>
                
                <div className="flex justify-between items-baseline pt-1">
                  <span className="text-xs font-bold text-slate-850 dark:text-slate-100">Calculated Urinary ACR:</span>
                  <div className="text-right">
                    {formData.urineAcr ? (
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-indigo-600 dark:text-indigo-400 font-mono">
                          {formData.urineAcr} <span className="text-xs font-bold">mg/g</span>
                        </span>
                        {(() => {
                          const val = parseFloat(formData.urineAcr);
                          if (isNaN(val)) return null;
                          if (val < 30) {
                            return <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 uppercase tracking-widest border border-emerald-500/15">Normal</span>;
                          } else if (val <= 300) {
                            return <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 uppercase tracking-widest border border-amber-500/15">Microalbuminuria</span>;
                          } else {
                            return <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-red-400/10 text-red-500 dark:text-red-400 uppercase tracking-widest border border-red-500/15">Macroalbuminuria</span>;
                          }
                        })()}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 italic font-semibold">Enter Urine Albumin and Urine Creatinine parameters above</span>
                    )}
                  </div>
                </div>
                {formData.urineAcr && (
                  <p className="text-[11px] text-slate-850 dark:text-slate-105 font-bold leading-relaxed border-t border-slate-200 dark:border-slate-800 pt-2 mt-1">
                    {(() => {
                      const val = parseFloat(formData.urineAcr);
                      if (val < 30) return "Normal / Optimal kidney status. Albumin excretion level is within normal limits.";
                      if (val <= 300) return "Moderately increased albumin excretion (Microalbuminuria), indicating early stage diabetic nephropathy or systemic cardiovascular risk.";
                      return "Severely increased albumin excretion (Macroalbuminuria), suggesting advanced clinical renal involvement and diabetic nephropathy risk.";
                    })()}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-md space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tracking-wide block">Urine ACR</label>
                <span className="text-[9px] text-indigo-500 font-bold uppercase font-mono">{"< 30 mg/g normal excretion target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 25"
                  value={formData.urineAcr}
                  onChange={e => handleInputChange("urineAcr", e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-16 font-mono focus:ring-1 focus:ring-indigo-500 font-bold placeholder-slate-405 dark:placeholder-slate-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-700 dark:text-slate-300">mg/g</span>
              </div>
              <p className="text-[11px] text-slate-800 dark:text-slate-100 leading-normal font-semibold pt-1">
                Used as a primary screening parameter for diabetic nephropathy and systemic cardiovascular vulnerabilities.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all duration-300 hover:scale-[1.01] active:scale-95 shadow-md shadow-indigo-600/10 cursor-pointer flex items-center gap-1.5"
          >
            <Cpu size={14} className="mt-[-1px]" />
            <span>Process Diagnostic Calculations</span>
          </button>
        </div>
      </form>

      {/* Results View */}
      {results && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header Actions */}
          <div className="flex justify-between items-center border-b border-slate-150 dark:border-slate-800/60 pb-3 flex-wrap gap-3">
            <div>
              <h2 className="text-base font-black text-slate-955 dark:text-white uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-4.5 bg-indigo-650 rounded-full shrink-0" />
                <span>Diagnostic Report Outcomes</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 uppercase tracking-widest font-extrabold border border-indigo-500/15">
                  {results.riskLevel} risk
                </span>
              </h2>
              <p className="text-xs text-slate-650 dark:text-slate-300 font-medium">Computed patient parameters and multi-panel kidney/cardiovascular assessments.</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="px-4 py-1.5 border border-slate-250 dark:border-slate-800 text-slate-605 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-900 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              >
                <FileText size={13} />
                <span>Print clinical Report</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaved}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  isSaved 
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                    : "bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-[1.02] active:scale-[0.98]"
                }`}
              >
                {isSaved ? <Check size={13} /> : <Save size={13} />}
                <span>{isSaved ? "Saved to History" : "Save Record"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Risk Gauge */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-905 border border-slate-150 dark:border-slate-850/80 rounded-3xl min-h-[290px] relative">
              <div className="absolute top-4 left-4">
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-755 dark:text-slate-200 px-2 py-0.5 rounded font-extrabold uppercase tracking-widest">
                  Aggregated Risk
                </span>
              </div>
              <ScoreGauge score={results.riskLevel === "high" ? 85 : results.riskLevel === "moderate" ? 45 : 15} maxScore={100} label="Patient Risk Scale" riskLevel={results.riskLevel || "low"} />
              <div className="text-center mt-3">
                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-widest">Composite Patient Status</h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium max-w-[200px] leading-relaxed mx-auto mt-1">Based on aggregated visceral criteria (NCEP ATP III) and diabetic nephropathy risk.</p>
              </div>
            </div>

            {/* Assessment Cards */}
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Card A: Metabolic Syndrome Card */}
              {results.ncepMetabolicSyndrome ? (
                <div className="bento-card p-5 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded font-bold uppercase tracking-widest block max-w-fit">
                          NCEP ATP III Criteria
                        </span>
                        <h4 className="text-sm font-black text-slate-950 dark:text-white mt-2 flex items-center gap-1.5 font-sans">
                          <span className="w-1 h-3 bg-indigo-650 rounded-full shrink-0" />
                          <span>Visceral Core Parameters</span>
                        </h4>
                      </div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Score: <strong className="text-indigo-600 dark:text-indigo-450">{results.ncepMetabolicSyndrome.count} / 5</strong></span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="text-xs font-extrabold text-slate-750 dark:text-slate-250 flex items-center gap-1">
                        <Check size={12} className={results.ncepMetabolicSyndrome.met ? "text-red-500" : "text-emerald-500"} />
                        <span>{results.ncepMetabolicSyndrome.conclusion}</span>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-850/40 space-y-1.5">
                        {results.ncepMetabolicSyndrome.criteriaMet.length > 0 && (
                          <div>
                            <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider block">Satisfied Risks:</span>
                            <ul className="list-disc pl-3 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-semibold">
                              {results.ncepMetabolicSyndrome.criteriaMet.map((c: string, idx: number) => (
                                <li key={idx}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {results.ncepMetabolicSyndrome.criteriaNotMet.length > 0 && (
                          <div>
                            <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider block">Not Satisfied Risks:</span>
                            <ul className="list-disc pl-3 text-[11px] text-slate-650 dark:text-slate-350 leading-relaxed font-semibold">
                              {results.ncepMetabolicSyndrome.criteriaNotMet.map((c: string, idx: number) => (
                                <li key={idx}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bento-card p-5 flex items-center justify-center text-center text-slate-600 dark:text-slate-350 font-medium text-xs">
                  No Metabolic Syndrome Parameters Provided.
                </div>
              )}

              {/* Card B: Kidney Risk Albumin to Creatinine Ratio Assessment Card */}
              {results.acrAssessment ? (
                <div className="bento-card p-5 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded font-bold uppercase tracking-widest block max-w-fit">
                          Kidney Risk Assessment
                        </span>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-2">Urine Albumin-to-Creatinine</h4>
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">Val: <strong className="text-indigo-600 dark:text-indigo-450">{results.acrAssessment.value} mg/g</strong></span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest block">Urine ACR Category</span>
                        <span className="text-xs font-extrabold text-slate-750 dark:text-slate-200 leading-normal">{results.acrAssessment.category.toUpperCase()}</span>
                      </div>
                      
                      <p className="text-[11px] text-slate-650 dark:text-slate-300 leading-normal font-medium">{results.acrAssessment.description}</p>
                      
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-850/40">
                        <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest block">Clinical Correlation</span>
                        <p className="text-[11px] text-slate-700 dark:text-slate-250 font-semibold leading-relaxed text-justify mt-1">{results.acrAssessment.clinicalSignificance}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bento-card p-5 flex items-center justify-center text-center text-slate-600 dark:text-slate-350 font-medium text-xs">
                  No Urine ACR Parameter Provided.
                </div>
              )}
            </div>
          </div>

          {/* Clinical Insights Panel (Local & AI) */}
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

            {/* Offline Summary */}
            <div className="space-y-1 bg-slate-950/40 p-4 rounded-2xl border border-slate-850/60">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#22c55e]">
                Local Basic Interpretation (Offline)
              </span>
              <p className="text-xs text-slate-200 leading-relaxed font-semibold mt-1 text-justify">
                {getOfflineMetabolicSummary({
                  gender: formData.gender,
                  age: formData.age ? parseInt(formData.age) : undefined,
                  diabetes: formData.diabetes,
                  fastingBloodGlucose: formData.fastingBloodGlucose ? parseFloat(formData.fastingBloodGlucose) : undefined,
                  triglycerides: formData.triglycerides ? parseFloat(formData.triglycerides) : undefined,
                  hdlCholesterol: formData.hdlCholesterol ? parseFloat(formData.hdlCholesterol) : undefined,
                  systolicBp: formData.systolicBp ? parseFloat(formData.systolicBp) : undefined,
                  diastolicBp: formData.diastolicBp ? parseFloat(formData.diastolicBp) : undefined,
                  onHypertensionMeds: formData.onHypertensionMeds,
                  urineAcr: formData.urineAcr ? parseFloat(formData.urineAcr) : undefined,
                  waistCircumference: formData.waistCircumference ? parseFloat(formData.waistCircumference) : undefined,
                }, results)}
              </p>
            </div>

            {/* Dynamic AI Prompter */}
            <div className="space-y-3 pt-1">
              {!aiInsight && !isAiLoading && !aiError && (
                <div className="relative flex flex-col items-center justify-center p-5 bg-slate-950/20 border border-dashed border-slate-800 rounded-2xl space-y-4">
                  <p className="text-[11px] text-slate-300 text-center font-medium leading-relaxed">
                    Need a deep expert clinical review of potential visceral anomalies, hypertension patterns, or full microalbuminuria and cardiovascular trends with {activeProviderName}?
                  </p>
                  
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 cursor-pointer select-none max-w-sm text-left transition-colors hover:bg-slate-950/60">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="meta-verification-checkbox"
                      className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer bg-slate-950 border-slate-800 w-4 h-4 shrink-0"
                    />
                    <span className="text-[11px] text-slate-300 leading-normal font-medium animate-pulse">
                      I have verified the extracted values against the original report
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleTriggerAiAnalysis}
                    disabled={isAiLoading || !isVerifiedCheck}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
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
                <div className="p-4 bg-red-950/30 border border-red-900/40 rounded-2xl space-y-3">
                  <p className="text-xs text-red-400 flex items-center gap-1.5 font-bold">
                    <AlertCircle size={14} />
                    <span>{aiError}</span>
                  </p>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 cursor-pointer select-none max-w-sm text-left transition-colors hover:bg-slate-950/60">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="meta-verification-retry-checkbox"
                      className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer bg-slate-950 border-slate-800 w-4 h-4 shrink-0"
                    />
                    <span className="text-[11px] text-slate-300 leading-normal font-medium">
                      I have verified the extracted values against the original report
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleTriggerAiAnalysis}
                    disabled={isAiLoading || !isVerifiedCheck}
                    className="px-4 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-300 border border-red-800/40 rounded-lg text-[10px] font-bold uppercase transition-colors"
                  >
                    Retry AI analysis
                  </button>
                </div>
              )}

              {aiInsight && (
                <div className="space-y-2 p-4 bg-slate-950/30 border border-slate-850/40 rounded-2xl animate-fadeIn">
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
                * AI insights are dynamically fetched from the chosen medical model. This analysis incorporates patient parameters like systolic/diastolic blood pressure, microalbuminuria, lipid/triglyceride ratios, and historical clinical data recursively.
              </p>
              <p className="text-slate-400 font-bold border-l-2 border-l-amber-500 pl-2">
                Disclaimer: AI-generated interpretations and evaluations of Metabolic Syndrome and diabetic kidney risk parameters are provided solely for educational and diagnostic-support purposes. They must be correlated clinically by a licensed physician and do not replace professional medical consultations.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
