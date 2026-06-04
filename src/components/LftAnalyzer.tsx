import React, { useState, useRef } from "react";
import { Upload, HelpCircle, Save, FileText, Check, AlertCircle, RefreshCw, Layers, X, Plus, Trash2, Sparkles, Cpu } from "lucide-react";
import { LFTInputs, LFTResults, RiskLevel, AnalysisRecord } from "../types";
import { calculateLFT } from "../utils/calculations";
import { printClinicalReport } from "../utils/printHelper";
import ScoreGauge from "./ScoreGauge";
import MetricCard from "./MetricCard";
import Tesseract from "tesseract.js";
import { preprocessImageForOcr } from "../utils/ocrPreprocessing";
import { parseLftReport } from "../utils/labReportParser";

function getOfflineLftSummary(inputs: LFTInputs, results: LFTResults): string {
  if (results.nafldRisk === "low" && results.fibrosisScore < 1.3) {
    return "Normal liver profile with Low Risk status. Liver clearance enzymes ALT and AST are within acceptable standard ranges, suggesting negligible active fat deposit accumulation or hepatic cell inflammation. Continue standard wellness maintenance.";
  }
  
  const segments: string[] = [];
  
  // NAFLD/liver pattern evaluation
  if (results.nafldRisk === "critical") {
    segments.push("Critical NAFLD risk pattern. Severely elevated liver enzymes ALT/AST indicate intense hepatocellular injury or cell clearing. Steatohepatitis (MASH) or chronic liver injury highly suspected.");
  } else if (results.nafldRisk === "high") {
    segments.push("Possible fatty liver/NAFLD pattern with High Risk status active. Significant enzyme elevations suggest active steatosis coupled with potential cellular irritation.");
  } else if (results.nafldRisk === "moderate") {
    segments.push("Possible fatty liver/NAFLD pattern with Moderate Risk status. Mild hepatocellular load spotted, recommending metabolic checkup or active lifestyle amendments.");
  } else {
    segments.push("Normal liver profile under low metabolo-hepatic load.");
  }

  // AST/ALT (De Ritis ratio) & Fib-4 fibrosis evaluation
  if (results.fib4Score !== undefined) {
    if (results.fib4Risk === "high") {
      segments.push(`Fibrosis triage indexes (FIB-4: ${results.fib4Score}) indicate High Risk configuration for advanced fibrosis (F3-F4).`);
    } else if (results.fib4Risk === "moderate") {
      segments.push(`Fibrosis indicators (FIB-4: ${results.fib4Score}) suggest indeterminate moderate risk; non-invasive clinic checks are advisable.`);
    } else {
      segments.push("No significant active fibrosis trends spotted from indices (F0-F1 range).");
    }
  }

  if (results.astAltRatio > 1.5) {
    segments.push("Elevated AST/ALT Ratio signifies potential alcoholic or systemic tissue strain contribution.");
  }

  if (inputs.diabetes) {
    segments.push("Metabolic progression hazard is elevated due to concurrent Type 2 Diabetes status.");
  }

  // Metabolic syndrome criteria
  if (results.ncepMetabolicSyndrome) {
    if (results.ncepMetabolicSyndrome.met) {
      segments.push(`NCEP ATP III assessment indicates active Metabolic Syndrome (${results.ncepMetabolicSyndrome.count}/5 factors met), amplifying cardiovascular and hepatic risk profiles.`);
    } else if (results.ncepMetabolicSyndrome.count > 0) {
      segments.push(`Partial metabolic strain observed (${results.ncepMetabolicSyndrome.count}/5 factors).`);
    }
  }

  // Kidney Albuminuria indicators
  if (results.acrAssessment) {
    if (results.acrAssessment.value >= 30) {
      segments.push(`Urinary Albumin-Creatinine Ratio (ACR) of ${results.acrAssessment.value} mg/g indicates elevated micro/macroalbuminuria, signifying metabolic nephrological stress limits.`);
    } else {
      segments.push(`Normal renal albumin filtration confirmed (ACR: ${results.acrAssessment.value} mg/g).`);
    }
  }

  return segments.join(" ");
}

interface LftAnalyzerProps {
  onAddRecord: (record: Omit<AnalysisRecord, "id" | "date"> & { id?: string }) => void;
}

