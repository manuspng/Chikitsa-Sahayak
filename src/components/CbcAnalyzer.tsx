import React, { useState, useRef } from "react";
import { Upload, Save, Check, AlertCircle, RefreshCw, Layers, FileText, X, Plus, Trash2, Sparkles, Cpu } from "lucide-react";
import { CBCInputs, CBCResults, AnalysisRecord } from "../types";
import { calculateCBC } from "../utils/calculations";
import { printClinicalReport } from "../utils/printHelper";
import ScoreGauge from "./ScoreGauge";
import MetricCard from "./MetricCard";
import Tesseract from "tesseract.js";
import { preprocessImageForOcr } from "../utils/ocrPreprocessing";
import { parseCbcReport } from "../utils/labReportParser";
import { runGeminiAnalyze, runGeminiExtractReport } from "../utils/geminiClient";

function getOfflineCbcSummary(inputs: CBCInputs, results: CBCResults): string {
  if (results.abnormalCount === 0) {
    return "Normal CBC profile. All core blood counts are within standard reference ranges. No active hematological, immunological or platelet flags detected.";
  }
  
  const segments: string[] = [];
  if (results.hemoglobinStatus.startsWith("Low") || (inputs.hemoglobin < (inputs.gender === "male" ? 13.5 : 12.0))) {
    if (results.anemiaType?.toLowerCase().includes("microcytic")) {
      segments.push("Mild microcytic anemia pattern. Lower hemoglobin and decreased cell volume size suggests potential iron deficiency or hemoglobin synthesis profile.");
    } else if (results.anemiaType?.toLowerCase().includes("macrocytic")) {
      segments.push("Mild macrocytic anemia pattern. Lower hemoglobin with elevated cell sizes suggesting Vitamin B12 or folate level evaluation.");
    } else {
      segments.push("Mild normocytic anemia pattern. Normal cell size but reduced hemoglobin levels, sometimes seen in general systemic inflammatory status.");
    }
  } else if (results.hemoglobinStatus.startsWith("High")) {
    segments.push("Polycythemia pattern. Elevated hemoglobin density which can suggest dehydration status or erythropoietin upregulation.");
  }

  if (results.wbcStatus.startsWith("High") || inputs.wbc > 11.0) {
    segments.push("Leukocytosis suggestive of active infection/inflammation profile. Increased white cells alert the immune system reactivity.");
  } else if (results.wbcStatus.startsWith("Low") || inputs.wbc < 4.5) {
    segments.push("Leukopenia pattern. Reduced white cells suggest potential immune vulnerability.");
  }

  if (results.plateletStatus.startsWith("Low") || results.plateletStatus.includes("Critical") || inputs.platelets < 150) {
    segments.push(inputs.platelets < 55 ? "Critical thrombocytopenia pattern warning (increased systemic bleeding limits)." : "Thrombocytopenia profile noted. Lower platelets suggests potential clearance stress, sequestering, or diminished platelet production.");
  } else if (results.plateletStatus.startsWith("High") || inputs.platelets > 450) {
    segments.push("Thrombocytosis pattern (reactive platelet elevation suggestions).");
  }

  if (results.nlratio !== undefined && results.nlratio > 3.0) {
    segments.push(`NLR ratio of ${results.nlratio} suggests active systemic stress response.`);
  }

  return segments.join(" ") || "Normal CBC profile. All indices balanced.";
}

interface CbcAnalyzerProps {
  onAddRecord: (record: Omit<AnalysisRecord, "id" | "date"> & { id?: string }) => void;
}

