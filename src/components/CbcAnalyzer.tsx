import React, { useState, useRef, useEffect } from "react";
import { Upload, Save, Check, AlertCircle, RefreshCw, Layers, FileText, X, Plus, Trash2, Sparkles, Cpu, Camera } from "lucide-react";
import { CBCInputs, CBCResults, AnalysisRecord } from "../types";
import { calculateCBC } from "../utils/calculations";
import { printClinicalReport } from "../utils/printHelper";
import ScoreGauge from "./ScoreGauge";
import MetricCard from "./MetricCard";
import Tesseract from "tesseract.js";
import { preprocessImageForOcr } from "../utils/ocrPreprocessing";
import { runGeminiAnalyze, runGeminiExtractReport, getProviderDisplayName, isProviderKeyMissing } from "../utils/geminiClient";
import { parseCbcReport } from "../utils/labReportParser";
import WebcamCaptureModal from "./WebcamCaptureModal";

function getOfflineCbcSummary(inputs: CBCInputs, results: CBCResults): string {
  if (results.abnormalCount === 0) {
    return "Normal CBC & Red Cell Indices Profile. All core blood counts, erythrocyte sizing (MCV), cellular hemoglobin content (MCH/MCHC), distribution width (RDW), and nutritional reserves are within standard physiological reference ranges.";
  }
  
  const segments: string[] = [];

  // Hemoglobin & Morphology
  if (results.hemoglobinStatus.startsWith("Low") || (inputs.hemoglobin < (inputs.gender === "male" ? 13.5 : 12.0))) {
    if (results.morphologyDetails) {
      segments.push(`Anemia Identified: ${results.morphologyDetails}`);
    } else if (results.anemiaType) {
      segments.push(`Anemia Identified: ${results.anemiaType}.`);
    }
  } else if (results.hemoglobinStatus.startsWith("High")) {
    segments.push("Polycythemia / Erythrocytosis pattern: Elevated hemoglobin and hematocrit indicate increased red cell density; consider hydration status or secondary erythrocytosis.");
  }

  // Red Cell Indices specifics
  const indexAnomalies: string[] = [];
  if (inputs.mcv < 80) indexAnomalies.push(`Microcytosis (MCV: ${inputs.mcv} fL)`);
  else if (inputs.mcv > 100) indexAnomalies.push(`Macrocytosis (MCV: ${inputs.mcv} fL)`);

  if (inputs.mch < 27) indexAnomalies.push(`Hypochromia (MCH: ${inputs.mch} pg)`);
  else if (inputs.mch > 33) indexAnomalies.push(`Hyperchromia (MCH: ${inputs.mch} pg)`);

  if (inputs.mchc < 32) indexAnomalies.push(`Reduced MCHC (${inputs.mchc} g/dL)`);
  else if (inputs.mchc > 36) indexAnomalies.push(`Elevated MCHC (${inputs.mchc} g/dL)`);

  if (inputs.rdw !== undefined && inputs.rdw > 14.5) {
    indexAnomalies.push(`Anisocytosis with high RDW (${inputs.rdw}%)`);
  }

  if (inputs.vitaminB12 !== undefined) {
    if (inputs.vitaminB12 < 200) {
      indexAnomalies.push(`Severe Vitamin B12 Deficiency (${inputs.vitaminB12} pg/mL)`);
    } else if (inputs.vitaminB12 <= 300) {
      indexAnomalies.push(`Borderline Vitamin B12 Reserve (${inputs.vitaminB12} pg/mL)`);
    }
  }

  if (indexAnomalies.length > 0) {
    segments.push(`Red Cell Indices & Biomarkers: ${indexAnomalies.join(", ")}.`);
  }

  // Mentzer Index
  if (results.mentzerIndex !== undefined && results.mentzerInterpretation) {
    segments.push(`Differential Sizing: ${results.mentzerInterpretation}`);
  }

  // WBC & Immunological
  if (results.wbcStatus.startsWith("High") || inputs.wbc > 11.0) {
    segments.push("Leukocytosis: Elevated white blood cell count suggesting active systemic immune reactivity, bacterial infection, or acute tissue inflammation.");
  } else if (results.wbcStatus.startsWith("Low") || inputs.wbc < 4.5) {
    segments.push("Leukopenia: Reduced leukocyte count indicating potential bone marrow suppression, viral clearance stress, or immune vulnerability.");
  }

  // Platelets
  if (results.plateletStatus.startsWith("Low") || results.plateletStatus.includes("Critical") || inputs.platelets < 150) {
    segments.push(inputs.platelets < 55 ? "Critical Thrombocytopenia Warning: Platelet count severely depressed (< 55 ×10⁹/L); high hemorrhagic vulnerability requires immediate clinical evaluation." : "Thrombocytopenia: Reduced platelet count; consider portal hypertension / splenic sequestration or peripheral consumption.");
  } else if (results.plateletStatus.startsWith("High") || inputs.platelets > 450) {
    segments.push("Thrombocytosis: Reactive platelet elevation often seen in systemic inflammation, tissue injury, or iron deficiency.");
  }

  // NLR
  if (results.nlratio !== undefined && results.nlratio > 3.0) {
    segments.push(`Inflammatory Ratio: Elevated NLR (${results.nlratio}) reflects active systemic micro-inflammation or biological stress.`);
  }

  return segments.join(" ") || "CBC profile evaluated. Maintain routine primary healthcare monitoring.";
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
    rdw: "",
    vitaminB12: "",
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

  // Mapped dynamic AI provider translations with reactive event sync
  const [selectedProvider, setSelectedProvider] = useState<string>(() => localStorage.getItem("selected_ai_provider") || "auto");

  useEffect(() => {
    const handleProviderUpdate = () => {
      setSelectedProvider(localStorage.getItem("selected_ai_provider") || "auto");
    };
    window.addEventListener("ai-provider-changed", handleProviderUpdate);
    window.addEventListener("storage", handleProviderUpdate);
    return () => {
      window.removeEventListener("ai-provider-changed", handleProviderUpdate);
      window.removeEventListener("storage", handleProviderUpdate);
    };
  }, []);

  const activeProviderName = getProviderDisplayName(selectedProvider);
  const currentProvider = selectedProvider;
  const [aiMeta, setAiMeta] = useState<{ providerUsed?: string; wasFallback?: boolean; modelUsed?: string } | null>(null);
  const [missingExtractedKeys, setMissingExtractedKeys] = useState<string[]>([]);

  // Input refs for Mobile & PC (Upload Report & Camera)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [extractMeta, setExtractMeta] = useState<{ providerUsed?: string; modelUsed?: string; wasFallback?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isWebcamOpen, setIsWebcamOpen] = useState<boolean>(false);

  const handleWebcamCapture = (file: File) => {
    const newFiles = [...selectedFiles, file].slice(0, 3);
    setSelectedFiles(newFiles);
    runOcrExtract(newFiles, "offline");
  };

  const isFieldMissing = (val: any) => (extractMeta !== null || missingExtractedKeys.length > 0) && (val === undefined || val === null || val === "");
  const getInputClass = (val: any, extraPadding = "pr-12") => {
    if (isFieldMissing(val)) {
      return `w-full bg-rose-50/60 border-2 border-rose-500 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold ${extraPadding} font-mono focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-all shadow-xs`;
    }
    return `w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold ${extraPadding} font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-xs`;
  };
  const getNameClass = (val: any) => {
    if (isFieldMissing(val)) {
      return "w-full bg-rose-50/60 border-2 border-rose-500 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold placeholder-rose-400 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-all h-[42px] shadow-xs";
    }
    return "w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all h-[42px] shadow-xs";
  };

  const handleInputChange = (key: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
    setCurrentRecordId(null);
    setIsVerifiedCheck(false);
  };

  const getCbcInputs = (): CBCInputs => {
    let parsedWbc = parseFloat(formData.wbc);
    if (!isNaN(parsedWbc) && parsedWbc > 100) {
      parsedWbc = parseFloat((parsedWbc / 1000).toFixed(2));
    }

    return {
      hemoglobin: parseFloat(formData.hemoglobin),
      hematocrit: parseFloat(formData.hematocrit),
      rbc: parseFloat(formData.rbc),
      wbc: parsedWbc,
      platelets: parseFloat(formData.platelets),
      mcv: parseFloat(formData.mcv),
      mch: parseFloat(formData.mch),
      mchc: parseFloat(formData.mchc),
      rdw: formData.rdw ? parseFloat(formData.rdw) : undefined,
      vitaminB12: formData.vitaminB12 ? parseFloat(formData.vitaminB12) : undefined,
      neutrophils: formData.neutrophils ? parseFloat(formData.neutrophils) : undefined,
      lymphocytes: formData.lymphocytes ? parseFloat(formData.lymphocytes) : undefined,
      monocytes: formData.monocytes ? parseFloat(formData.monocytes) : undefined,
      eosinophils: formData.eosinophils ? parseFloat(formData.eosinophils) : undefined,
      basophils: formData.basophils ? parseFloat(formData.basophils) : undefined,
      gender: formData.gender,
    };
  };

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.hemoglobin || !formData.hematocrit || !formData.rbc || !formData.wbc || !formData.platelets || !formData.mcv || !formData.mch || !formData.mchc) {
      alert("Missing core blood indicators – Hemoglobin, Hematocrit, RBC, WBC, Platelets, MCV, MCH, and MCHC are required.");
      return;
    }

    const inputs = getCbcInputs();
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

    const inputs = getCbcInputs();
    requestAiInsight(inputs, results, currentRecordId);
  };

  const requestAiInsight = async (inputs: CBCInputs, calculated: CBCResults, recordId: string) => {
    setIsAiLoading(true);
    setAiError(null);
    setAiErrorStack(null);

    try {
      const prompt = `Interpret the following Patient Complete Blood Count (CBC) and Red Cell Indices results:
- Hemoglobin: ${inputs.hemoglobin} g/dL (Reference: Male: 13.5-17.5, Female: 12.0-15.5)
- Hematocrit: ${inputs.hematocrit}% (Reference: Male: 38.3-48.6%, Female: 35.5-44.9%)
- RBC Count: ${inputs.rbc} x10^12/L (Reference: Male: 4.3-5.9, Female: 3.8-5.2)
- WBC Count: ${inputs.wbc} 10^9/L = ${calculated.wbcStatus} (Reference: 4.5-11.0)
- Platelets: ${inputs.platelets} 10^9/L = ${calculated.plateletStatus} (Reference: 150-400)
- MCV (Mean Corpuscular Volume): ${inputs.mcv} fL (${calculated.mcvStatus}) (Reference: 80-100)
- MCH (Mean Corpuscular Hemoglobin): ${inputs.mch} pg (${calculated.mchStatus}) (Reference: 27-33)
- MCHC (Mean Corpuscular Hb Concentration): ${inputs.mchc} g/dL (${calculated.mchcStatus}) (Reference: 32-36)
- RDW (Red Cell Distribution Width): ${inputs.rdw !== undefined ? `${inputs.rdw}% (${calculated.rdwStatus})` : "Not Provided"} (Reference: 11.5-14.5%)
- Serum Vitamin B12: ${inputs.vitaminB12 !== undefined ? `${inputs.vitaminB12} pg/mL (${calculated.vitaminB12Status})` : "Not Provided"} (Reference: 200-900 pg/mL)
- Neutrophils: ${inputs.neutrophils ?? "N/A"}%
- Lymphocytes: ${inputs.lymphocytes ?? "N/A"}%
- Patient Gender: ${inputs.gender}

Calculated Clinical Findings & Diagnostic Indexes:
- Hemoglobin State: ${calculated.hemoglobinStatus} ${calculated.anemiaType ? `(${calculated.anemiaType})` : ""}
- Morphology Classification: ${calculated.morphologyClassification ?? "N/A"} (${calculated.morphologyDetails ?? "N/A"})
- Mentzer Index (MCV/RBC): ${calculated.mentzerIndex ?? "N/A"} (${calculated.mentzerInterpretation ?? "N/A"})
- Platelet Condition: ${calculated.plateletStatus}
- WBC & Infection Context: ${calculated.infectionRisk}
- Neutrophil-to-Lymphocyte Ratio (NLR): ${calculated.nlratio ?? "N/A"} (${calculated.nlratioInterpretation ?? "N/A"})
- Total Out-of-Range Anomalies: ${calculated.abnormalCount}

Please write an expert, professional clinical interpretation formatted clearly for primary care physicians:
1. Red Cell Morphology & Anemia Etiology (Iron deficiency vs Thalassemia trait vs Megaloblastic/B12 deficiency)
2. Immunological & Leukocyte Proliferation Findings (WBC & NLR)
3. Platelet & Hemostatic Assessment
4. Recommended Confirmatory Diagnostic Workup (e.g. Ferritin, TIBC, HPLC, Serum B12/MMA, Folate) & Lifestyle Guidance`;

      const provider = localStorage.getItem("selected_ai_provider") || "auto";
      const data = await runGeminiAnalyze("cbc", prompt, provider);

      if (data && data.insight) {
        setAiInsight(data.insight);
        setAiMeta({
          providerUsed: data.providerUsed,
          wasFallback: data.wasFallback,
          modelUsed: data.modelUsed
        });
        
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
        ...getCbcInputs(),
        offset: 0,
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
      inputs: getCbcInputs(),
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
    setFormData(prev => {
      const next = {
        ...prev,
        hemoglobin: vals["Hemoglobin"] !== undefined ? String(vals["Hemoglobin"]) : prev.hemoglobin,
        hematocrit: vals["Hematocrit"] !== undefined ? String(vals["Hematocrit"]) : prev.hematocrit,
        rbc: vals["RBC"] !== undefined ? String(vals["RBC"]) : prev.rbc,
        wbc: vals["WBC"] !== undefined ? String(vals["WBC"]) : prev.wbc,
        platelets: vals["Platelets"] !== undefined ? String(vals["Platelets"]) : prev.platelets,
        mcv: vals["MCV"] !== undefined ? String(vals["MCV"]) : prev.mcv,
        mch: vals["MCH"] !== undefined ? String(vals["MCH"]) : prev.mch,
        mchc: vals["MCHC"] !== undefined ? String(vals["MCHC"]) : prev.mchc,
        rdw: vals["RDW"] !== undefined ? String(vals["RDW"]) : prev.rdw,
        vitaminB12: vals["vitaminB12"] !== undefined ? String(vals["vitaminB12"]) : prev.vitaminB12,
        neutrophils: vals["Neutrophils"] !== undefined ? String(vals["Neutrophils"]) : prev.neutrophils,
        lymphocytes: vals["Lymphocytes"] !== undefined ? String(vals["Lymphocytes"]) : prev.lymphocytes,
      };

      const missing: string[] = [];
      if (!next.hemoglobin) missing.push("Hemoglobin");
      if (!next.rbc) missing.push("RBC Count");
      if (!next.wbc) missing.push("WBC Count");
      if (!next.platelets) missing.push("Platelets");
      if (!next.mcv) missing.push("MCV (Cell Size)");
      if (!next.mch) missing.push("MCH");
      if (!next.mchc) missing.push("MCHC");
      if (!next.rdw) missing.push("RDW %");
      if (!next.vitaminB12) missing.push("Vitamin B12 (pg/mL)");
      if (!next.neutrophils) missing.push("Neutrophils % (for NLR)");
      if (!next.lymphocytes) missing.push("Lymphocytes % (for NLR)");
      if (!vals.patientName && !patientName) missing.push("Patient Name");
      setMissingExtractedKeys(missing);

      return next;
    });
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

      if (mode === "offline") {
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
        setExtractMeta({ providerUsed: "Local Tesseract OCR", modelUsed: "Offline Pattern Parser", wasFallback: false });
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
        const data = await runGeminiExtractReport(base64Contents, "cbc", aggregatedText);
        
        if (data && data.values) {
          applyCbcOcrValues(data.values);
          setExtractMeta({
            providerUsed: data.providerUsed,
            modelUsed: data.modelUsed,
            wasFallback: data.wasFallback
          });
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
    setOcrError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = Array.from(files);
      setSelectedFiles(prev => {
        const combined = [...prev, ...newFiles].slice(0, 3);
        runOcrExtract(combined);
        return combined;
      });
      // Reset input value so re-uploading the same file works
      e.target.value = "";
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
    setMissingExtractedKeys([]);
    setExtractMeta(null);
    setOcrError(null);
    setOcrErrorStack(null);
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
    setIsVerifiedCheck(false);
  };

  return (
    <div className="space-y-6">
      {/* Native File Input Handlers */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,.pdf,application/pdf"
        multiple
        className="hidden" 
      />
      <input 
        type="file" 
        ref={cameraInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden" 
      />

      {/* Upload Action Center */}
      <div className="p-4 bg-white dark:bg-slate-900/80 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 dark:text-white">
              <Upload size={14} className="text-emerald-700 dark:text-emerald-400" />
              <span>Feed / Scan CBC Report (Photo or PDF)</span>
            </h4>
            <p className="text-[11px] font-bold mt-0.5 dark:text-slate-200">
              Upload your complete blood count report for automated parameter recognition
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePopulateSample}
              className="text-xs font-bold tracking-wide px-3 py-1.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-950 dark:text-white cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              <Layers size={13} />
              <span>Load Sample</span>
            </button>
            <button
              type="button"
              onClick={handleClearAllInputs}
              className="text-xs font-bold tracking-wide px-3 py-1.5 rounded-xl border-2 border-red-300 hover:bg-red-50 text-red-700 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Live Active AI Agent Selector Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <span>Agent:</span>
            </span>
            <select
              value={selectedProvider}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedProvider(val);
                localStorage.setItem("selected_ai_provider", val);
                window.dispatchEvent(new CustomEvent("ai-provider-changed", { detail: val }));
              }}
              className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer shadow-xs focus:ring-2 focus:ring-emerald-500"
            >
              <option value="auto">Auto</option>
              <option value="gemini_35_flash">Gemini 3.5 Flash</option>
              <option value="gemini_2_pro">Gemini 2.0 Pro</option>
              <option value="gemini_15_pro">Gemini 1.5 Pro</option>
              <option value="gemini_2_flash">Gemini 2.0 Flash</option>
              <option value="gemini_15_flash">Gemini 1.5 Flash</option>
              <option value="groq">Groq Llama 3.3 70B</option>
              <option value="openrouter">OpenRouter</option>
              <option value="local_ocr">Offline OCR</option>
              <option value="openai">OpenAI GPT-4o-mini</option>
              <option value="claude">Claude 3.5 Haiku</option>
              <option value="deepseek">DeepSeek Chat</option>
            </select>
            {isProviderKeyMissing(selectedProvider) && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("open-ai-provider-modal"))}
                className="px-2 py-0.5 rounded-md bg-amber-100 border border-amber-400 text-amber-900 text-[11px] font-black flex items-center gap-1 animate-pulse cursor-pointer"
                title="API Key required for this agent"
              >
                <span>⚠️ Key Required</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-ai-provider-modal"))}
            className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>⚙️ Settings</span>
          </button>
        </div>

        {/* Extraction Engine Attribution Banner */}
        {extractMeta && (
          <div className="flex items-center justify-between gap-2 p-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800/60 rounded-xl text-xs">
            <div className="flex items-center gap-1.5 text-emerald-900 dark:text-emerald-200 font-bold truncate">
              <Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">
                Extracted via <strong>{getProviderDisplayName(extractMeta.providerUsed || "auto")}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => selectedFiles.length > 0 && runOcrExtract(selectedFiles, "ai")}
              className="px-2 py-1 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 rounded-lg text-[10px] font-black hover:bg-emerald-100 transition-colors cursor-pointer shrink-0"
              title="Re-run AI extraction"
            >
              🔄 Re-extract
            </button>
          </div>
        )}

        {/* Missing Parameters Notification (Concise) */}
        {missingExtractedKeys.length > 0 && (
          <div className="p-3 bg-rose-50/95 dark:bg-rose-950/30 border-2 border-rose-400 dark:border-rose-600 rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-black glow-red-text">
                <AlertCircle size={14} className="text-rose-600 shrink-0" />
                <span>Missing from report ({missingExtractedKeys.length}):</span>
              </div>
              <button
                type="button"
                onClick={() => setMissingExtractedKeys([])}
                className="text-[10px] font-bold text-rose-700 dark:text-rose-300 hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {missingExtractedKeys.map((k, idx) => (
                <span key={idx} className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">
                  ● {k}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mobile View: Exactly 1 single 'Upload Report' button */}
        <div className="block sm:hidden">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-xs transition-all active:scale-[0.98] cursor-pointer"
          >
            <Upload size={16} />
            <span>Upload Report</span>
          </button>
        </div>

        {/* PC / Desktop View: Exactly 2 options (Take Photo & Upload Report) */}
        <div className="hidden sm:grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setIsWebcamOpen(true)}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-black shadow-xs transition-all active:scale-[0.98] cursor-pointer"
          >
            <Camera size={15} />
            <span>Take Photo</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-xs transition-all active:scale-[0.98] cursor-pointer"
          >
            <Upload size={15} />
            <span>Upload Report</span>
          </button>
        </div>
      </div>

      {/* Multi-page upload list if files attached */}
      {selectedFiles.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/60 rounded-2xl p-4 text-left space-y-3">
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
              <>
                {/* Mobile: single + Add Page button */}
                <div className="block sm:hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-1.5 px-3 rounded-lg text-[11px] font-bold border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 cursor-pointer transition-colors flex items-center gap-1"
                    title="Add another report page"
                  >
                    <Plus size={12} />
                    <span>+ Add Page</span>
                  </button>
                </div>

                {/* PC: Take Photo & Upload File */}
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsWebcamOpen(true)}
                    className="py-1.5 px-2.5 rounded-lg text-[11px] font-bold border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-800 dark:text-indigo-300 cursor-pointer transition-colors flex items-center gap-1"
                    title="Take photo with camera"
                  >
                    <Camera size={11} />
                    <span>+ Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-1.5 px-2.5 rounded-lg text-[11px] font-bold border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 cursor-pointer transition-colors flex items-center gap-1"
                    title="Upload additional report file"
                  >
                    <Upload size={11} />
                    <span>+ Upload File</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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

      {/* Manual Input Workspace */}
      <form onSubmit={handleCalculate} className="bento-card border-2 border-slate-300 space-y-6">
        <div>
          <h3 className="text-base font-black uppercase tracking-wider flex items-center gap-2 font-sans mb-1">
            <span className="w-1.5 h-4.5 bg-emerald-600 rounded-full shrink-0" />
            <span>Patient & Analytical Core Parameters</span>
          </h3>
          <p className="text-xs font-bold">Incorporate patient demographics and clinical panels evaluated during full diagnostic screening cycles.</p>
        </div>

        {/* Patient Demographics Registration Profile */}
        <div className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black tracking-wide block">Patient Full Name</label>
            <input 
              type="text" 
              placeholder="e.g. Robert Chen"
              value={patientName}
              onChange={e => {
                setPatientName(e.target.value);
                setCurrentRecordId(null);
              }}
              className={getNameClass(patientName)} 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black tracking-wide block">Patient Gender / Sex</label>
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
            <label className="text-xs font-black tracking-wide block">Patient Age</label>
            <div className="relative">
              <input 
                type="number" 
                placeholder="45"
                value={patientAge}
                onChange={e => setPatientAge(e.target.value)}
                className={getInputClass(patientAge, "pr-12")} 
              />
              <span className="absolute right-3 top-2.5 text-xs font-black">Years</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wide">Blood Volume Core Panels</h3>
            <p className="text-xs font-bold">Core metrics used to trace anemia and immune response flags.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black tracking-wide block">Hemoglobin <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder={formData.gender === "male" ? "13.5-17.5" : "12.0-15.5"}
                value={formData.hemoglobin}
                onChange={e => handleInputChange("hemoglobin", e.target.value)}
                className={getInputClass(formData.hemoglobin, "pr-12")} 
              />
              <span className="absolute right-3 top-2.5 text-xs font-black">g/dL</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black tracking-wide block">Hematocrit <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder={formData.gender === "male" ? "38-48" : "35-45"}
                value={formData.hematocrit}
                onChange={e => handleInputChange("hematocrit", e.target.value)}
                className={getInputClass(formData.hematocrit, "pr-10")} 
              />
              <span className="absolute right-3 top-2.5 text-xs font-black">%</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black tracking-wide block">RBC (Red Cells) <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder={formData.gender === "male" ? "4.3-5.9" : "3.8-5.2"}
                value={formData.rbc}
                onChange={e => handleInputChange("rbc", e.target.value)}
                className={getInputClass(formData.rbc, "pr-14")} 
              />
              <span className="absolute right-3 top-2.5 text-[9px] font-black leading-tight">10^12/L</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black tracking-wide block">WBC (White Cells) <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="4.5-11.0"
                value={formData.wbc}
                onChange={e => handleInputChange("wbc", e.target.value)}
                className={getInputClass(formData.wbc, "pr-14")} 
              />
              <span className="absolute right-3 top-2.5 text-[9px] font-black leading-tight">10^9/L</span>
            </div>
            {formData.wbc && !isNaN(parseFloat(formData.wbc)) && (
              <p style={{ color: "#065f46" }} className="text-xs font-black font-mono mt-1">
                Equivalent: {parseFloat(formData.wbc) > 100 
                  ? `${(parseFloat(formData.wbc) / 1000).toFixed(2)} ×10⁹/L` 
                  : `${Math.round(parseFloat(formData.wbc) * 1000).toLocaleString()} cells/cu.mm (/µL)`}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h4 className="text-xs font-black uppercase tracking-wide">Red Blood Cell Indices & Nutritional Biomarkers</h4>
            <span className="text-xs font-bold text-slate-500">MCV, MCH, MCHC, RDW, and Vit B12 evaluate anemia morphology and deficiencies</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black tracking-wide block">MCV (Mean Corpuscular Vol)<span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  required
                  placeholder="80-100"
                  value={formData.mcv}
                  onChange={e => handleInputChange("mcv", e.target.value)}
                  className={getInputClass(formData.mcv, "pr-10")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">fL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black tracking-wide block">MCH (Mean Corpuscular Hb)<span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  required
                  placeholder="27-33"
                  value={formData.mch}
                  onChange={e => handleInputChange("mch", e.target.value)}
                  className={getInputClass(formData.mch, "pr-10")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">pg</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black tracking-wide block">MCHC (Mean Corp Hb Conc)<span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  required
                  placeholder="32-36"
                  value={formData.mchc}
                  onChange={e => handleInputChange("mchc", e.target.value)}
                  className={getInputClass(formData.mchc, "pr-12")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">g/dL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black tracking-wide block">RDW (Red Cell Dist. Width)</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="11.5-14.5"
                  value={formData.rdw}
                  onChange={e => handleInputChange("rdw", e.target.value)}
                  className={getInputClass(formData.rdw, "pr-10")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">%</span>
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-black tracking-wide block">Vitamin B12 (Cobalamin)</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="200-900"
                  value={formData.vitaminB12}
                  onChange={e => handleInputChange("vitaminB12", e.target.value)}
                  className={getInputClass(formData.vitaminB12, "pr-16")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">pg/mL</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h4 className="text-xs font-black uppercase tracking-wide">Platelets & Immunological Differentials (NLR Ratio)</h4>
            <span className="text-xs font-bold">Neutrophils and Lymphocytes required to unlock NLR scoring</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black tracking-wide block">Platelets <span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="number" 
                  required
                  placeholder="150-400"
                  value={formData.platelets}
                  onChange={e => handleInputChange("platelets", e.target.value)}
                  className={getInputClass(formData.platelets, "pr-14")} 
                />
                <span className="absolute right-3 top-2.5 text-[9px] font-black leading-tight">10^9/L</span>
              </div>
              {formData.platelets && !isNaN(parseFloat(formData.platelets)) && (
                <p style={{ color: "#065f46" }} className="text-xs font-black font-mono mt-1">
                  Equivalent: {(parseFloat(formData.platelets) / 100).toFixed(2)} lakh/µL
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black tracking-wide block font-mono">Neutrophils (%)</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="40-70"
                  value={formData.neutrophils}
                  onChange={e => handleInputChange("neutrophils", e.target.value)}
                  className={getInputClass(formData.neutrophils, "pr-10")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">%</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black tracking-wide block font-mono">Lymphocytes (%)</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="20-40"
                  value={formData.lymphocytes}
                  onChange={e => handleInputChange("lymphocytes", e.target.value)}
                  className={getInputClass(formData.lymphocytes, "pr-10")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Clinical Safety Verification Checkbox */}
        <div className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-4 flex items-start gap-4 select-none my-2 text-left shadow-xs">
          <input
            type="checkbox"
            checked={isVerifiedCheck}
            onChange={(e) => setIsVerifiedCheck(e.target.checked)}
            id="cbc-verification-calc-checkbox"
            className="mt-0.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-600 cursor-pointer bg-white w-4 h-4 shrink-0"
          />
          <div className="space-y-1">
            <label htmlFor="cbc-verification-calc-checkbox" className="text-xs font-black cursor-pointer leading-tight block">
              I have verified the extracted values against the original report
            </label>
            <p className="text-xs font-bold leading-normal">
              Confirming that all decimal points, values, and units are accurate prevents critical clinical and OCR errors.
            </p>
          </div>
        </div>

        <button 
          type="submit"
          disabled={!isVerifiedCheck}
          className="w-full py-3.5 rounded-2xl bg-cyan-700 hover:bg-cyan-800 text-white font-black text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:scale-100"
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
            maxScore={6}
            riskLevel={results.riskLevel}
          />
          
          <div style={{ backgroundColor: "#f0fdf4", color: "#000000" }} className="p-4 border-2 border-emerald-300 rounded-2xl text-xs leading-relaxed font-bold">
            {results.overallStatus}
          </div>

          {/* 3 Core Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard 
              label="Hemoglobin"
              value={parseFloat(formData.hemoglobin)}
              unit="g/dL"
              minNormal={formData.gender === "male" ? 13.5 : 12.0}
              maxNormal={formData.gender === "male" ? 17.5 : 15.5}
              description={results.hemoglobinStatus}
            />

            {(() => {
              const rawWbc = parseFloat(formData.wbc);
              const normWbc = rawWbc > 100 ? rawWbc / 1000 : rawWbc;
              const cellsPerCumm = Math.round(normWbc * 1000).toLocaleString();
              return (
                <MetricCard 
                  label="White Blood Cells (TLC)"
                  value={normWbc}
                  unit="10^9/L"
                  minNormal={4.5}
                  maxNormal={11.0}
                  description={`${results.wbcStatus} | Equivalent to ${cellsPerCumm} cells/cu.mm (/µL)`}
                />
              );
            })()}

            <MetricCard 
              label="Platelets"
              value={parseFloat(formData.platelets)}
              unit="10^9/L"
              minNormal={150}
              maxNormal={400}
              description={`${results.plateletStatus} | Equivalent to ${(parseFloat(formData.platelets) / 100).toFixed(2)} lakh/µL`}
            />
          </div>

          {/* Red Blood Cell Indices & Morphological Assessment Panel */}
          <div className="bento-card border-2 border-slate-300 space-y-6 p-6">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3 flex-wrap">
              <h4 className="text-sm font-black flex items-center gap-2 uppercase tracking-wide font-sans">
                <span className="w-1.5 h-3.5 bg-emerald-600 rounded-full shrink-0" />
                <span>Red Blood Cell Indices & Nutritional Biomarkers</span>
              </h4>
              <span className="text-[11px] font-bold text-slate-500 font-mono">
                5-Parameter Morphological Evaluation
              </span>
            </div>

            {/* 5 Index Bento Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* 1. MCV Card */}
              {(() => {
                const val = parseFloat(formData.mcv);
                const isOut = val < 80 || val > 100;
                const cardBorder = isOut ? "border-rose-300" : "border-emerald-300";
                const cardBg = isOut ? "bg-rose-50/50" : "bg-emerald-50/50";
                const scoreColor = isOut ? "text-rose-700" : "text-emerald-700";
                const badgeBg = isOut ? "bg-rose-100 text-rose-900 border border-rose-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300";
                const infoBox = isOut ? "bg-rose-100/70 border-rose-300 text-rose-950" : "bg-emerald-100/70 border-emerald-300 text-emerald-950";

                return (
                  <div className={`bento-card border-2 p-5 space-y-3 transition-all ${cardBorder} ${cardBg}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <span className="card-title font-mono font-black text-xs uppercase tracking-wider block">
                        MCV (Cell Volume)
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        80–100 fL
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center py-1 space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Exact Reading
                      </span>
                      <div className={`text-5xl font-black font-mono tracking-tight ${scoreColor}`}>
                        {val.toFixed(1)} <span className="text-sm font-sans font-bold text-slate-500">fL</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${badgeBg}`}>
                        {results.mcvStatus || (val < 80 ? "Microcytic (< 80 fL)" : val > 100 ? "Macrocytic (> 100 fL)" : "Normocytic")}
                      </span>
                      <div className={`p-2.5 rounded-xl border text-xs font-bold leading-relaxed text-center w-full ${infoBox}`}>
                        {results.mcvInterpretation}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 2. MCH Card */}
              {(() => {
                const val = parseFloat(formData.mch);
                const isOut = val < 27 || val > 33;
                const cardBorder = isOut ? "border-amber-300" : "border-emerald-300";
                const cardBg = isOut ? "bg-amber-50/50" : "bg-emerald-50/50";
                const scoreColor = isOut ? "text-amber-700" : "text-emerald-700";
                const badgeBg = isOut ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300";
                const infoBox = isOut ? "bg-amber-100/70 border-amber-300 text-amber-950" : "bg-emerald-100/70 border-emerald-300 text-emerald-950";

                return (
                  <div className={`bento-card border-2 p-5 space-y-3 transition-all ${cardBorder} ${cardBg}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <span className="card-title font-mono font-black text-xs uppercase tracking-wider block">
                        MCH (Cellular Hb)
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        27–33 pg
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center py-1 space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Exact Reading
                      </span>
                      <div className={`text-5xl font-black font-mono tracking-tight ${scoreColor}`}>
                        {val.toFixed(1)} <span className="text-sm font-sans font-bold text-slate-500">pg</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${badgeBg}`}>
                        {results.mchStatus || (val < 27 ? "Hypochromic (< 27 pg)" : val > 33 ? "Hyperchromic (> 33 pg)" : "Normochromic")}
                      </span>
                      <div className={`p-2.5 rounded-xl border text-xs font-bold leading-relaxed text-center w-full ${infoBox}`}>
                        {results.mchInterpretation}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 3. MCHC Card */}
              {(() => {
                const val = parseFloat(formData.mchc);
                const isOut = val < 32 || val > 36;
                const cardBorder = isOut ? "border-amber-300" : "border-emerald-300";
                const cardBg = isOut ? "bg-amber-50/50" : "bg-emerald-50/50";
                const scoreColor = isOut ? "text-amber-700" : "text-emerald-700";
                const badgeBg = isOut ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300";
                const infoBox = isOut ? "bg-amber-100/70 border-amber-300 text-amber-950" : "bg-emerald-100/70 border-emerald-300 text-emerald-950";

                return (
                  <div className={`bento-card border-2 p-5 space-y-3 transition-all ${cardBorder} ${cardBg}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <span className="card-title font-mono font-black text-xs uppercase tracking-wider block">
                        MCHC (Concentration)
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        32–36 g/dL
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center py-1 space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Exact Reading
                      </span>
                      <div className={`text-5xl font-black font-mono tracking-tight ${scoreColor}`}>
                        {val.toFixed(1)} <span className="text-sm font-sans font-bold text-slate-500">g/dL</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${badgeBg}`}>
                        {results.mchcStatus || (val < 32 ? "Low Concentration (< 32)" : val > 36 ? "High Concentration (> 36)" : "Optimal")}
                      </span>
                      <div className={`p-2.5 rounded-xl border text-xs font-bold leading-relaxed text-center w-full ${infoBox}`}>
                        {results.mchcInterpretation}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 4. RDW Card */}
              {(() => {
                const hasRdw = formData.rdw && !isNaN(parseFloat(formData.rdw));
                const val = hasRdw ? parseFloat(formData.rdw) : 0;
                const isOut = hasRdw && (val > 14.5 || val < 11.5);
                const cardBorder = !hasRdw ? "border-slate-300" : isOut ? "border-rose-300" : "border-emerald-300";
                const cardBg = !hasRdw ? "bg-white" : isOut ? "bg-rose-50/50" : "bg-emerald-50/50";
                const scoreColor = !hasRdw ? "text-slate-400" : isOut ? "text-rose-700" : "text-emerald-700";
                const badgeBg = !hasRdw ? "bg-slate-100 text-slate-700 border border-slate-300" : isOut ? "bg-rose-100 text-rose-900 border border-rose-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300";
                const infoBox = !hasRdw ? "bg-slate-50 border-slate-200 text-slate-700" : isOut ? "bg-rose-100/70 border-rose-300 text-rose-950" : "bg-emerald-100/70 border-emerald-300 text-emerald-950";

                return (
                  <div className={`bento-card border-2 p-5 space-y-3 transition-all ${cardBorder} ${cardBg}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <span className="card-title font-mono font-black text-xs uppercase tracking-wider block">
                        RDW (Size Variation)
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        11.5%–14.5%
                      </span>
                    </div>
                    {hasRdw ? (
                      <div className="flex flex-col items-center justify-center text-center py-1 space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Exact Reading
                        </span>
                        <div className={`text-5xl font-black font-mono tracking-tight ${scoreColor}`}>
                          {val.toFixed(1)} <span className="text-sm font-sans font-bold text-slate-500">%</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${badgeBg}`}>
                          {results.rdwStatus || (val > 14.5 ? "Anisocytosis (> 14.5%)" : "Normal Size Distribution")}
                        </span>
                        <div className={`p-2.5 rounded-xl border text-xs font-bold leading-relaxed text-center w-full ${infoBox}`}>
                          {results.rdwInterpretation}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 py-2">
                        <p className="text-xs font-bold text-slate-600 leading-relaxed">
                          RDW was not provided. Enter RDW % in the form above to evaluate red cell size heterogeneity (anisocytosis) and differentiate iron deficiency from thalassemia trait.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 5. Vitamin B12 Card */}
              {(() => {
                const hasB12 = formData.vitaminB12 && !isNaN(parseFloat(formData.vitaminB12));
                const val = hasB12 ? parseFloat(formData.vitaminB12) : 0;
                const isDeficient = hasB12 && val < 200;
                const isBorderline = hasB12 && val >= 200 && val <= 300;
                const cardBorder = !hasB12 ? "border-slate-300" : isDeficient ? "border-rose-400" : isBorderline ? "border-amber-300" : "border-emerald-300";
                const cardBg = !hasB12 ? "bg-white" : isDeficient ? "bg-rose-50/60" : isBorderline ? "bg-amber-50/50" : "bg-emerald-50/50";
                const scoreColor = !hasB12 ? "text-slate-400" : isDeficient ? "text-rose-700" : isBorderline ? "text-amber-700" : "text-emerald-700";
                const badgeBg = !hasB12 ? "bg-slate-100 text-slate-700 border border-slate-300" : isDeficient ? "bg-rose-100 text-rose-900 border border-rose-300" : isBorderline ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300";
                const infoBox = !hasB12 ? "bg-slate-50 border-slate-200 text-slate-700" : isDeficient ? "bg-rose-100/70 border-rose-300 text-rose-950" : isBorderline ? "bg-amber-100/70 border-amber-300 text-amber-950" : "bg-emerald-100/70 border-emerald-300 text-emerald-950";

                return (
                  <div className={`bento-card border-2 p-5 space-y-3 transition-all sm:col-span-2 lg:col-span-2 ${cardBorder} ${cardBg}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <span className="card-title font-mono font-black text-xs uppercase tracking-wider block">
                        Serum Vitamin B12 (Cobalamin)
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        200–900 pg/mL
                      </span>
                    </div>
                    {hasB12 ? (
                      <div className="flex flex-col items-center justify-center text-center py-1 space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Exact Reading
                        </span>
                        <div className={`text-5xl font-black font-mono tracking-tight ${scoreColor}`}>
                          {val.toFixed(0)} <span className="text-sm font-sans font-bold text-slate-500">pg/mL</span>
                        </div>
                        <span className={`px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${badgeBg}`}>
                          {results.vitaminB12Status || (val < 200 ? "Deficient (< 200 pg/mL)" : val <= 300 ? "Borderline (200-300 pg/mL)" : "Adequate")}
                        </span>
                        <div className={`p-3 rounded-xl border text-xs font-bold leading-relaxed text-center w-full ${infoBox}`}>
                          {results.vitaminB12Interpretation}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 py-2">
                        <p className="text-xs font-bold text-slate-600 leading-relaxed">
                          Serum Vitamin B12 was not provided. Inputting B12 levels confirms or rules out Megaloblastic Macrocytic Anemia and guides neuropathy prevention.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Anemia Morphology Classification & Mentzer Index Card */}
            <div className="p-5 rounded-2xl border-2 border-slate-300 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider font-mono text-slate-800">
                  Nutritional Anemia Vector & Morphological Classification
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                  {results.morphologyClassification || "Standard Morphology"}
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-800 leading-relaxed">
                  {results.morphologyDetails || results.anemiaType || "Normal red cell morphology and indices."}
                </p>
                {results.mentzerIndex !== undefined && (
                  <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-300 text-cyan-950 text-xs font-bold flex items-center justify-between gap-2 flex-wrap">
                    <span><strong>Mentzer Index (MCV / RBC):</strong> {results.mentzerIndex}</span>
                    <span className="text-[11px] font-black bg-cyan-100 px-2 py-0.5 rounded-md border border-cyan-400">
                      {results.mentzerIndex < 13 ? "Mentzer < 13 → Thalassemia Pattern" : "Mentzer ≥ 13 → Iron Deficiency Pattern"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* NLR Card */}
            {(() => {
              const nlrRisk = results.nlratio === undefined
                ? "low"
                : results.nlratio > 3.0
                ? "high"
                : results.nlratio < 1.0
                ? "moderate"
                : "low";

              const theme = nlrRisk === "low"
                ? {
                    cardBorder: "border-emerald-300",
                    cardBg: "bg-emerald-50/50",
                    scoreColor: "text-emerald-700",
                    badgeBg: "bg-emerald-100 text-emerald-900 border border-emerald-300",
                    infoBox: "bg-emerald-100/70 border-emerald-300 text-emerald-950",
                  }
                : nlrRisk === "moderate"
                ? {
                    cardBorder: "border-amber-300",
                    cardBg: "bg-amber-50/50",
                    scoreColor: "text-amber-700",
                    badgeBg: "bg-amber-100 text-amber-900 border border-amber-300",
                    infoBox: "bg-amber-100/70 border-amber-300 text-amber-950",
                  }
                : {
                    cardBorder: "border-rose-300",
                    cardBg: "bg-rose-50/50",
                    scoreColor: "text-rose-700",
                    badgeBg: "bg-rose-100 text-rose-900 border border-rose-300",
                    infoBox: "bg-rose-100/70 border-rose-300 text-rose-950",
                  };

              return (
                <div className={`bento-card border-2 p-5 space-y-3 transition-all ${results.nlratio !== undefined ? `${theme.cardBorder} ${theme.cardBg}` : "border-slate-300 bg-white"}`}>
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <span className="card-title font-mono font-black text-xs uppercase tracking-wider block">
                      Neutrophil-to-Lymphocyte Ratio (NLR)
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 font-mono">
                      Inflammatory Biomarker
                    </span>
                  </div>
                  {results.nlratio !== undefined ? (
                    <div className="flex flex-col items-center justify-center text-center py-2 space-y-2.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Exact Calculated Reading
                      </span>
                      <div className={`text-5xl sm:text-6xl font-black font-mono tracking-tight ${theme.scoreColor}`}>
                        {results.nlratio.toFixed(2)}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${theme.badgeBg}`}>
                        {results.nlratio > 3.0 ? "High Inflammatory Risk (> 3.0)" : results.nlratio < 1.0 ? "Low Ratio (< 1.0)" : "Normal Reference (1.0–3.0)"}
                      </span>
                      <div className={`p-3 rounded-xl border text-xs font-bold leading-relaxed text-center w-full ${theme.infoBox}`}>
                        {results.nlratioInterpretation}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-black glow-red-text flex items-center gap-1">
                        <AlertCircle size={13} className="text-red-600 shrink-0" />
                        <span>NLR Incomplete. Missing required differentials:</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {!formData.neutrophils && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Neutrophils %</span>}
                        {!formData.lymphocytes && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Lymphocytes %</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
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
            <div className="space-y-1 p-4 rounded-2xl border-2 border-slate-300 shadow-xs">
              <span style={{ color: "#065f46" }} className="text-xs uppercase font-black tracking-widest block">
                Local Basic Interpretation (Offline)
              </span>
              <p className="text-xs leading-relaxed font-semibold mt-1 text-justify">
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
                <div className="relative flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-300 rounded-2xl space-y-4">
                  <p className="text-xs text-center font-bold leading-relaxed">
                    Need an deep expert clinical review of potential microcytic/macrocytic anomalies, inflammatory stress markers, or full diagnostic trends with {activeProviderName}?
                  </p>
                  
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border-2 border-slate-300 cursor-pointer select-none max-w-sm text-left transition-colors hover:bg-slate-100">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="cbc-verification-checkbox"
                      className="mt-0.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-600 cursor-pointer bg-white w-4 h-4 shrink-0"
                    />
                    <span className="text-xs leading-normal font-black">
                      I have verified the extracted values against the original report
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleTriggerAiAnalysis}
                    disabled={isAiLoading || !isVerifiedCheck}
                    className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-black transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={13} className={isAiLoading ? "animate-spin" : ""} />
                    <span>Interpret Using AI</span>
                  </button>
                </div>
              )}

              {isAiLoading && (
                <div className="h-28 flex flex-col items-center justify-center space-y-2 rounded-2xl border-2 border-slate-300">
                  <RefreshCw className="animate-spin text-emerald-800" size={24} />
                  <p className="text-xs font-black">Generating expert clinical interpretation with {activeProviderName}...</p>
                </div>
              )}

              {aiError && (
                <div style={{ backgroundColor: "#fef2f2" }} className="p-4 border-2 border-red-300 rounded-2xl space-y-3">
                  <div style={{ color: "#991b1b" }} className="text-xs flex flex-col gap-2 font-bold text-left">
                    <div className="flex items-center gap-1.5 font-black">
                      <AlertCircle size={15} className="shrink-0 text-red-600" />
                      <span>{aiError}</span>
                    </div>
                    {aiErrorStack && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-red-700 font-bold hover:underline">
                          Show Error Trace
                        </summary>
                        <pre className="mt-2 p-2 bg-white border border-red-200 text-red-900 font-mono text-[10px] whitespace-pre-wrap rounded-lg overflow-auto max-h-40 text-left">
                          {aiErrorStack}
                        </pre>
                      </details>
                    )}
                  </div>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-red-200 cursor-pointer select-none max-w-sm text-left">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="cbc-verification-retry-checkbox"
                      className="mt-0.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-600 cursor-pointer bg-white w-4 h-4 shrink-0"
                    />
                    <span className="text-xs leading-normal font-black">
                      I have verified the extracted values against the original report
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleTriggerAiAnalysis}
                    disabled={isAiLoading || !isVerifiedCheck}
                    className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-black uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Retry AI analysis
                  </button>
                </div>
              )}

              {aiInsight && (
                <div className="space-y-2 p-4 border-2 border-slate-300 rounded-2xl shadow-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span style={{ color: "#065f46" }} className="text-xs uppercase font-black tracking-widest block">
                      Clinical AI Analysis ({getProviderDisplayName(aiMeta?.providerUsed || currentProvider)})
                    </span>
                    {aiMeta?.wasFallback && (
                      <span className="text-[10px] bg-amber-100 text-amber-950 border-2 border-amber-400 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider">
                        ⚡ Auto-Switched Agent
                      </span>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed text-justify pr-2 max-h-96 overflow-y-auto font-medium">
                    {aiInsight}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-300 pt-3 text-xs font-bold space-y-1.5 leading-relaxed">
              <p>
                <strong className="font-black">Medical Disclaimer:</strong> Decision-support only. This information should always be analyzed alongside professional clinicians.
              </p>
              <p className="border-l-2 border-emerald-600 pl-2">
                AI-generated interpretation. Not a medical diagnosis. Consult a qualified doctor.
              </p>
            </div>
          </div>

          {/* Save panel */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 border-t border-slate-300 gap-4">
            <span className="text-xs font-bold text-justify">Ensure values are verified before sharing or saving to logs.</span>
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

      {/* PC Webcam Live Photo Capture Modal */}
      <WebcamCaptureModal
        isOpen={isWebcamOpen}
        onClose={() => setIsWebcamOpen(false)}
        onCapture={handleWebcamCapture}
        title="Take CBC Report Photo"
      />
    </div>
  );
}