export default function LftAnalyzer({ onAddRecord }: LftAnalyzerProps) {
  // Inputs
  const [formData, setFormData] = useState({
    alt: "",
    ast: "",
    alp: "",
    ggt: "",
    totalBilirubin: "",
    directBilirubin: "",
    albumin: "",
    totalProtein: "",
    inr: "",
    platelets: "",
    age: "45",
    astUln: "40",
    weight: "",
    height: "",
    diabetes: false,
    fastingBloodGlucose: "",
    triglycerides: "",
    hdlCholesterol: "",
    systolicBp: "",
    diastolicBp: "",
    onHypertensionMeds: false,
    urineAcr: "",
    waistCircumference: "",
  });

  // Results
  const [results, setResults] = useState<LFTResults | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrStatusText, setOcrStatusText] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientGender, setPatientGender] = useState<"male" | "female">("male");
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [isVerifiedCheck, setIsVerifiedCheck] = useState(false);
  const [metabolicPanelOpen, setMetabolicPanelOpen] = useState(false);

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
  
  // Drag and drop State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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

  const getLftInputs = (): LFTInputs => {
    return {
      alt: parseFloat(formData.alt) || 0,
      ast: parseFloat(formData.ast) || 0,
      alp: formData.alp ? parseFloat(formData.alp) : undefined,
      ggt: formData.ggt ? parseFloat(formData.ggt) : undefined,
      totalBilirubin: parseFloat(formData.totalBilirubin) || 0,
      directBilirubin: formData.directBilirubin ? parseFloat(formData.directBilirubin) : undefined,
      albumin: parseFloat(formData.albumin) || 0,
      totalProtein: formData.totalProtein ? parseFloat(formData.totalProtein) : undefined,
      inr: formData.inr ? parseFloat(formData.inr) : undefined,
      platelets: formData.platelets ? parseFloat(formData.platelets) : undefined,
      age: formData.age ? parseFloat(formData.age) : undefined,
      astUln: formData.astUln ? parseFloat(formData.astUln) : undefined,
      weight: formData.weight ? parseFloat(formData.weight) : undefined,
      height: formData.height ? parseFloat(formData.height) : undefined,
      diabetes: formData.diabetes,
      gender: patientGender,
      fastingBloodGlucose: formData.fastingBloodGlucose ? parseFloat(formData.fastingBloodGlucose) : undefined,
      triglycerides: formData.triglycerides ? parseFloat(formData.triglycerides) : undefined,
      hdlCholesterol: formData.hdlCholesterol ? parseFloat(formData.hdlCholesterol) : undefined,
      systolicBp: formData.systolicBp ? parseFloat(formData.systolicBp) : undefined,
      diastolicBp: formData.diastolicBp ? parseFloat(formData.diastolicBp) : undefined,
      onHypertensionMeds: formData.onHypertensionMeds,
      urineAcr: formData.urineAcr ? parseFloat(formData.urineAcr) : undefined,
      waistCircumference: formData.waistCircumference ? parseFloat(formData.waistCircumference) : undefined,
    };
  };

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Core validations
    if (!formData.alt || !formData.ast || !formData.totalBilirubin || !formData.albumin) {
      alert("Missing Core Indicators – ALT, AST, Total Bilirubin, and Albumin are required for scoring.");
      return;
    }

    const inputs = getLftInputs();
    const calculated = calculateLFT(inputs);
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
      type: "lft",
      title: `LFT Screening (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: patientGender,
      patientAge: formData.age ? parseInt(formData.age) : undefined,
      inputs,
      results: calculated,
      riskLevel: calculated.nafldRisk,
    });
  };

  const handleTriggerAiAnalysis = () => {
    if (!results || !currentRecordId) return;

    if (isAiLoading) return; // Prevent repeated rapid requests

    if (!navigator.onLine) {
        setAiError("You appear to be offline. Please connect to the internet to use AI diagnostics.");
        return;
    }

    const inputs = getLftInputs();
    requestAiInsight(inputs, results, currentRecordId);
  };

  const requestAiInsight = async (inputs: LFTInputs, calculated: LFTResults, recordId: string) => {
    setIsAiLoading(true);
    setAiError(null);

    try {
      const prompt = `Interpret the following Patient Liver Function Test and Metabolic/Kidney results:
- ALT: ${inputs.alt} U/L (Reference: 7-56)
- AST: ${inputs.ast} U/L (Reference: 10-40)
- ALP: ${inputs.alp ?? "N/A"} U/L (Reference: 44-147)
- GGT: ${inputs.ggt ?? "N/A"} U/L (Reference: 8-61)
- Total Bilirubin: ${inputs.totalBilirubin} mg/dL (Reference: 0.1-1.2)
- Direct Bilirubin: ${inputs.directBilirubin ?? "N/A"} mg/dL (Reference: 0-0.3)
- Albumin: ${inputs.albumin} g/dL (Reference: 3.5-5.0)
- Total Protein: ${inputs.totalProtein ?? "N/A"} g/dL (Reference: 6.0-8.3)
- INR: ${inputs.inr ?? "N/A"} (Reference: 0.8-1.2)
- Platelets: ${inputs.platelets !== undefined ? `${inputs.platelets} ×10⁹/L (${(inputs.platelets / 100).toFixed(2)} lakh/µL)` : "N/A"}
- Patient Age: ${inputs.age ?? "N/A"}
- Diabetes Status: ${inputs.diabetes ? "Diagnosed Type 2 Diabetes" : "No Known Diabetes History"}

Patient Metabolic Indicators (for Metabolic Syndrome NCEP ATP III Evaluation):
- Waist Circumference: ${inputs.waistCircumference !== undefined ? `${inputs.waistCircumference} cm` : "N/A"}
- Triglycerides: ${inputs.triglycerides !== undefined ? `${inputs.triglycerides} mg/dL` : "N/A"}
- HDL Cholesterol: ${inputs.hdlCholesterol !== undefined ? `${inputs.hdlCholesterol} mg/dL` : "N/A"}
- Blood Pressure: ${inputs.systolicBp !== undefined ? `${inputs.systolicBp}/${inputs.diastolicBp} mmHg` : "N/A"}
- Hypertension Meds: ${inputs.onHypertensionMeds ? "Yes" : "No"}
- Fasting Blood Glucose: ${inputs.fastingBloodGlucose !== undefined ? `${inputs.fastingBloodGlucose} mg/dL` : "N/A"}

Patient Urine ACR (Urine Albumin-Creatinine Ratio):
- Urine ACR: ${inputs.urineAcr !== undefined ? `${inputs.urineAcr} mg/g` : "N/A"}

Calculated Medical Indexes:
- NAFLD Activity Score: ${calculated.nafldScore}/9 (Risk level: ${calculated.nafldRisk})
- AST/ALT Ratio (De Ritis): ${calculated.astAltRatio}
- FIB-4 Score: ${calculated.fib4Score ?? "N/A"} (${calculated.fib4Interpretation ?? "N/A"})
- APRI Score: ${calculated.apriScore ?? "N/A"} (${calculated.apriInterpretation ?? "N/A"})
- BARD Risk: ${calculated.bardRisk ?? "N/A"}
- MELD Score: ${calculated.meldScore ?? "N/A"}
- Child-Pugh Class: ${calculated.childPughClass ?? "N/A"}

Offline Metabolic & Kidney Assessments:
- NCEP ATP III Metabolic Syndrome Assessment: ${calculated.ncepMetabolicSyndrome ? calculated.ncepMetabolicSyndrome.conclusion : "Insufficient Data"}
- Urine ACR Category: ${calculated.acrAssessment ? calculated.acrAssessment.category : "Insufficient Data"}

Please write a comprehensive, expert clinical interpretation of these results formatted exactly according to the Indian report standards:
1. Key Laboratory Findings
2. Liver Function Summary
3. Fibrosis and Liver Risk Scores (Explain each with its FULL NAME, value, risk category, and clinical interpretation)
4. Metabolic Syndrome Assessment (NCEP ATP III evaluation - listing criteria met and criteria not met, final conclusion)
5. Kidney Risk Assessment (interpreting Urine ACR if available - <30, 30-300, >300 mg/g, or specifying if insufficient data)
6. Clinical Interpretation
7. Suggested Follow-Up Discussions With Healthcare Provider
8. Disclaimer

