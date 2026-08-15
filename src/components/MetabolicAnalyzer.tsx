import React, { useState, useRef, useEffect } from "react";
import { Upload, Save, Check, AlertCircle, RefreshCw, Layers, FileText, X, Plus, Trash2, Sparkles, Cpu, ShieldCheck, Camera } from "lucide-react";
import { MetabolicInputs, MetabolicResults, AnalysisRecord } from "../types";
import { calculateMetabolic } from "../utils/calculations";
import { printClinicalReport } from "../utils/printHelper";
import ScoreGauge from "./ScoreGauge";
import MetricCard from "./MetricCard";
import Tesseract from "tesseract.js";
import { preprocessImageForOcr } from "../utils/ocrPreprocessing";
import { runGeminiAnalyze, runGeminiExtractReport, getProviderDisplayName, isProviderKeyMissing } from "../utils/geminiClient";
import { parseMetabolicReport } from "../utils/labReportParser";
import WebcamCaptureModal from "./WebcamCaptureModal";

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
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isWebcamOpen, setIsWebcamOpen] = useState<boolean>(false);

  const [extractMeta, setExtractMeta] = useState<{ providerUsed?: string; modelUsed?: string; wasFallback?: boolean } | null>(null);

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

  const handleWebcamCapture = (file: File) => {
    const newFiles = [...selectedFiles, file].slice(0, 3);
    setSelectedFiles(newFiles);
    processFilesForOcr(newFiles, "ai");
  };

  const applyMetabolicOcrValues = (parsedData: any) => {
    if (parsedData.patientName) setPatientName(parsedData.patientName);
    if (parsedData.patientGender) handleInputChange("gender", parsedData.patientGender);
    if (parsedData.patientAge) handleInputChange("age", String(parsedData.patientAge));

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
    if (parsedData.urineAlbumin !== undefined) {
      handleInputChange("urineAlbumin", String(parsedData.urineAlbumin));
    }
    if (parsedData.urineCreatinine !== undefined) {
      handleInputChange("urineCreatinine", String(parsedData.urineCreatinine));
    }

    const missing: string[] = [];
    if (parsedData.fastingBloodGlucose === undefined && !formData.fastingBloodGlucose) missing.push("Fasting Blood Glucose");
    if (parsedData.triglycerides === undefined && !formData.triglycerides) missing.push("Triglycerides");
    if (parsedData.hdlCholesterol === undefined && !formData.hdlCholesterol) missing.push("HDL Cholesterol");
    if (parsedData.systolicBp === undefined && !formData.systolicBp) missing.push("Systolic / Diastolic BP");
    if (parsedData.waistCircumference === undefined && !formData.waistCircumference) missing.push("Waist Circumference");
    if (parsedData.urineAcr === undefined && !formData.urineAcr && parsedData.urineAlbumin === undefined) missing.push("Urine ACR");
    if (!parsedData.patientName && !patientName) missing.push("Patient Name");
    setMissingExtractedKeys(missing);
  };

  const processFilesForOcr = async (filesToProcess: File[], mode: "offline" | "ai" = "ai") => {
    if (filesToProcess.length === 0) return;
    setIsOcrLoading(true);
    setOcrError(null);
    setOcrStatusText("Starting biological report scan...");

    try {
      let combinedOcrText = "";

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        setOcrStatusText(`Scanning report page ${i + 1} of ${filesToProcess.length}...`);
        
        const preprocessedImgSrc = await preprocessImageForOcr(file);
        
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

      if (mode === "offline") {
        setOcrStatusText("Parsing clinical fields offline...");
        const parsedData = parseMetabolicReport(combinedOcrText);
        applyMetabolicOcrValues(parsedData);
        setExtractMeta({ providerUsed: "Local Tesseract OCR", modelUsed: "Offline Pattern Parser", wasFallback: false });
      } else {
        setOcrStatusText("Encoding images for Clinical AI Engine...");
        const base64Promises = filesToProcess.map(file => {
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
        setOcrStatusText("Extracting with Clinical Multi-Agent AI...");
        const data = await runGeminiExtractReport(base64Contents, "metabolic", combinedOcrText);
        
        if (data && data.values) {
          applyMetabolicOcrValues(data.values);
          setExtractMeta({
            providerUsed: data.providerUsed,
            modelUsed: data.modelUsed,
            wasFallback: data.wasFallback
          });
        } else {
          throw new Error("The AI model was unable to extract report fields. Please verify image quality.");
        }
      }

      setOcrStatusText(null);
    } catch (err: any) {
      setOcrError(err.message || "Optical character recognition failed. Please upload a high-contrast image or input parameters manually.");
      setOcrStatusText(null);
    } finally {
      setIsOcrLoading(false);
    }
  };

  const handlePopulateSample = () => {
    setFormData({
      gender: "male",
      age: "52",
      diabetes: true,
      fastingBloodGlucose: "138",
      triglycerides: "210",
      hdlCholesterol: "36",
      systolicBp: "142",
      diastolicBp: "92",
      onHypertensionMeds: true,
      urineAcr: "48",
      urineAlbumin: "48",
      urineCreatinine: "100",
      waistCircumference: "106",
    });
    setPatientName("Suresh Kumar");
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
    setCurrentRecordId(null);
  };

  const handleClearAllInputs = () => {
    setFormData({
      gender: "male",
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
    setPatientName("");
    setSelectedFiles([]);
    setMissingExtractedKeys([]);
    setExtractMeta(null);
    setResults(null);
    setAiInsight(null);
    setOcrError(null);
    setIsSaved(false);
    setCurrentRecordId(null);
  };

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

      const provider = localStorage.getItem("selected_ai_provider") || "auto";
      const data = await runGeminiAnalyze("metabolic", basePrompt, provider);

      if (data && data.insight) {
        setAiInsight(data.insight);
        setAiMeta({
          providerUsed: data.providerUsed,
          wasFallback: data.wasFallback,
          modelUsed: data.modelUsed
        });
        
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
      const files = Array.from(e.target.files);
      const newFiles = [...selectedFiles, ...files].slice(0, 3);
      setSelectedFiles(newFiles);
      processFilesForOcr(newFiles);
      // Reset input value so re-uploading the same file works
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6" id="metabolic-analyzer-root">
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
              <span>Feed / Scan Metabolic & ACR Report (Photo or PDF)</span>
            </h4>
            <p className="text-[11px] font-bold mt-0.5 dark:text-slate-200">
              Upload your metabolic or renal urine ACR panel for automated parameter recognition
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
              onClick={() => selectedFiles.length > 0 && processFilesForOcr(selectedFiles, "ai")}
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

      {selectedFiles.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/60 rounded-2xl p-4 text-left space-y-3">
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
                    if (update.length > 0) processFilesForOcr(update, "ai");
                    else setOcrError(null);
                  }}
                  className="text-slate-400 hover:text-red-500 transition-colors p-1"
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
                  onClick={() => processFilesForOcr(selectedFiles, "offline")}
                  className="flex-1 py-1.5 px-3 rounded-lg text-[11px] font-bold uppercase text-white bg-emerald-600 hover:bg-emerald-700 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                  title="Perform local offline text recognition"
                >
                  <Cpu size={12} />
                  <span>Extract Offline</span>
                </button>
                <button
                  type="button"
                  onClick={() => processFilesForOcr(selectedFiles, "ai")}
                  className="flex-1 py-1.5 px-3 rounded-lg text-[11px] font-bold uppercase text-white bg-indigo-600 hover:bg-indigo-700 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                  title="Use advanced intelligence model to extract report values"
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

      {ocrStatusText && (
        <div className="max-w-xs mx-auto flex items-center justify-center gap-2 mt-2 text-[11px] text-indigo-600 dark:text-indigo-400 font-extrabold tracking-wider bg-indigo-500/5 px-2.5 py-1.5 rounded-xl border border-indigo-500/15 animate-pulse">
          <RefreshCw className="animate-spin" size={12} />
          <span>{ocrStatusText.toUpperCase()}</span>
        </div>
      )}

      {ocrError && (
        <div className="max-w-md mx-auto p-3 bg-red-500/5 border border-red-500/10 rounded-xl mt-2 flex items-start gap-2.5 text-left text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <p className="leading-relaxed">{ocrError}</p>
        </div>
      )}


      {/* Input / Calculation form */}
      <form onSubmit={handleCalculate} className="bento-card border-2 border-slate-300 p-6 space-y-6">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="text-base font-black uppercase tracking-wider flex items-center gap-2 font-sans">
            <span className="w-1.5 h-4 bg-indigo-700 rounded-full shrink-0" />
            <span>Patient Demographics & Medical Profiles</span>
            <span style={{ width: "94.2734px" }} />
          </h2>
          <p className="text-xs font-bold mt-1">
            Fill in general demographic profiles or match criteria limits dynamically.
          </p>
        </div>

        {/* Name, Gender, Age Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black tracking-wide block">Patient Name</label>
            <input 
              type="text" 
              placeholder="e.g. Suresh Kumar"
              value={patientName}
              onChange={e => {
                setPatientName(e.target.value);
                setCurrentRecordId(null);
              }}
              className={getNameClass(patientName)} 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black tracking-wide block">Patient Assigned Sex</label>
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
            <label className="text-xs font-black tracking-wide block">Patient Biological Age</label>
            <div className="relative">
              <input 
                type="number" 
                placeholder="45"
                value={formData.age}
                onChange={e => handleInputChange("age", e.target.value)}
                className={getInputClass(formData.age, "pr-12")} 
              />
              <span className="absolute right-3 top-2.5 text-xs font-black">Years</span>
            </div>
          </div>
        </div>

        {/* Input Parameters - METABOLIC SYNDROME */}
        <div className="space-y-4 pt-2">
          <div className="flex justify-between items-center border-b border-slate-200 pb-2">
            <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2 font-sans">
              <span className="w-1.5 h-3 bg-indigo-700 rounded-full shrink-0" />
              <span>Metabolic Syndrome (NCEP ATP III Criteria) Panels</span>
            </h3>
            <span className="text-[10px] bg-slate-200 text-slate-950 px-2.5 py-0.5 rounded font-black uppercase tracking-widest border border-slate-300">
              Standard Indian Lab Units
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black tracking-wide">Waist Circumference</label>
                <span className="text-[10px] text-indigo-700 font-black uppercase">{formData.gender === "female" ? "≤ 88 cm target" : "≤ 102 cm target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder={formData.gender === "female" ? "e.g. 85" : "e.g. 95"}
                  value={formData.waistCircumference}
                  onChange={e => handleInputChange("waistCircumference", e.target.value)}
                  className={getInputClass(formData.waistCircumference, "pr-12")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">cm</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black tracking-wide">Fasting Blood Glucose</label>
                <span className="text-[10px] text-indigo-700 font-black uppercase">{"< 100 mg/dL target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 95"
                  value={formData.fastingBloodGlucose}
                  onChange={e => handleInputChange("fastingBloodGlucose", e.target.value)}
                  className={getInputClass(formData.fastingBloodGlucose, "pr-14")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">mg/dL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black tracking-wide">Serum Triglycerides</label>
                <span className="text-[10px] text-indigo-700 font-black uppercase">{"< 150 mg/dL target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 140"
                  value={formData.triglycerides}
                  onChange={e => handleInputChange("triglycerides", e.target.value)}
                  className={getInputClass(formData.triglycerides, "pr-14")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">mg/dL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black tracking-wide">HDL Cholesterol</label>
                <span className="text-[10px] text-indigo-700 font-black uppercase">{formData.gender === "female" ? "≥ 50 mg/dL target" : "≥ 40 mg/dL target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 45"
                  value={formData.hdlCholesterol}
                  onChange={e => handleInputChange("hdlCholesterol", e.target.value)}
                  className={getInputClass(formData.hdlCholesterol, "pr-14")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">mg/dL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black tracking-wide">Systolic Blood Pressure</label>
                <span className="text-[10px] text-indigo-700 font-black uppercase">{"< 130 mmHg target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 120"
                  value={formData.systolicBp}
                  onChange={e => handleInputChange("systolicBp", e.target.value)}
                  className={getInputClass(formData.systolicBp, "pr-14")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">mmHg</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black tracking-wide">Diastolic Blood Pressure</label>
                <span className="text-[10px] text-indigo-700 font-black uppercase">{"< 85 mmHg target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 80"
                  value={formData.diastolicBp}
                  onChange={e => handleInputChange("diastolicBp", e.target.value)}
                  className={getInputClass(formData.diastolicBp, "pr-14")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">mmHg</span>
              </div>
            </div>
          </div>

          {/* Quick toggle medication status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border-2 border-slate-300 cursor-pointer select-none transition-colors hover:bg-slate-100">
              <input
                type="checkbox"
                checked={formData.onHypertensionMeds}
                onChange={e => handleInputChange("onHypertensionMeds", e.target.checked)}
                className="rounded border-slate-300 text-indigo-700 focus:ring-indigo-500 cursor-pointer w-4 h-4"
              />
              <div className="text-left">
                <span className="text-xs font-black block">Antihypertensive Treatment</span>
                <span className="text-xs font-bold">Mark if patient is on antihypertensive medications</span>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border-2 border-slate-300 cursor-pointer select-none transition-colors hover:bg-slate-100">
              <input
                type="checkbox"
                checked={formData.diabetes}
                onChange={e => handleInputChange("diabetes", e.target.checked)}
                className="rounded border-slate-300 text-indigo-700 focus:ring-indigo-500 cursor-pointer w-4 h-4"
              />
              <div className="text-left">
                <span className="text-xs font-black block">Type 2 Diabetes Staging</span>
                <span className="text-xs font-bold">Mark if patient has a clinical history of Type 2 Diabetes</span>
              </div>
            </label>
          </div>
        </div>

        {/* Albumin to Creatinine Ratio */}
        <div className="space-y-4 pt-2">
          <div className="flex justify-between items-center border-b border-slate-200 pb-2">
            <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2 font-sans">
              <span className="w-1.5 h-3 bg-indigo-700 rounded-full shrink-0" />
              <span>Urine Albumin-to-Creatinine Ratio (Urine ACR)</span>
            </h3>
            <span className="text-[10px] bg-slate-200 text-slate-950 px-2.5 py-0.5 rounded font-black uppercase tracking-widest border border-slate-300">
              Standard Kidney marker
            </span>
          </div>

          {/* Toggle for Direct input vs calculation */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl border-2 border-slate-300 max-w-sm">
            <button
              type="button"
              onClick={() => handleAcrTypeChange("calculate")}
              className={`flex-1 py-1 px-2 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                acrInputType === "calculate"
                  ? "bg-indigo-700 text-white shadow-sm"
                  : "text-slate-700 hover:text-slate-950"
              }`}
            >
              Calculate with Albumin & Creatinine
            </button>
            <button
              type="button"
              onClick={() => handleAcrTypeChange("direct")}
              className={`flex-1 py-1 px-2 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                acrInputType === "direct"
                  ? "bg-indigo-700 text-white shadow-sm"
                  : "text-slate-700 hover:text-slate-950"
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
                    <label className="text-xs font-black tracking-wide">Urine Albumin</label>
                    <span className="text-[10px] text-indigo-700 font-black uppercase">mg/L</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="any"
                      placeholder="e.g. 30"
                      value={formData.urineAlbumin}
                      onChange={e => handleInputChange("urineAlbumin", e.target.value)}
                      className={getInputClass(formData.urineAlbumin, "pr-14")} 
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-black">mg/L</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black tracking-wide">Urine Creatinine</label>
                    <span className="text-[10px] text-indigo-700 font-black uppercase">mg/dL</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="any"
                      placeholder="e.g. 100"
                      value={formData.urineCreatinine}
                      onChange={e => handleInputChange("urineCreatinine", e.target.value)}
                      className={getInputClass(formData.urineCreatinine, "pr-14")} 
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-black">mg/dL</span>
                  </div>
                </div>
              </div>

              {/* Live result displayed underneath */}
              <div className="p-4 bg-slate-50 border-2 border-slate-300 rounded-xl space-y-2 mt-2">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <span className="text-xs font-black uppercase tracking-wider">Urinary ACR Formula Reference</span>
                  <span className="text-xs font-black text-indigo-700 font-mono">ACR (mg/g) = (Albumin [mg/L] / Creatinine [mg/dL]) * 100</span>
                </div>
                
                <div className="flex justify-between items-baseline pt-1">
                  <span className="text-xs font-black">Calculated Urinary ACR:</span>
                  <div className="text-right">
                    {formData.urineAcr ? (
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-indigo-700 font-mono">
                          {formData.urineAcr} <span className="text-xs font-black">mg/g</span>
                        </span>
                        {(() => {
                          const val = parseFloat(formData.urineAcr);
                          if (isNaN(val)) return null;
                          if (val < 30) {
                            return <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-950 uppercase tracking-widest border border-emerald-300">Normal</span>;
                          } else if (val <= 300) {
                            return <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-950 uppercase tracking-widest border border-amber-300">Microalbuminuria</span>;
                          } else {
                            return <span className="text-[10px] font-black px-2 py-0.5 rounded bg-red-100 text-red-950 uppercase tracking-widest border border-red-300">Macroalbuminuria</span>;
                          }
                        })()}
                      </div>
                    ) : (
                      <span className="text-xs italic font-bold">Enter Urine Albumin and Urine Creatinine parameters above</span>
                    )}
                  </div>
                </div>
                {formData.urineAcr && (
                  <p className="text-xs font-bold leading-relaxed border-t border-slate-300 pt-2 mt-1">
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
                <label className="text-xs font-black tracking-wide block">Urine ACR</label>
                <span className="text-[10px] text-indigo-700 font-black uppercase font-mono">{"< 30 mg/g normal excretion target"}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 25"
                  value={formData.urineAcr}
                  onChange={e => handleInputChange("urineAcr", e.target.value)}
                  className={getInputClass(formData.urineAcr, "pr-14")} 
                />
                <span className="absolute right-3 top-2.5 text-xs font-black">mg/g</span>
              </div>
              <p className="text-xs leading-normal font-bold pt-1">
                Used as a primary screening parameter for diabetic nephropathy and systemic cardiovascular vulnerabilities.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-black rounded-xl transition-all duration-300 hover:scale-[1.01] active:scale-95 shadow-md cursor-pointer flex items-center gap-1.5"
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
          <div className="flex justify-between items-center border-b border-slate-300 pb-3 flex-wrap gap-3">
            <div>
              <h2 className="text-base font-black uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-4.5 bg-indigo-700 rounded-full shrink-0" />
                <span>Diagnostic Report Outcomes</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-950 uppercase tracking-widest font-black border border-indigo-300">
                  {results.riskLevel} risk
                </span>
              </h2>
              <p className="text-xs font-bold">Computed patient parameters and multi-panel kidney/cardiovascular assessments.</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="px-4 py-2 border-2 border-slate-300 text-slate-950 hover:bg-slate-100 text-xs font-black rounded-xl transition-all flex items-center gap-1 cursor-pointer"
              >
                <FileText size={13} />
                <span>Print Clinical Report</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaved}
                className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                  isSaved 
                    ? "bg-emerald-100 text-emerald-950 border border-emerald-300" 
                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                }`}
              >
                {isSaved ? <Check size={13} /> : <Save size={13} />}
                <span>{isSaved ? "Saved to History" : "Save Record"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Risk Gauge */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center p-6 border-2 border-slate-300 rounded-3xl min-h-[290px] relative shadow-sm">
              <div className="absolute top-4 left-4">
                <span className="text-[10px] bg-slate-200 text-slate-950 px-2 py-0.5 rounded font-black uppercase tracking-widest border border-slate-300">
                  Aggregated Risk
                </span>
              </div>
              <ScoreGauge score={results.riskLevel === "high" ? 85 : results.riskLevel === "moderate" ? 45 : 15} maxScore={100} label="Patient Risk Scale" riskLevel={results.riskLevel || "low"} />
              <div className="text-center mt-3">
                <h4 className="text-xs font-black uppercase tracking-widest">Composite Patient Status</h4>
                <p className="text-xs font-bold max-w-[200px] leading-relaxed mx-auto mt-1">Based on aggregated visceral criteria (NCEP ATP III) and diabetic nephropathy risk.</p>
              </div>
            </div>

            {/* Assessment Cards */}
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Card A: Metabolic Syndrome Card */}
              {results.ncepMetabolicSyndrome ? (
                <div className="bento-card border-2 border-slate-300 p-5 flex flex-col justify-between shadow-sm">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] bg-indigo-100 text-indigo-950 px-2.5 py-0.5 rounded font-black uppercase tracking-widest block max-w-fit border border-indigo-300">
                          NCEP ATP III Criteria
                        </span>
                        <h4 className="text-sm font-black mt-2 flex items-center gap-1.5 font-sans">
                          <span className="w-1 h-3 bg-indigo-700 rounded-full shrink-0" />
                          <span>Visceral Core Parameters</span>
                        </h4>
                      </div>
                      <span className="text-xs font-black">Score: <strong className="text-indigo-700">{results.ncepMetabolicSyndrome.count} / 5</strong></span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="text-xs font-black flex items-center gap-1">
                        <Check size={14} className={results.ncepMetabolicSyndrome.met ? "text-red-600" : "text-emerald-600"} />
                        <span>{results.ncepMetabolicSyndrome.conclusion}</span>
                      </div>

                      <div className="pt-2 border-t border-slate-200 space-y-1.5">
                        {results.ncepMetabolicSyndrome.criteriaMet.length > 0 && (
                          <div>
                            <span className="text-[10px] font-black text-red-600 uppercase tracking-wider block">Satisfied Risks:</span>
                            <ul className="list-disc pl-3 text-xs text-red-800 leading-relaxed font-bold">
                              {results.ncepMetabolicSyndrome.criteriaMet.map((c: string, idx: number) => (
                                <li key={idx}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {results.ncepMetabolicSyndrome.criteriaNotMet.length > 0 && (
                          <div>
                            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">Not Satisfied Risks:</span>
                            <ul className="list-disc pl-3 text-xs leading-relaxed font-bold">
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
                <div className="bento-card border-2 border-slate-300 p-5 space-y-2">
                  <span className="card-title font-mono font-black text-xs uppercase tracking-wider block">Metabolic Syndrome (NCEP ATP III)</span>
                  <p className="text-xs font-black glow-red-text flex items-center gap-1">
                    <AlertCircle size={13} className="text-red-600 shrink-0" />
                    <span>Incomplete. Missing required metabolic inputs:</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {!formData.fastingBloodGlucose && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Fasting Glucose</span>}
                    {!formData.triglycerides && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Triglycerides</span>}
                    {!formData.hdlCholesterol && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● HDL Cholesterol</span>}
                    {!formData.systolicBp && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Blood Pressure</span>}
                    {!formData.waistCircumference && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Waist Circumference</span>}
                  </div>
                </div>
              )}

              {/* Card B: Kidney Risk Albumin to Creatinine Ratio Assessment Card */}
              {results.acrAssessment ? (
                <div className="bento-card border-2 border-slate-300 p-5 flex flex-col justify-between shadow-sm">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] bg-indigo-100 text-indigo-950 px-2.5 py-0.5 rounded font-black uppercase tracking-widest block max-w-fit border border-indigo-300">
                          Kidney Risk Assessment
                        </span>
                        <h4 className="text-sm font-black mt-2">Urine Albumin-to-Creatinine</h4>
                      </div>
                      <span className="font-mono text-xs font-black">Val: <strong className="text-indigo-700">{results.acrAssessment.value} mg/g</strong></span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest block">Urine ACR Category</span>
                        <span className="text-xs font-black leading-normal">{results.acrAssessment.category.toUpperCase()}</span>
                      </div>
                      
                      <p className="text-xs leading-normal font-bold">{results.acrAssessment.description}</p>
                      
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest block">Clinical Correlation</span>
                        <p className="text-xs font-bold leading-relaxed text-justify mt-1">{results.acrAssessment.clinicalSignificance}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bento-card border-2 border-slate-300 p-5 space-y-2">
                  <span className="card-title font-mono font-black text-xs uppercase tracking-wider block">Kidney Risk Assessment (Urine ACR)</span>
                  <p className="text-xs font-black glow-red-text flex items-center gap-1">
                    <AlertCircle size={13} className="text-red-600 shrink-0" />
                    <span>Incomplete. Urine ACR parameter not supplied:</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Urine ACR (mg/g) / Albumin & Creatinine</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Clinical Insights Panel (Local & AI) */}
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

            {/* Offline Summary */}
            <div className="space-y-1 p-4 rounded-2xl border-2 border-slate-300 shadow-xs">
              <span style={{ color: "#065f46" }} className="text-xs uppercase font-black tracking-widest block">
                Local Basic Interpretation (Offline)
              </span>
              <p className="text-xs leading-relaxed font-semibold mt-1 text-justify">
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
                <div className="relative flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-300 rounded-2xl space-y-4">
                  <p className="text-xs text-center font-bold leading-relaxed">
                    Need a deep expert clinical review of potential visceral anomalies, hypertension patterns, or full microalbuminuria and cardiovascular trends with {activeProviderName}?
                  </p>
                  
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border-2 border-slate-300 cursor-pointer select-none max-w-sm text-left transition-colors hover:bg-slate-100">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="meta-verification-checkbox"
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
                  <p style={{ color: "#991b1b" }} className="text-xs flex items-center gap-1.5 font-black">
                    <AlertCircle size={15} className="text-red-600" />
                    <span>{aiError}</span>
                  </p>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-red-200 cursor-pointer select-none max-w-sm text-left">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="meta-verification-retry-checkbox"
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
                    className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-black uppercase transition-colors"
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
                * AI insights are dynamically fetched from the chosen medical model. This analysis incorporates patient parameters like systolic/diastolic blood pressure, microalbuminuria, lipid/triglyceride ratios, and historical clinical data recursively.
              </p>
              <p className="border-l-2 border-l-amber-600 pl-2">
                Disclaimer: AI-generated interpretations and evaluations of Metabolic Syndrome and diabetic kidney risk parameters are provided solely for educational and diagnostic-support purposes. They must be correlated clinically by a licensed physician and do not replace professional medical consultations.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PC Webcam Live Photo Capture Modal */}
      <WebcamCaptureModal
        isOpen={isWebcamOpen}
        onClose={() => setIsWebcamOpen(false)}
        onCapture={handleWebcamCapture}
        title="Take Metabolic / ACR Report Photo"
      />
    </div>
  );
}