export default function CbcAnalyzer({ onAddRecord }: CbcAnalyzerProps) {
  const [formData, setFormData] = useState({
    hemoglobin: "",
    hematocrit: "",
    rbc: "",
    wbc: "",
    platelets: "",
    mcv: "",
    mch: "",
    mchc: "",
    neutrophils: "",
    lymphocytes: "",
    monocytes: "",
    eosinophils: "",
    basophils: "",
    gender: "male" as "male" | "female",
  });

  const [results, setResults] = useState<CBCResults | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiErrorStack, setAiErrorStack] = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrErrorStack, setOcrErrorStack] = useState<string | null>(null);
  const [ocrStatusText, setOcrStatusText] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("45");
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

  // Drag & drop
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (key: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
    setCurrentRecordId(null);
    setIsVerifiedCheck(false);
  };

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.hemoglobin || !formData.hematocrit || !formData.rbc || !formData.wbc || !formData.platelets || !formData.mcv || !formData.mch || !formData.mchc) {
      alert("Missing core blood indicators – Hemoglobin, Hematocrit, RBC, WBC, Platelets, MCV, MCH, and MCHC are required.");
      return;
    }

    const inputs: CBCInputs = {
      hemoglobin: parseFloat(formData.hemoglobin),
      hematocrit: parseFloat(formData.hematocrit),
      rbc: parseFloat(formData.rbc),
      wbc: parseFloat(formData.wbc),
      platelets: parseFloat(formData.platelets),
      mcv: parseFloat(formData.mcv),
      mch: parseFloat(formData.mch),
      mchc: parseFloat(formData.mchc),
      neutrophils: formData.neutrophils ? parseFloat(formData.neutrophils) : undefined,
      lymphocytes: formData.lymphocytes ? parseFloat(formData.lymphocytes) : undefined,
      monocytes: formData.monocytes ? parseFloat(formData.monocytes) : undefined,
      eosinophils: formData.eosinophils ? parseFloat(formData.eosinophils) : undefined,
      basophils: formData.basophils ? parseFloat(formData.basophils) : undefined,
      gender: formData.gender,
    };

    const calculated = calculateCBC(inputs);
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
      type: "cbc",
      title: `CBC Screening (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: formData.gender,
      patientAge: patientAge ? parseInt(patientAge) : undefined,
      inputs: {
        ...inputs,
        offset: 0,
      } as any,
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

    const inputs: CBCInputs = {
      hemoglobin: parseFloat(formData.hemoglobin),
      hematocrit: parseFloat(formData.hematocrit),
      rbc: parseFloat(formData.rbc),
      wbc: parseFloat(formData.wbc),
      platelets: parseFloat(formData.platelets),
      mcv: parseFloat(formData.mcv),
      mch: parseFloat(formData.mch),
      mchc: parseFloat(formData.mchc),
      neutrophils: formData.neutrophils ? parseFloat(formData.neutrophils) : undefined,
      lymphocytes: formData.lymphocytes ? parseFloat(formData.lymphocytes) : undefined,
      monocytes: formData.monocytes ? parseFloat(formData.monocytes) : undefined,
      eosinophils: formData.eosinophils ? parseFloat(formData.eosinophils) : undefined,
      basophils: formData.basophils ? parseFloat(formData.basophils) : undefined,
      gender: formData.gender,
    };

    requestAiInsight(inputs, results, currentRecordId);
  };

  const requestAiInsight = async (inputs: CBCInputs, calculated: CBCResults, recordId: string) => {
    setIsAiLoading(true);
    setAiError(null);
    setAiErrorStack(null);

    try {
      const prompt = `Interpret the following Patient Complete Blood Count (CBC) results:
- Hemoglobin: ${inputs.hemoglobin} g/dL (Reference: Male: 13.5-17.5, Female: 12.0-15.5)
- Hematocrit: ${inputs.hematocrit}% (Reference: Male: 38.3-48.6%, Female: 35.5-44.9%)
- RBC Count: ${inputs.rbc} x10^12/L (Reference: Male: 4.3-5.9, Female: 3.8-5.2)
- WBC Count: ${inputs.wbc} = ${calculated.wbcStatus} (Reference: 4.5-11.0)
- Platelets: ${inputs.platelets} = ${calculated.plateletStatus} (Reference: 150-400)
- MCV: ${inputs.mcv} fL (Reference: 80-100)
- MCH: ${inputs.mch} pg (Reference: 27-33)
- MCHC: ${inputs.mchc} g/dL (Reference: 32-36)
- Neutrophils: ${inputs.neutrophils ?? "N/A"}%
- Lymphocytes: ${inputs.lymphocytes ?? "N/A"}%
- Patient Gender: ${inputs.gender}