Remember to maintain evidence-based medical terminology suited for RMPs and patient-friendly explanations. State that AI support is for educational purposes. Prefer Indian lab units and platelet formats in any metric discussions.`;

      const provider = localStorage.getItem("selected_ai_provider") || "gemini";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      
      const geminiKey = localStorage.getItem("user_gemini_api_key") || "";
      const groqKey = localStorage.getItem("user_groq_api_key") || "";
      const openrouterKey = localStorage.getItem("user_openrouter_api_key") || "";
      const openaiKey = localStorage.getItem("user_openai_api_key") || "";
      const claudeKey = localStorage.getItem("user_claude_api_key") || "";
      const deepseekKey = localStorage.getItem("user_deepseek_api_key") || "";

      if (geminiKey) headers["x-user-gemini-api-key"] = geminiKey;
      if (groqKey) headers["x-user-groq-api-key"] = groqKey;
      if (openrouterKey) headers["x-user-openrouter-api-key"] = openrouterKey;
      if (openaiKey) headers["x-user-openai-api-key"] = openaiKey;
      if (claudeKey) headers["x-user-claude-api-key"] = claudeKey;
      if (deepseekKey) headers["x-user-deepseek-api-key"] = deepseekKey;

      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify({ analysisType: "lft", prompt, provider }),
      });

      const data = await response.json();
      if (response.ok && data.insight) {
        setAiInsight(data.insight);
        
        // Dynamically update the newly generated record inside history to reflect current AiInsight
        onAddRecord({
          id: recordId,
          type: "lft",
          title: `LFT Screening (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
          patientName: patientName || "Not Specified",
          patientGender: patientGender,
          patientAge: formData.age ? parseInt(formData.age) : undefined,
          inputs,
          results: calculated,
          aiInsight: data.insight,
          riskLevel: calculated.nafldRisk,
        });
      } else {
        setAiError(data.error || "Failed to generate Clinical AI Analysis");
      }
    } catch (err) {
      setAiError("Connection to AI engine failed. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSave = () => {
    if (!results) return;

    onAddRecord({
      id: currentRecordId || undefined,
      type: "lft",
      title: `LFT Screening (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: patientGender,
      patientAge: formData.age ? parseInt(formData.age) : undefined,
      inputs: getLftInputs(),
      results,
      aiInsight: aiInsight || undefined,
      riskLevel: results.nafldRisk,
    });
    setIsSaved(true);
  };

  const handlePrintPDF = () => {
    if (!results) return;
    printClinicalReport({
      type: "lft",
      title: `LFT Screening (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      patientName: patientName || "Not Specified",
      patientGender: patientGender,
      patientAge: formData.age ? parseInt(formData.age) : undefined,
      inputs: getLftInputs(),
      results,
      aiInsight: aiInsight || undefined,
      riskLevel: results.nafldRisk,
    });
  };

  const applyLftOcrValues = (vals: any) => {
    if (vals.patientName) {
      setPatientName(vals.patientName);
    }
    if (vals.patientGender) {
      setPatientGender(vals.patientGender);
    }
    setFormData(prev => ({
      ...prev,
      alt: vals["ALT"] !== undefined ? String(vals["ALT"]) : prev.alt,
      ast: vals["AST"] !== undefined ? String(vals["AST"]) : prev.ast,
      alp: vals["ALP"] !== undefined ? String(vals["ALP"]) : prev.alp,
      ggt: vals["GGT"] !== undefined ? String(vals["GGT"]) : prev.ggt,
      totalBilirubin: vals["Total Bilirubin"] !== undefined ? String(vals["Total Bilirubin"]) : prev.totalBilirubin,
      directBilirubin: vals["Direct Bilirubin"] !== undefined ? String(vals["Direct Bilirubin"]) : prev.directBilirubin,
      albumin: vals["Albumin"] !== undefined ? String(vals["Albumin"]) : prev.albumin,
      totalProtein: vals["Total Protein"] !== undefined ? String(vals["Total Protein"]) : prev.totalProtein,
      inr: vals["INR"] !== undefined ? String(vals["INR"]) : prev.inr,
      platelets: vals["Platelets"] !== undefined ? String(vals["Platelets"]) : prev.platelets,
      age: vals.patientAge !== undefined ? String(vals.patientAge) : prev.age,
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
        const extracted = parseLftReport(aggregatedText);

        // Simple validation: check if we found anything at all
        const foundValues = Object.keys(extracted).filter(k => k !== "patientName" && k !== "patientGender" && k !== "patientAge");
        if (foundValues.length === 0 && !extracted.patientName) {
          throw new Error("Unable to identify clinical metrics locally. Try adjusting threshold/contrast or use 'AI to Extract' for advanced recognition.");
        }

        // Apply values
        applyLftOcrValues(extracted);
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
        const userApiKey = localStorage.getItem("user_gemini_api_key") || "";
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (userApiKey) {
          headers["x-user-gemini-api-key"] = userApiKey;
        }

        const response = await fetch("/api/gemini/extract-report", {
          method: "POST",
          headers,
          body: JSON.stringify({
            imagesBase64: base64Contents,
            reportType: "lft",
          }),
        });

        const data = await response.json();
        
        if (response.ok && data.values) {
          applyLftOcrValues(data.values);
        } else {
          throw new Error(data.error || "The AI model was unable to extract report fields. Please verify image quality.");
        }
      }
    } catch (err: any) {
      console.error(`${mode.toUpperCase()} extraction error:`, err);
      setOcrError(err.message || `An error occurred during ${mode} report extraction.`);
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

  // Populate sample report to let them test effortlessly
  const handlePopulateSample = () => {
    setFormData({
      alt: "68",
      ast: "46",
      alp: "135",
      ggt: "51",
      totalBilirubin: "1.1",
      directBilirubin: "0.3",
      albumin: "4.1",
      totalProtein: "7.1",
      inr: "1.1",
      platelets: "185",
      age: "52",
      astUln: "40",
      weight: "82",
      height: "174",
      diabetes: true,
      fastingBloodGlucose: "112",
      triglycerides: "185",
      hdlCholesterol: "38",
      systolicBp: "135",
      diastolicBp: "88",
      onHypertensionMeds: false,
      urineAcr: "42",
      waistCircumference: "105",
    });
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
  };

  const handleClearAllInputs = () => {
    setFormData({
      alt: "",
      ast: "",
      alp: "",
      ggt: "",
      totalBilirubin: "",
      directBilirubin: "",
      albumin: "",
      totalProtein: "",
      inr: "",
      platelets: "",
      age: "45",
      astUln: "40",
      weight: "",
      height: "",
      diabetes: false,
      fastingBloodGlucose: "",
      triglycerides: "",
      hdlCholesterol: "",
      systolicBp: "",
      diastolicBp: "",
      onHypertensionMeds: false,
      urineAcr: "",
      waistCircumference: "",
    });
    setPatientName("");
    setPatientGender("male");
    setSelectedFiles([]);
    setOcrError(null);
    setResults(null);
    setAiInsight(null);
    setIsSaved(false);
    setIsVerifiedCheck(false);
  };

  return (
    <div className="space-y-6">
      {/* OCR Drag and Drop Workspace */}
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
            title="Upload Report Photo"
          >
            {isOcrLoading ? (
              <RefreshCw className="animate-spin" size={24} />
            ) : (
              <Upload size={24} className="group-hover:-translate-y-0.5 transition-transform duration-300" />
            )}
          </button>
          
          <div>
            <h3 className="text-sm font-bold text-slate-905 dark:text-white">
              {isOcrLoading ? "Ingesting Report & running OCR..." : "Import Lab Report Photos (up to 3 Pages)"}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Drag & drop up to 3 liver function lab report image pages here, or{" "}
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
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 p-2 rounded-xl border border-red-100 dark:border-red-500/20 inline-flex items-center gap-1">
              <AlertCircle size={12} />
              <span>{ocrError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Manual Input Workspace */}
      <form onSubmit={handleCalculate} className="bento-card dark:bg-slate-800 space-y-6">
        <div>
          <h3 className="text-base font-extrabold text-slate-955 dark:text-white uppercase tracking-wider flex items-center gap-2 font-sans mb-1">
            <span className="w-1.5 h-4.5 bg-emerald-500 rounded-full shrink-0" />
            <span>Patient & Analytical Core Parameters</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-300 font-medium">Incorporate patient demographics and clinical parameters evaluated during full liver screening cycles.</p>
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
                onClick={() => setPatientGender("male")}
                className={`flex-1 py-1 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  patientGender === "male"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              >
                Male
              </button>
              <button
                type="button"
                onClick={() => setPatientGender("female")}
                className={`flex-1 py-1 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  patientGender === "female"
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
                className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-100/10 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:ring-1 focus:ring-indigo-500" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">Years</span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Biological Core Markers</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">ALT / SGPT <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="7-56"
                value={formData.alt}
                onChange={e => handleInputChange("alt", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">U/L</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">AST / SGOT <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="10-40"
                value={formData.ast}
                onChange={e => handleInputChange("ast", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">U/L</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Total Bilirubin <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="0.1-1.2"
                value={formData.totalBilirubin}
                onChange={e => handleInputChange("totalBilirubin", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">mg/dL</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Albumin <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="3.5-5.0"
                value={formData.albumin}
                onChange={e => handleInputChange("albumin", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">g/dL</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-50 dark:border-slate-700/30 pt-6">
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide mb-4">Additional Screening Elements</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">ALP (Alk. Phosphatase)</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="44-147"
                  value={formData.alp}
                  onChange={e => handleInputChange("alp", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">U/L</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">GGT (Gamma-Glutamyl)</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="8-61"
                  value={formData.ggt}
                  onChange={e => handleInputChange("ggt", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">U/L</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Direct Bilirubin</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="0.0-0.3"
                  value={formData.directBilirubin}
                  onChange={e => handleInputChange("directBilirubin", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">mg/dL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Total Protein</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="6.0-8.3"
                  value={formData.totalProtein}
                  onChange={e => handleInputChange("totalProtein", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">g/dL</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-50 dark:border-slate-700/30 pt-6">
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide mb-4">Metadata & Demographic Inputs (FIB-4 & BARD)</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Patient Age</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="45"
                  value={formData.age}
                  onChange={e => handleInputChange("age", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">yrs</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Platelets</label>
              <div className="relative">
                <input 
                  type="number" 
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
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Weight (for BMI)</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="kg"
                  value={formData.weight}
                  onChange={e => handleInputChange("weight", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">kg</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Height (for BMI)</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="cm"
                  value={formData.height}
                  onChange={e => handleInputChange("height", e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500" 
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">cm</span>
              </div>
            </div>
          </div>

          <div className="pt-4 flex flex-wrap gap-4 items-center">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 tracking-wide block">AST ULN (Lab Limit)</label>
              <input 
                type="number" 
                value={formData.astUln}
                onChange={e => handleInputChange("astUln", e.target.value)}
                className="w-24 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 font-mono focus:outline-emerald-500" 
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input 
                type="checkbox" 
                checked={formData.diabetes}
                onChange={e => handleInputChange("diabetes", e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
              />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Patient has Type 2 Diabetes (+1 point to BARD)
              </span>
            </label>
          </div>
        </div>

        {/* Metabolic & Kidney Function Panel */}
        <div className="border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 space-y-4">
          <button
            type="button"
            onClick={() => setMetabolicPanelOpen(!metabolicPanelOpen)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-850 dark:text-slate-200">
                Metabolic & Kidney Panel (Optional)
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                Analyze metabolic syndrome risk (NCEP ATP III) & renal health staging (Urine ACR)
              </p>
            </div>
            <div className="text-slate-400">
              {metabolicPanelOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </div>
          </button>

          {metabolicPanelOpen && (
            <div className="pt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-left border-t border-slate-50 dark:border-slate-850/40">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Waist Circumference</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 94"
                    value={formData.waistCircumference}
                    onChange={e => handleInputChange("waistCircumference", e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10 font-mono focus:outline-emerald-500"
                  />
                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">cm</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Fasting Blood Glucose</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 98"
                    value={formData.fastingBloodGlucose}
                    onChange={e => handleInputChange("fastingBloodGlucose", e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:outline-emerald-500"
                  />
                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">mg/dL</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Triglycerides</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 145"
                    value={formData.triglycerides}
                    onChange={e => handleInputChange("triglycerides", e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:outline-emerald-500"
                  />
                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">mg/dL</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 tracking-wide block">HDL Cholesterol</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 45"
                    value={formData.hdlCholesterol}
                    onChange={e => handleInputChange("hdlCholesterol", e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:outline-emerald-500"
                  />
                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">mg/dL</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Systolic BP</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 120"
                    value={formData.systolicBp}
                    onChange={e => handleInputChange("systolicBp", e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:outline-emerald-500"
                  />
                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">mmHg</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Diastolic BP</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 80"
                    value={formData.diastolicBp}
                    onChange={e => handleInputChange("diastolicBp", e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:outline-emerald-500"
                  />
                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">mmHg</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 tracking-wide block">Urine ACR (Microalbuminuria)</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 24"
                    value={formData.urineAcr}
                    onChange={e => handleInputChange("urineAcr", e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-12 font-mono focus:outline-emerald-500"
                  />
                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">mg/g</span>
                </div>
              </div>

              <div className="lg:col-span-2 flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.onHypertensionMeds}
                    onChange={e => handleInputChange("onHypertensionMeds", e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Patient is on active treatment for systemic hypertension
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Clinical Safety Verification Checkbox */}
        <div className="bg-slate-900/40 dark:bg-slate-900/60 border border-slate-850 dark:border-slate-800 rounded-2xl p-4 flex items-start gap-4 select-none my-2 text-left">
          <input
            type="checkbox"
            checked={isVerifiedCheck}
            onChange={(e) => setIsVerifiedCheck(e.target.checked)}
            id="lft-verification-calc-checkbox"
            className="mt-0.5 rounded border-slate-700 text-emerald-650 dark:text-emerald-500 focus:ring-emerald-555 focus:ring-emerald-500 cursor-pointer bg-slate-950 border-slate-800 w-4 h-4 shrink-0"
          />
          <div className="space-y-1">
            <label htmlFor="lft-verification-calc-checkbox" className="text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer leading-tight block">
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
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/10 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:scale-100"
        >
          <span>Calculate All Hepatic Scores</span>
        </button>
      </form>

      {/* Results panel */}
      {results && (
        <div className="space-y-6 pt-2">
          {/* Main Risk Bracket */}
          <ScoreGauge 
            label="NAFLD Scoring Index"
            score={results.nafldScore}
            maxScore={9}
            riskLevel={results.nafldRisk}
          />
          
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            {results.nafldDescription}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard 
              label="ALT / SGPT"
              value={parseFloat(formData.alt)}
              unit="U/L"
              minNormal={7}
              maxNormal={56}
              description="Primary indicator of active hepatic cellular injury."
            />

            <MetricCard 
              label="AST / SGOT"
              value={parseFloat(formData.ast)}
              unit="U/L"
              minNormal={10}
              maxNormal={40}
              description="Enzyme released during cardiovascular or hepatological stress."
            />

            <MetricCard 
              label="Total Bilirubin"
              value={parseFloat(formData.totalBilirubin)}
              unit="mg/dL"
              minNormal={0.1}
              maxNormal={1.2}
              description="Evaluates baseline clear pathway of liver filtration."
            />
          </div>

          {/* Advanced scoring metrics */}
          <div className="bento-card dark:bg-slate-800 space-y-4 p-6">
            <h4 className="text-sm font-extrabold text-slate-955 dark:text-white flex items-center gap-2 uppercase tracking-wide font-sans">
              <span className="w-1.5 h-3.5 bg-emerald-500 rounded-full shrink-0" />
              <span>Advanced Clinical Risk Indexes</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* FIB-4 Card */}
              <div className="bento-card dark:bg-slate-905 p-5 space-y-2">
                <span className="card-title">FIB-4 Index (Fibrosis Triage)</span>
                {results.fib4Score !== undefined ? (
                  <div>
                    <div className={`score-big ${
                      results.fib4Risk === "low" 
                        ? "text-emerald-600 dark:text-emerald-400" 
                        : results.fib4Risk === "moderate" 
                          ? "text-amber-500 dark:text-amber-400" 
                          : "text-rose-600 dark:text-rose-500"
                    }`}>{results.fib4Score}</div>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">{results.fib4Interpretation}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Lock: Platelets and Age needed to trigger FIB-4 calculation.</p>
                )}
              </div>

              {/* APRI Card */}
              <div className="bento-card dark:bg-slate-905 p-5 space-y-2">
                <span className="card-title">APRI Index (Platelet Ratio)</span>
                {results.apriScore !== undefined ? (
                  <div>
                    <div className={`score-big ${
                      results.apriRisk === "low" 
                        ? "text-emerald-600 dark:text-emerald-400" 
                        : results.apriRisk === "moderate" 
                          ? "text-amber-500 dark:text-amber-400" 
                          : "text-rose-600 dark:text-rose-500"
                    }`}>{results.apriScore}</div>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">{results.apriInterpretation}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Lock: Platelets and AST ULN limit needed for calculation.</p>
                )}
              </div>

              {/* BARD Card */}
              <div className="bento-card dark:bg-slate-905 p-5 space-y-2">
                <span className="card-title">BARD Score (NASH Fatty-Infiltration)</span>
                {results.bardScore !== undefined ? (
                  <div>
                    <div className={`score-big ${
                      results.bardScore <= 1 
                        ? "text-emerald-600 dark:text-emerald-400" 
                        : "text-rose-600 dark:text-rose-500"
                    }`}>{results.bardScore} <span className="text-xl font-bold text-slate-400">/ 4</span></div>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">{results.bardRisk}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {results.bardDetails?.map((d, idx) => (
                        <span key={idx} className="text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-mono px-2 py-0.5 rounded">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Lock: Patient Weight and Height needed for BARD BMI analysis.</p>
                )}
              </div>

              {/* Child-Pugh Card */}
              <div className="bento-card dark:bg-slate-905 p-5 space-y-2">
                <span className="card-title">Child-Pugh Staging & MELD</span>
                {results.childPughScore !== undefined ? (
                  <div className="space-y-2">
                    <div>
                      <div className="text-base font-bold text-slate-800 dark:text-slate-100">Child-Pugh Grade: <span className="text-indigo-600 font-mono">{results.childPughClass}</span></div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">Calculated Score: {results.childPughScore}/15</p>
                    </div>
                    {results.meldScore !== undefined && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50">
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                          MELD Staging: <span className="text-red-500 font-mono font-extrabold">{results.meldScore}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">Predicted clinical 90-day mortality risk stratification.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Lock: INR input required to compute Child-Pugh and MELD scales.</p>
                )}
              </div>

              {/* Metabolic Syndrome Card */}
              <div className="bento-card dark:bg-slate-905 p-5 space-y-3">
                <span className="card-title">Metabolic Syndrome (NCEP ATP III)</span>
                {results.ncepMetabolicSyndrome ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        results.ncepMetabolicSyndrome.met
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                      }`}>
                        {results.ncepMetabolicSyndrome.met ? "Criteria Met" : "Low Risk"}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                        {results.ncepMetabolicSyndrome.count} / 5 Criteria
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {results.ncepMetabolicSyndrome.conclusion}
                    </p>
                    <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800/40">
                      <div className="text-[9px] uppercase font-bold text-slate-400">Met Criteria:</div>
                      {results.ncepMetabolicSyndrome.criteriaMet.length > 0 ? (
                        results.ncepMetabolicSyndrome.criteriaMet.map((c: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-1 text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                            <span>●</span> <span className="text-left">{c}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] text-slate-400 italic">None</div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[9px] uppercase font-bold text-slate-400">Other / Unmet Criteria:</div>
                      {results.ncepMetabolicSyndrome.criteriaNotMet.map((c: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-1 text-[10px] text-slate-500 font-medium">
                          <span>○</span> <span className="text-slate-400 dark:text-slate-400 text-left">{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Lock: Fasting Glucose, Lipids, BP, or Waist Circumference needed to compute Metabolic Syndrome criteria.</p>
                )}
              </div>

              {/* Kidney Risk Assessment Card */}
              <div className="bento-card dark:bg-slate-905 p-5 space-y-3">
                <span className="card-title">Kidney Risk Assessment (Urine ACR)</span>
                {results.acrAssessment ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        results.acrAssessment.value < 30
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                          : results.acrAssessment.value <= 300
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                      }`}>
                        {results.acrAssessment.category}
                      </span>
                    </div>
                    <div>
                      <div className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100">
                        {results.acrAssessment.value} <span className="text-xs text-slate-400">mg/g</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 dark:text-slate-400 leading-relaxed text-justify">
                        {results.acrAssessment.description}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-850/50">
                      <div className="text-[9px] uppercase font-extrabold text-slate-400">Clinical Impact:</div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 italic font-medium leading-normal mt-0.5 text-justify">
                        {results.acrAssessment.clinicalSignificance}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Lock: Urine ACR (Albumin-Creatinine Ratio) measurement required to evaluate kidney disease risk.</p>
                )}
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
                {results ? getOfflineLftSummary({
                  alt: parseFloat(formData.alt) || 0,
                  ast: parseFloat(formData.ast) || 0,
                  alp: formData.alp ? parseFloat(formData.alp) : undefined,
                  ggt: formData.ggt ? parseFloat(formData.ggt) : undefined,
                  totalBilirubin: parseFloat(formData.totalBilirubin) || 0,
                  directBilirubin: formData.directBilirubin ? parseFloat(formData.directBilirubin) : undefined,
                  albumin: parseFloat(formData.albumin) || 0,
                  totalProtein: formData.totalProtein ? parseFloat(formData.totalProtein) : undefined,
                  inr: formData.inr ? parseFloat(formData.inr) : undefined,
                  platelets: formData.platelets ? parseFloat(formData.platelets) : undefined,
                  age: formData.age ? parseFloat(formData.age) : undefined,
                  astUln: formData.astUln ? parseFloat(formData.astUln) : undefined,
                  weight: formData.weight ? parseFloat(formData.weight) : undefined,
                  height: formData.height ? parseFloat(formData.height) : undefined,
                  diabetes: formData.diabetes,
                }, results) : ""}
              </p>
            </div>

            {/* Part B: On-Demand AI Interpretation */}
            <div className="space-y-3 pt-1">
              {!aiInsight && !isAiLoading && !aiError && (
                <div className="relative flex flex-col items-center justify-center p-5 bg-slate-950/20 border border-dashed border-slate-800 rounded-2xl space-y-4">
                  <p className="text-[11px] text-slate-300 text-center font-medium leading-relaxed">
                    Need an deep expert clinical review of potential NAFLD/MASH progression, liver fibrosis risk scores, or hepatology staging trends with {activeProviderName}?
                  </p>
                  
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 cursor-pointer select-none max-w-sm text-left transition-colors hover:bg-slate-950/60">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="lft-verification-checkbox"
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
                  <p className="text-xs text-red-400 flex items-center gap-1.5 font-bold">
                    <AlertCircle size={14} />
                    <span>{aiError}</span>
                  </p>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 cursor-pointer select-none max-w-sm text-left transition-colors hover:bg-slate-950/60">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="lft-verification-retry-checkbox"
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