Calculated Markers:
- Hemoglobin State: ${calculated.hemoglobinStatus} ${calculated.anemiaType ? `(${calculated.anemiaType})` : ""}
- Platelet Condition: ${calculated.plateletStatus}
- WBC & Infection Context: ${calculated.infectionRisk}
- Neutrophil-to-Lymphocyte Ratio (NLR): ${calculated.nlratio ?? "N/A"} (${calculated.nlratioInterpretation ?? "N/A"})
- Out-of-Range Anomalies: ${calculated.abnormalCount}

Please write an expert, professional clinical interpretation of these results. Mention the implications for hepatic portal hypertension (if platelets are significantly low), iron or nutrient profiles, systemic inflammation flags, or any other findings.`;

      const provider = localStorage.getItem("selected_ai_provider") || "gemini";
      const data = await runGeminiAnalyze("cbc", prompt, provider);

      if (data && data.insight) {
        setAiInsight(data.insight);
        
        // Dynamically update the newly generated record inside history to reflect current AiInsight
        onAddRecord({
          id: recordId,
          type: "cbc",
          title: `CBC Screening (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
          patientName: patientName || "Not Specified",
          patientGender: formData.gender,
          patientAge: patientAge ? parseInt(patientAge) : undefined,
          inputs: {
            ...inputs,
            offset: 0,
          } as any,
          results: calculated,
          aiInsight: data.insight,
          riskLevel: calculated.riskLevel,
        });
      } else {
        setAiError("Failed to generate Clinical AI Analysis");
      }
    } catch (err: any) {
      console.error("AI Analysis critical failure:", err);
      setAiError(err.message || "Connection to AI engine failed. Please try again.");
      setAiErrorStack(err.stack || "No call stack available.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSave = () => {
    if (!results) return;

    onAddRecord({
      id: currentRecordId || undefined,
      type: "cbc",
      title: `CBC Screening (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: formData.gender,
      patientAge: patientAge ? parseInt(patientAge) : undefined,
      inputs: {
        hemoglobin: parseFloat(formData.hemoglobin),
        offset: 0,
        hematocrit: parseFloat(formData.hematocrit),
        rbc: parseFloat(formData.rbc),
        wbc: parseFloat(formData.wbc),
        platelets: parseFloat(formData.platelets),
        mcv: parseFloat(formData.mcv),
        mch: parseFloat(formData.mch),
        mchc: parseFloat(formData.mchc),
        neutrophils: formData.neutrophils ? parseFloat(formData.neutrophils) : undefined,
        lymphocytes: formData.lymphocytes ? parseFloat(formData.lymphocytes) : undefined,
        monocytes: formData.monocytes ? parseFloat(formData.monocytes) : undefined,
        eosinophils: formData.eosinophils ? parseFloat(formData.eosinophils) : undefined,
        basophils: formData.basophils ? parseFloat(formData.basophils) : undefined,
        gender: formData.gender,
      } as any,
      results,
      aiInsight: aiInsight || undefined,
      riskLevel: results.riskLevel,
    });
    setIsSaved(true);
  };

  const handlePrintPDF = () => {
    if (!results) return;
    printClinicalReport({
      type: "cbc",
      title: `CBC Screening (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: formData.gender,
      patientAge: patientAge ? parseInt(patientAge) : undefined,
      inputs: {
        hemoglobin: parseFloat(formData.hemoglobin),
        hematocrit: parseFloat(formData.hematocrit),
        rbc: parseFloat(formData.rbc),
        wbc: parseFloat(formData.wbc),
        platelets: parseFloat(formData.platelets),
        mcv: parseFloat(formData.mcv),
        mch: parseFloat(formData.mch),
        mchc: parseFloat(formData.mchc),
        neutrophils: formData.neutrophils ? parseFloat(formData.neutrophils) : undefined,
        lymphocytes: formData.lymphocytes ? parseFloat(formData.lymphocytes) : undefined,
        monocytes: formData.monocytes ? parseFloat(formData.monocytes) : undefined,
        eosinophils: formData.eosinophils ? parseFloat(formData.eosinophils) : undefined,
        basophils: formData.basophils ? parseFloat(formData.basophils) : undefined,
        gender: formData.gender,
      },
      results,
      aiInsight: aiInsight || undefined,
      riskLevel: results.riskLevel,
    });
  };

  const applyCbcOcrValues = (vals: any) => {
    if (vals.patientName) {
      setPatientName(vals.patientName);
    }
    if (vals.patientGender) {
      handleInputChange("gender", vals.patientGender);
    }
    if (vals.patientAge) {
      setPatientAge(vals.patientAge);
    }
    setFormData(prev => ({
      ...prev,
      hemoglobin: vals["Hemoglobin"] !== undefined ? String(vals["Hemoglobin"]) : prev.hemoglobin,
      hematocrit: vals["Hematocrit"] !== undefined ? String(vals["Hematocrit"]) : prev.hematocrit,
      rbc: vals["RBC"] !== undefined ? String(vals["RBC"]) : prev.rbc,
      wbc: vals["WBC"] !== undefined ? String(vals["WBC"]) : prev.wbc,
      platelets: vals["Platelets"] !== undefined ? String(vals["Platelets"]) : prev.platelets,
      mcv: vals["MCV"] !== undefined ? String(vals["MCV"]) : prev.mcv,
      mch: vals["MCH"] !== undefined ? String(vals["MCH"]) : prev.mch,
      mchc: vals["MCHC"] !== undefined ? String(vals["MCHC"]) : prev.mchc,
      neutrophils: vals["Neutrophils"] !== undefined ? String(vals["Neutrophils"]) : prev.neutrophils,
      lymphocytes: vals["Lymphocytes"] !== undefined ? String(vals["Lymphocytes"]) : prev.lymphocytes,
    }));
    setIsSaved(false);
    setResults(null);
    setIsVerifiedCheck(false);
  };

  const runOcrExtract = async (filesList: File[], mode: "offline" | "ai" = "offline") => {
    if (filesList.length === 0) {
      setSelectedFiles([]);
      return;
    }

    setIsOcrLoading(true);
    setOcrError(null);
    setOcrErrorStack(null);
    setOcrStatusText(mode === "offline" ? "Preprocessing images..." : "Reading files for transmission...");

    try {
      if (mode === "offline") {
        // 1. Preprocess images locally
        const preprocessedUrls = await Promise.all(
          filesList.map(file => preprocessImageForOcr(file))
        );

        // 2. Perform local, offline OCR using Tesseract.js
        let aggregatedText = "";
        let index = 0;
        for (const dataUrl of preprocessedUrls) {
          index++;
          setOcrStatusText(`Page ${index}/${preprocessedUrls.length}: Starting analyzer...`);
          const ocrResult = await Tesseract.recognize(dataUrl, "eng", {
            logger: m => {
              if (m.status === "recognizing text") {
                const pct = Math.round(m.progress * 100);
                setOcrStatusText(`Page ${index}/${preprocessedUrls.length}: Analyzing text (${pct}%)`);
              } else if (m.status) {
                setOcrStatusText(`Page ${index}/${preprocessedUrls.length}: ${m.status}...`);
              }
            }
          });
          aggregatedText += "\n" + (ocrResult.data?.text || "");
        }

        // 3. Extract parameters locally
        setOcrStatusText("Parsing clinical fields offline...");
        const extracted = parseCbcReport(aggregatedText);

        // Simple validation: check if we found anything at all
        const foundValues = Object.keys(extracted).filter(k => k !== "patientName" && k !== "patientGender" && k !== "patientAge");
        if (foundValues.length === 0 && !extracted.patientName) {
          throw new Error("Unable to identify clinical metrics locally. Try adjusting threshold/contrast or use 'AI to Extract' for advanced recognition.");
        }

        // Apply values
        applyCbcOcrValues(extracted);
      } else {
        // AI extraction mode
        setOcrStatusText("Encoding images to base64...");
        const base64Promises = filesList.map(file => {
          return new Promise<{ base64: string, mimeType: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const resultStr = reader.result as string;
              const base64Content = resultStr.split(",")[1];
              resolve({ base64: base64Content, mimeType: file.type || "image/jpeg" });
            };
            reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
            reader.readAsDataURL(file);
          });
        });

        const base64Contents = await Promise.all(base64Promises);

        setOcrStatusText("Sending to Clinical AI Extractor...");
        const data = await runGeminiExtractReport(base64Contents, "cbc");
        
        if (data && data.values) {
          applyCbcOcrValues(data.values);
        } else {
          throw new Error("The AI model was unable to extract report fields. Please verify image quality.");
        }
      }
    } catch (err: any) {
      console.error(`${mode.toUpperCase()} extraction error:`, err);
      setOcrError(err.message || `An error occurred during ${mode} report extraction.`);
      setOcrErrorStack(err.stack || "No call stack available.");
    } finally {
      setIsOcrLoading(false);
      setOcrStatusText(null);
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
    const files = e.dataTransfer.files;
    const newFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith("image/")) {
        newFiles.push(files[i]);
      }
    }
    
    if (newFiles.length > 0) {
      setSelectedFiles(prev => {
        const combined = [...prev, ...newFiles].slice(0, 3);
        runOcrExtract(combined);
        return combined;
      });
    } else {
      setOcrError("Invalid file type. Please upload valid report image(s).");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith("image/")) {
          newFiles.push(files[i]);
        }
      }
      setSelectedFiles(prev => {
        const combined = [...prev, ...newFiles].slice(0, 3);
        runOcrExtract(combined);
        return combined;
      });
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length > 0) {
        runOcrExtract(updated);
      } else {
        setIsOcrLoading(false);
        setOcrError(null);
      }
      return updated;
    });
  };

  const handlePopulateSample = () => {
    setFormData({
      hemoglobin: "11.2",
      hematocrit: "34.5",
      rbc: "3.7",
      wbc: "11.4",
      platelets: "135", // Portal hypertension mild thrombocytopenia
      mcv: "78", // microcytic anemia hint
      mch: "25",
      mchc: "31",
      neutrophils: "72",
      lymphocytes: "18",
      monocytes: "7",
      eosinophils: "2",
      basophils: "1",
      gender: "female",
    });
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
  };

  const handleClearAllInputs = () => {
    setFormData({
      hemoglobin: "",
      hematocrit: "",
      rbc: "",
      wbc: "",
      platelets: "",
      mcv: "",
      mch: "",
      mchc: "",
      neutrophils: "",
      lymphocytes: "",
      monocytes: "",
      eosinophils: "",
      basophils: "",
      gender: "male",
    });
    setPatientName("");
    setPatientAge("45");
    setSelectedFiles([]);
    setOcrError(null);
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
    setIsVerifiedCheck(false);
  };

  return (
    <div className="space-y-6">
      {/* File Ingestion Workspace */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-[20px] p-6 transition-all duration-300 text-center ${
          isDragging 
            ? "border-emerald-500 bg-emerald-500/5" 
            : "border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40"
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
            className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 dark:hover:bg-emerald-500 hover:text-white dark:hover:text-slate-950 transition-all duration-300 flex items-center justify-center cursor-pointer shadow-sm hover:shadow-emerald-500/20 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-emerald-500 select-none"
            title="Upload CBC Lab Report Photo"
          >
            {isOcrLoading ? (
              <RefreshCw className="animate-spin" size={24} />
            ) : (
              <Upload size={24} className="group-hover:-translate-y-0.5 transition-transform duration-300" />
            )}
          </button>
          
          <div>
            <h3 className="text-sm font-bold text-slate-905 dark:text-white">
              {isOcrLoading ? "Scanning CBC report details..." : "Import CBC Lab Report Photos (up to 3 Pages)"}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Drag & drop up to 3 lab report image pages here, or{" "}
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-emerald-500 hover:text-emerald-600 font-bold underline bg-transparent border-none cursor-pointer"
              >
                browse
              </button>
            </p>
          </div>

          {/* Multi-page upload list */}
          {selectedFiles.length > 0 && (
            <div className="mt-4 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/60 rounded-2xl p-4 text-left max-w-lg mx-auto space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-700/40">
                <span className="text-xs font-extrabold text-slate-600 dark:text-slate-400 tracking-wider uppercase">
                  Uploaded Pages ({selectedFiles.length}/3)
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
                    className="flex justify-between items-center bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/50 px-3 py-2 rounded-xl text-xs gap-3 shadow-sm hover:border-emerald-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <div className="truncate shrink">
                        <p className="font-bold text-slate-700 dark:text-slate-200 truncate">{file.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                      title={`Remove Page ${idx + 1}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              
              {/* Scan or status trigger buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                {isOcrLoading ? (
                  <div className="w-full flex flex-col justify-center items-center py-2 px-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-lg">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-[11px] uppercase tracking-wider">
                      <RefreshCw className="animate-spin" size={12} />
                      <span>{ocrStatusText || "Scanning Report..."}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => runOcrExtract(selectedFiles, "offline")}
                      className="flex-1 py-1.5 px-3 rounded-lg text-[11px] font-bold uppercase text-white bg-emerald-600 hover:bg-emerald-700 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                      title="Perform local offline text recognition"
                    >
                      <Cpu size={12} />
                      <span>Extract Offline</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => runOcrExtract(selectedFiles, "ai")}
                      className="flex-1 py-1.5 px-3 rounded-lg text-[11px] font-bold uppercase text-white bg-indigo-600 hover:bg-indigo-700 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                      title="Use advanced server-side intelligence model to extract report values"
                    >
                      <Sparkles size={11} />
                      <span>AI to Extract</span>
                    </button>
                  </>
                )}
                {selectedFiles.length < 3 && !isOcrLoading && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-1.5 px-3 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-700 dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition-colors flex items-center gap-1 shrink-0"
                    title="Add another photo/page"
                  >
                    <Plus size={11} />
                    <span>Add Page</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={handlePopulateSample}
              className="text-[10px] font-bold tracking-wide uppercase px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 cursor-pointer flex items-center gap-1 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
            >
              <Layers size={10} />
              <span>Load sample values</span>
            </button>
            <button
              type="button"
              onClick={handleClearAllInputs}
              className="text-[10px] font-bold tracking-wide uppercase px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-500 dark:border-red-500/20 dark:hover:bg-red-500/10 cursor-pointer flex items-center gap-1 transition-colors"
            >
              <Trash2 size={10} />
              <span>Clear all inputs</span>
            </button>
          </div>

          {ocrError && (
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 p-3 rounded-xl border border-red-100 dark:border-red-500/20 flex flex-col gap-2 max-w-full overflow-hidden">
              <div className="flex items-center gap-1">
                <AlertCircle size={12} className="shrink-0" />
                <span className="font-semibold">{ocrError}</span>
              </div>
              {ocrErrorStack && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] text-red-400 font-medium hover:underline">
                    Show Error Trace (For Safari / Android Debugging)
                  </summary>
                  <pre className="mt-2 p-2 bg-slate-900 border border-red-950 text-red-300 font-mono text-[10px] whitespace-pre-wrap rounded-lg overflow-auto max-h-40">
                    {ocrErrorStack}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manual Input Workspace */}
      <form onSubmit={handleCalculate} className="bento-card dark:bg-slate-800 space-y-6">
        <div>
          <h3 className="text-base font-extrabold text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-2 font-sans mb-1">
            <span className="w-1.5 h-4.5 bg-emerald-500 rounded-full shrink-0" />
            <span>Patient & Analytical Core Parameters</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-300 font-medium">Incorporate patient demographics and clinical panels evaluated during full diagnostic screening cycles.</p>
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
                value={patientAge}
                onChange={e => setPatientAge(e.target.value)}
                className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-100/10 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:ring-1 focus:ring-indigo-500 bg-transparent" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">Years</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center flex-wrap gap-4 border-t border-slate-100 dark:border-slate-800/40 pt-4">
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Blood Volume Core Panels</h3>
            <p className="text-xs text-slate-400">Core metrics used to trace anemia and immune response flags.</p>
          </div>

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
              Male Limits
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
              Female Limits
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Hemoglobin <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder={formData.gender === "male" ? "13.5-17.5" : "12.0-15.5"}
                value={formData.hemoglobin}
                onChange={e => handleInputChange("hemoglobin", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">g/dL</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Hematocrit <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder={formData.gender === "male" ? "38-48" : "35-45"}
                value={formData.hematocrit}
                onChange={e => handleInputChange("hematocrit", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-8 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">%</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">RBC (Red Cells) <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder={formData.gender === "male" ? "4.3-5.9" : "3.8-5.2"}
                value={formData.rbc}
                onChange={e => handleInputChange("rbc", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-14 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[8px] font-bold text-slate-400 leading-tight">10^12/L</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">WBC (White Cells) <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="4.5-11.0"
                value={formData.wbc}
                onChange={e => handleInputChange("wbc", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-14 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[8px] font-bold text-slate-400 leading-tight">10^9/L</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-50 dark:border-slate-700/30 pt-6">
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide mb-4">Core Indexes (Red Cell Size & Weight)</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">MCV (Mean Corpuscular Vol)<span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  required
                  placeholder="80-100"
                  value={formData.mcv}
                  onChange={e => handleInputChange("mcv", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-8 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">fL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">MCH (Mean Corpuscular Hb)<span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  required
                  placeholder="27-33"
                  value={formData.mch}
                  onChange={e => handleInputChange("mch", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-8 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">pg</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">MCHC (Mean Corp Hb Conc)<span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  required
                  placeholder="32-36"
                  value={formData.mchc}
                  onChange={e => handleInputChange("mchc", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">g/dL</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-50 dark:border-slate-700/30 pt-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Platelets & Immunological Differentials (NLR Ratio)</h4>
            <span className="text-[10px] text-slate-400 font-medium">Neutrophils and Lymphocytes required to unlock NLR scoring</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Platelets <span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="number" 
                  required
                  placeholder="150-400"
                  value={formData.platelets}
                  onChange={e => handleInputChange("platelets", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-14 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[8px] font-bold text-slate-400 leading-tight">10^9/L</span>
              </div>
              {formData.platelets && !isNaN(parseFloat(formData.platelets)) && (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold font-mono mt-0.5">
                  Equivalent: {(parseFloat(formData.platelets) / 100).toFixed(2)} lakh/µL
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block font-mono">Neutrophils (%)</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="40-70"
                  value={formData.neutrophils}
                  onChange={e => handleInputChange("neutrophils", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-8 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">%</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block font-mono">Lymphocytes (%)</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="20-40"
                  value={formData.lymphocytes}
                  onChange={e => handleInputChange("lymphocytes", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-8 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Clinical Safety Verification Checkbox */}
        <div className="bg-slate-900/40 dark:bg-slate-900/60 border border-slate-850 dark:border-slate-800 rounded-2xl p-4 flex items-start gap-4 select-none my-2 text-left">
          <input
            type="checkbox"
            checked={isVerifiedCheck}
            onChange={(e) => setIsVerifiedCheck(e.target.checked)}
            id="cbc-verification-calc-checkbox"
            className="mt-0.5 rounded border-slate-700 text-emerald-650 dark:text-emerald-500 focus:ring-emerald-500 cursor-pointer bg-slate-950 border-slate-800 w-4 h-4 shrink-0"
          />
          <div className="space-y-1">
            <label htmlFor="cbc-verification-calc-checkbox" className="text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer leading-tight block">
              I have verified the extracted values against the original report
            </label>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
              Confirming that all decimal points, values, and units are accurate prevents critical clinical and OCR errors.
            </p>
          </div>
        </div>

        <button 
          type="submit"
          disabled={!isVerifiedCheck}
          className="w-full py-3.5 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-600/10 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:scale-100"
        >
          <span>Calculate CBC Clinical Indexes</span>
        </button>
      </form>

      {/* Results panel */}
      {results && (
        <div className="space-y-6 pt-2">
          {/* Main Risk Bracket */}
          <ScoreGauge 
            label="Anomalies Triage Index"
            score={results.abnormalCount}
            maxScore={5}
            riskLevel={results.riskLevel}
          />
          
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            {results.overallStatus}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard 
              label="Hemoglobin"
              value={parseFloat(formData.hemoglobin)}
              unit="g/dL"
              minNormal={formData.gender === "male" ? 13.5 : 12.0}
              maxNormal={formData.gender === "male" ? 17.5 : 15.5}
              description={results.hemoglobinStatus}
            />

            <MetricCard 
              label="White Blood Cells"
              value={parseFloat(formData.wbc)}
              unit="10^9/L"
              minNormal={4.5}
              maxNormal={11.0}
              description={results.wbcStatus}
            />

            <MetricCard 
              label="Platelets"
              value={parseFloat(formData.platelets)}
              unit="10^9/L"
              minNormal={150}
              maxNormal={400}
              description={`${results.plateletStatus} | Equivalent to ${(parseFloat(formData.platelets) / 100).toFixed(2)} lakh/µL`}
            />
          </div>

          {/* Advanced scoring metrics */}
          <div className="bento-card dark:bg-slate-800 space-y-4 p-6">
            <h4 className="text-sm font-extrabold text-slate-950 dark:text-white flex items-center gap-2 uppercase tracking-wide font-sans">
              <span className="w-1.5 h-3.5 bg-emerald-500 rounded-full shrink-0" />
              <span>Immunology and Nutrient Status Panels</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* NLR Card */}
              <div className="bento-card dark:bg-slate-905 p-5 space-y-2">
                <span className="card-title">Neutrophil-to-Lymphocyte Ratio (NLR)</span>
                {results.nlratio !== undefined ? (
                  <div>
                    <div className={`score-big ${
                      results.nlratio > 3.0 
                        ? "text-rose-600 dark:text-rose-500" 
                        : results.nlratio < 1.0 
                          ? "text-amber-500 dark:text-amber-400" 
                          : "text-emerald-600 dark:text-emerald-400"
                    }`}>{results.nlratio}</div>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">{results.nlratioInterpretation}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Lock: Neutrophil and Lymphocyte differentials required to calculate NLR.</p>
                )}
              </div>

              {/* Anemia Index Card */}
              <div className="bento-card dark:bg-slate-905 p-5 space-y-2">
                <span className="card-title">Nutritional Anemia Vector</span>
                <div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100">Type: <span className="text-slate-500">{results.anemiaType || "Normal profile (no active anemia)"}</span></div>
                  <p className="text-xs text-slate-500 leading-relaxed mt-2">
                    Size (MCV) and weight (MCH/MCHC) parameters are integrated to determine if any microcytic or macrocytic iron-deficiency markers exist.
                  </p>
                </div>
              </div>
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
                {results ? getOfflineCbcSummary({
                  hemoglobin: parseFloat(formData.hemoglobin) || 0,
                  hematocrit: parseFloat(formData.hematocrit) || 0,
                  rbc: parseFloat(formData.rbc) || 0,
                  wbc: parseFloat(formData.wbc) || 0,
                  platelets: parseFloat(formData.platelets) || 0,
                  mcv: parseFloat(formData.mcv) || 0,
                  mch: parseFloat(formData.mch) || 0,
                  mchc: parseFloat(formData.mchc) || 0,
                  neutrophils: formData.neutrophils ? parseFloat(formData.neutrophils) : undefined,
                  lymphocytes: formData.lymphocytes ? parseFloat(formData.lymphocytes) : undefined,
                  gender: formData.gender,
                }, results) : ""}
              </p>
            </div>

            {/* Part B: On-Demand AI Interpretation */}
            <div className="space-y-3 pt-1">
              {!aiInsight && !isAiLoading && !aiError && (
                <div className="relative flex flex-col items-center justify-center p-5 bg-slate-950/20 border border-dashed border-slate-800 rounded-2xl space-y-4">
                  <p className="text-[11px] text-slate-300 text-center font-medium leading-relaxed">
                    Need an deep expert clinical review of potential microcytic/macrocytic anomalies, inflammatory stress markers, or full diagnostic trends with {activeProviderName}?
                  </p>
                  
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 cursor-pointer select-none max-w-sm text-left transition-colors hover:bg-slate-950/60">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="cbc-verification-checkbox"
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
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:bg-emerald-800/50"
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
                  <div className="text-xs text-red-400 flex flex-col gap-2 font-medium text-left">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{aiError}</span>
                    </div>
                    {aiErrorStack && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[10px] text-red-400 font-medium hover:underline">
                          Show Error Trace (For Safari / Android Debugging)
                        </summary>
                        <pre className="mt-2 p-2 bg-slate-900 border border-red-950 text-red-300 font-mono text-[10px] whitespace-pre-wrap rounded-lg overflow-auto max-h-40 text-left">
                          {aiErrorStack}
                        </pre>
                      </details>
                    )}
                  </div>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 cursor-pointer select-none max-w-sm text-left transition-colors hover:bg-slate-950/60">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="cbc-verification-retry-checkbox"
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
                    className="px-4 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-300 border border-red-800/40 rounded-lg text-[10px] font-bold uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            <span className="text-xs text-slate-400 text-justify">Ensure values are verified before sharing or saving to logs.</span>
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
