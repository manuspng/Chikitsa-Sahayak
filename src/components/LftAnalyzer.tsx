import React, { useState, useRef, useEffect } from "react";
import { Upload, HelpCircle, Save, FileText, Check, AlertCircle, RefreshCw, Layers, X, Plus, Trash2, Sparkles, Cpu, Camera } from "lucide-react";
import { LFTInputs, LFTResults, RiskLevel, AnalysisRecord } from "../types";
import { calculateLFT } from "../utils/calculations";
import { printClinicalReport } from "../utils/printHelper";
import ScoreGauge from "./ScoreGauge";
import MetricCard from "./MetricCard";
import Tesseract from "tesseract.js";
import { preprocessImageForOcr } from "../utils/ocrPreprocessing";
import { runGeminiAnalyze, runGeminiExtractReport, getProviderDisplayName, isProviderKeyMissing } from "../utils/geminiClient";
import { parseLftReport } from "../utils/labReportParser";
import WebcamCaptureModal from "./WebcamCaptureModal";

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
  const [aiErrorStack, setAiErrorStack] = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrErrorStack, setOcrErrorStack] = useState<string | null>(null);
  const [ocrStatusText, setOcrStatusText] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientGender, setPatientGender] = useState<"male" | "female">("male");
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [isVerifiedCheck, setIsVerifiedCheck] = useState(false);
  const [metabolicPanelOpen, setMetabolicPanelOpen] = useState(false);

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
  
  // Input refs and files queue for Mobile & PC (Upload Report & Camera)
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
    setAiErrorStack(null);

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
- Fatty Liver Index (FLI): ${calculated.fliScore !== undefined ? `${calculated.fliScore}/100 (${calculated.fliRisk?.toUpperCase()})` : "N/A"} (${calculated.fliInterpretation ?? "N/A"})
- FIB-4 Score: ${calculated.fib4Score ?? "N/A"} (${calculated.fib4Interpretation ?? "N/A"})
- APRI Score: ${calculated.apriScore ?? "N/A"} (${calculated.apriInterpretation ?? "N/A"})
- BARD Risk: ${calculated.bardRisk ?? "N/A"}

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

      const provider = localStorage.getItem("selected_ai_provider") || "auto";
      const data = await runGeminiAnalyze("lft", prompt, provider);

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
    setFormData(prev => {
      const next = {
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
        triglycerides: vals["triglycerides"] !== undefined ? String(vals["triglycerides"]) : prev.triglycerides,
        waistCircumference: vals["waistCircumference"] !== undefined ? String(vals["waistCircumference"]) : prev.waistCircumference,
      };

      // Compute which parameters were not available in the document or left blank
      const missing: string[] = [];
      if (!next.alt) missing.push("ALT (SGPT)");
      if (!next.ast) missing.push("AST (SGOT)");
      if (!next.platelets) missing.push("Platelets Count");
      if (!next.totalBilirubin) missing.push("Total Bilirubin");
      if (!next.albumin) missing.push("Albumin");
      if (!next.ggt) missing.push("GGT (Gamma-GT)");
      if (!next.alp) missing.push("ALP (Alkaline Phosphatase)");
      if (!next.triglycerides) missing.push("Triglycerides (for FLI)");
      if (!next.waistCircumference) missing.push("Waist Circumference (for FLI)");
      if (!next.weight || !next.height) missing.push("Weight & Height (for BMI)");
      if (!vals.patientName && !patientName) missing.push("Patient Name");
      if (!vals.patientAge && !next.age) missing.push("Patient Age");
      setMissingExtractedKeys(missing);

      return next;
    });
    setIsSaved(false);
    setResults(null);
    setIsVerifiedCheck(false);
  };

  const runOcrExtract = async (filesList: File[], mode: "offline" | "ai" = "ai") => {
    if (filesList.length === 0) {
      setSelectedFiles([]);
      return;
    }

    setIsOcrLoading(true);
    setOcrError(null);
    setOcrErrorStack(null);
    setOcrStatusText("Preparing report scan...");

    try {
      // 1. Preprocess images locally for OCR analysis
      const preprocessedUrls = await Promise.all(
        filesList.map(file => preprocessImageForOcr(file))
      );

      // 2. Perform OCR text recognition using Tesseract.js (provides clean text for both modes)
      let aggregatedText = "";
      let index = 0;
      for (const dataUrl of preprocessedUrls) {
        index++;
        setOcrStatusText(`Page ${index}/${preprocessedUrls.length}: Scanning image text...`);
        const ocrResult = await Tesseract.recognize(dataUrl, "eng", {
          logger: m => {
            if (m.status === "recognizing text") {
              const pct = Math.round(m.progress * 100);
              setOcrStatusText(`Page ${index}/${preprocessedUrls.length}: Scanning (${pct}%)`);
            } else if (m.status) {
              setOcrStatusText(`Page ${index}/${preprocessedUrls.length}: ${m.status}...`);
            }
          }
        });
        aggregatedText += "\n" + (ocrResult.data?.text || "");
      }

      if (mode === "offline") {
        setOcrStatusText("Parsing clinical fields offline...");
        const extracted = parseLftReport(aggregatedText);
        const foundValues = Object.keys(extracted).filter(k => k !== "patientName" && k !== "patientGender" && k !== "patientAge");
        if (foundValues.length === 0 && !extracted.patientName) {
          throw new Error("Unable to identify clinical metrics locally. Try adjusting lighting or use 'AI to Extract' for advanced recognition.");
        }
        applyLftOcrValues(extracted);
        setExtractMeta({ providerUsed: "Local Tesseract OCR", modelUsed: "Offline Pattern Parser", wasFallback: false });
      } else {
        setOcrStatusText("Encoding document for Clinical AI Engine...");
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
        setOcrStatusText("Extracting with Clinical Multi-Agent AI...");
        const data = await runGeminiExtractReport(base64Contents, "lft", aggregatedText);
        
        if (data && data.values) {
          applyLftOcrValues(data.values);
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
            <h4 style={{ color: "#000000" }} className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 dark:text-white">
              <Upload size={14} className="text-emerald-700 dark:text-emerald-400" />
              <span>Feed / Scan Report (Photo or PDF)</span>
            </h4>
            <p style={{ color: "#000000" }} className="text-[11px] font-bold mt-0.5 dark:text-slate-200">
              Upload your lab report or prescription for automated parameter recognition
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
      <form onSubmit={handleCalculate} style={{ backgroundColor: "#ffffff" }} className="bento-card border-2 border-slate-300 space-y-6">
        <div>
          <h3 style={{ color: "#000000" }} className="text-base font-black uppercase tracking-wider flex items-center gap-2 font-sans mb-1">
            <span className="w-1.5 h-4.5 bg-emerald-600 rounded-full shrink-0" />
            <span>Patient & Analytical Core Parameters</span>
          </h3>
          <p style={{ color: "#000000" }} className="text-xs font-bold">Incorporate patient demographics and clinical parameters evaluated during full liver screening cycles.</p>
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
              value={patientGender}
              onChange={e => setPatientGender(e.target.value as "male" | "female")}
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

        <div>
          <h3 style={{ color: "#000000" }} className="text-xs font-black uppercase tracking-wide">Biological Core Markers</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">ALT / SGPT <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="7-56"
                value={formData.alt}
                onChange={e => handleInputChange("alt", e.target.value)}
                className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-12 font-mono focus:outline-emerald-500" 
              />
              <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">U/L</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">AST / SGOT <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="10-40"
                value={formData.ast}
                onChange={e => handleInputChange("ast", e.target.value)}
                className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-12 font-mono focus:outline-emerald-500" 
              />
              <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">U/L</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Total Bilirubin <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="0.1-1.2"
                value={formData.totalBilirubin}
                onChange={e => handleInputChange("totalBilirubin", e.target.value)}
                className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-14 font-mono focus:outline-emerald-500" 
              />
              <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">mg/dL</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Albumin <span className="text-red-500">*</span></label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                required
                placeholder="3.5-5.0"
                value={formData.albumin}
                onChange={e => handleInputChange("albumin", e.target.value)}
                className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-12 font-mono focus:outline-emerald-500" 
              />
              <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">g/dL</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <h4 style={{ color: "#000000" }} className="text-xs font-black uppercase tracking-wide mb-4">Additional Screening Elements</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">ALP (Alk. Phosphatase)</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="44-147"
                  value={formData.alp}
                  onChange={e => handleInputChange("alp", e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-12 font-mono focus:outline-emerald-500" 
                />
                <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">U/L</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">GGT (Gamma-Glutamyl)</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="8-61"
                  value={formData.ggt}
                  onChange={e => handleInputChange("ggt", e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-12 font-mono focus:outline-emerald-500" 
                />
                <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">U/L</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Direct Bilirubin</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="0.0-0.3"
                  value={formData.directBilirubin}
                  onChange={e => handleInputChange("directBilirubin", e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-14 font-mono focus:outline-emerald-500" 
                />
                <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">mg/dL</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Total Protein</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="6.0-8.3"
                  value={formData.totalProtein}
                  onChange={e => handleInputChange("totalProtein", e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-12 font-mono focus:outline-emerald-500" 
                />
                <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">g/dL</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <h4 style={{ color: "#000000" }} className="text-xs font-black uppercase tracking-wide mb-4">Metadata & Demographic Inputs (FIB-4 & BARD)</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Patient Age</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="45"
                  value={formData.age}
                  onChange={e => handleInputChange("age", e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-10 font-mono focus:outline-emerald-500" 
                />
                <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">yrs</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Platelets</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="150-400"
                  value={formData.platelets}
                  onChange={e => handleInputChange("platelets", e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-14 font-mono focus:outline-emerald-500" 
                />
                <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-[9px] font-black leading-tight">10^9/L</span>
              </div>
              {formData.platelets && !isNaN(parseFloat(formData.platelets)) && (
                <p style={{ color: "#065f46" }} className="text-xs font-black font-mono mt-1">
                  Equivalent: {(parseFloat(formData.platelets) / 100).toFixed(2)} lakh/µL
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Weight (for BMI)</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="kg"
                  value={formData.weight}
                  onChange={e => handleInputChange("weight", e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-10 font-mono focus:outline-emerald-500" 
                />
                <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">kg</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Height (for BMI)</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="cm"
                  value={formData.height}
                  onChange={e => handleInputChange("height", e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-10 font-mono focus:outline-emerald-500" 
                />
                <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">cm</span>
              </div>
            </div>
          </div>

          <div className="pt-4 flex flex-wrap gap-4 items-center">
            <div className="space-y-1.5">
              <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">AST ULN (Lab Limit)</label>
              <input 
                type="number" 
                value={formData.astUln}
                onChange={e => handleInputChange("astUln", e.target.value)}
                className="w-24 bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black font-mono focus:outline-emerald-500" 
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input 
                type="checkbox" 
                checked={formData.diabetes}
                onChange={e => handleInputChange("diabetes", e.target.checked)}
                className="rounded border-slate-300 text-emerald-800 focus:ring-emerald-600 w-4 h-4"
              />
              <span style={{ color: "#000000" }} className="text-xs font-black">
                Patient has Type 2 Diabetes (+1 point to BARD)
              </span>
            </label>
          </div>
        </div>

        {/* Metabolic & Kidney Function Panel */}
        <div className="border-2 border-slate-300 rounded-2xl p-4 space-y-4">
          <button
            type="button"
            onClick={() => setMetabolicPanelOpen(!metabolicPanelOpen)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="space-y-0.5">
              <h3 style={{ color: "#000000" }} className="text-sm font-black">
                Metabolic & Kidney Panel (Optional)
              </h3>
              <p style={{ color: "#000000" }} className="text-xs font-bold">
                Analyze metabolic syndrome risk (NCEP ATP III) & renal health staging (Urine ACR)
              </p>
            </div>
            <div style={{ color: "#000000" }}>
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
            <div className="pt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-left border-t border-slate-200">
              <div className="space-y-1.5">
                <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Waist Circumference</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 94"
                    value={formData.waistCircumference}
                    onChange={e => handleInputChange("waistCircumference", e.target.value)}
                    className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-10 font-mono focus:outline-emerald-500"
                  />
                  <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">cm</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Fasting Blood Glucose</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 98"
                    value={formData.fastingBloodGlucose}
                    onChange={e => handleInputChange("fastingBloodGlucose", e.target.value)}
                    className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-14 font-mono focus:outline-emerald-500"
                  />
                  <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">mg/dL</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Triglycerides</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 145"
                    value={formData.triglycerides}
                    onChange={e => handleInputChange("triglycerides", e.target.value)}
                    className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-14 font-mono focus:outline-emerald-500"
                  />
                  <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">mg/dL</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">HDL Cholesterol</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 45"
                    value={formData.hdlCholesterol}
                    onChange={e => handleInputChange("hdlCholesterol", e.target.value)}
                    className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-14 font-mono focus:outline-emerald-500"
                  />
                  <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">mg/dL</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Systolic BP</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 120"
                    value={formData.systolicBp}
                    onChange={e => handleInputChange("systolicBp", e.target.value)}
                    className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-14 font-mono focus:outline-emerald-500"
                  />
                  <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">mmHg</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Diastolic BP</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 80"
                    value={formData.diastolicBp}
                    onChange={e => handleInputChange("diastolicBp", e.target.value)}
                    className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-14 font-mono focus:outline-emerald-500"
                  />
                  <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">mmHg</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label style={{ color: "#000000" }} className="text-xs font-black tracking-wide block">Urine ACR (Microalbuminuria)</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g., 24"
                    value={formData.urineAcr}
                    onChange={e => handleInputChange("urineAcr", e.target.value)}
                    className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-950 font-black pr-14 font-mono focus:outline-emerald-500"
                  />
                  <span style={{ color: "#000000" }} className="absolute right-3 top-2.5 text-xs font-black">mg/g</span>
                </div>
              </div>

              <div className="lg:col-span-2 flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.onHypertensionMeds}
                    onChange={e => handleInputChange("onHypertensionMeds", e.target.checked)}
                    className="rounded border-slate-300 text-emerald-800 focus:ring-emerald-600 w-4 h-4"
                  />
                  <span style={{ color: "#000000" }} className="text-xs font-black">
                    Patient is on active treatment for systemic hypertension
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Clinical Safety Verification Checkbox */}
        <div className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-4 flex items-start gap-4 select-none my-2 text-left shadow-xs">
          <input
            type="checkbox"
            checked={isVerifiedCheck}
            onChange={(e) => setIsVerifiedCheck(e.target.checked)}
            id="lft-verification-calc-checkbox"
            className="mt-0.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-600 cursor-pointer bg-white w-4 h-4 shrink-0"
          />
          <div className="space-y-1">
            <label htmlFor="lft-verification-calc-checkbox" style={{ color: "#000000" }} className="text-xs font-black cursor-pointer leading-tight block">
              I have verified the extracted values against the original report
            </label>
            <p style={{ color: "#000000" }} className="text-xs font-bold leading-normal">
              Confirming that all decimal points, values, and units are accurate prevents critical clinical and OCR errors.
            </p>
          </div>
        </div>

        <button 
          type="submit"
          disabled={!isVerifiedCheck}
          className="w-full py-3.5 rounded-2xl bg-indigo-700 hover:bg-indigo-800 text-white font-black text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:scale-100"
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
          
          <div style={{ backgroundColor: "#f0fdf4", color: "#000000" }} className="p-4 border-2 border-emerald-300 rounded-2xl text-xs leading-relaxed font-bold">
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
          <div style={{ backgroundColor: "#ffffff" }} className="bento-card border-2 border-slate-300 space-y-4 p-6">
            <h4 style={{ color: "#000000" }} className="text-sm font-black flex items-center gap-2 uppercase tracking-wide font-sans">
              <span className="w-1.5 h-3.5 bg-emerald-600 rounded-full shrink-0" />
              <span>Advanced Clinical Risk Indexes</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* FIB-4 Card */}
              {(() => {
                const theme = results.fib4Risk === "low"
                  ? {
                      cardBorder: "border-emerald-300 dark:border-emerald-700/80",
                      cardBg: "bg-emerald-50/50 dark:bg-emerald-950/20",
                      scoreColor: "text-emerald-700 dark:text-emerald-400",
                      badgeBg: "bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700",
                      infoBox: "bg-emerald-100/70 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200",
                    }
                  : results.fib4Risk === "moderate"
                  ? {
                      cardBorder: "border-amber-300 dark:border-amber-700/80",
                      cardBg: "bg-amber-50/50 dark:bg-amber-950/20",
                      scoreColor: "text-amber-700 dark:text-amber-400",
                      badgeBg: "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700",
                      infoBox: "bg-amber-100/70 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200",
                    }
                  : {
                      cardBorder: "border-rose-300 dark:border-rose-700/80",
                      cardBg: "bg-rose-50/50 dark:bg-rose-950/20",
                      scoreColor: "text-rose-700 dark:text-rose-400",
                      badgeBg: "bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-900/60 dark:text-rose-200 dark:border-rose-700",
                      infoBox: "bg-rose-100/70 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-200",
                    };
                return (
                  <div className={`bento-card border-2 p-5 space-y-3 transition-all ${results.fib4Score !== undefined ? `${theme.cardBorder} ${theme.cardBg}` : "border-slate-300 bg-white dark:bg-slate-900/80"}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                      <span style={{ color: "#000000" }} className="card-title font-mono font-black text-xs uppercase tracking-wider block dark:text-white">
                        FIB-4 Index (Fibrosis Triage)
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        Sterling et al.
                      </span>
                    </div>
                    {results.fib4Score !== undefined ? (
                      <div className="flex flex-col items-center justify-center text-center py-2 space-y-2.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Exact Calculated Reading
                        </span>
                        <div className={`text-5xl sm:text-6xl font-black font-mono tracking-tight ${theme.scoreColor}`}>
                          {results.fib4Score.toFixed(2)}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${theme.badgeBg}`}>
                          {results.fib4Risk === "low" ? "Low Risk (< 1.30)" : results.fib4Risk === "moderate" ? "Indeterminate Risk (1.30–2.67)" : "High Risk (> 2.67)"}
                        </span>
                        <div className={`p-3 rounded-xl border text-xs font-bold leading-relaxed text-center w-full ${theme.infoBox}`}>
                          {results.fib4Interpretation}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-black glow-red-text flex items-center gap-1">
                          <AlertCircle size={13} className="text-red-600 shrink-0" />
                          <span>FIB-4 Incomplete. Missing required parameters:</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {!formData.platelets && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Platelets (×10³/µL)</span>}
                          {!formData.age && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Patient Age</span>}
                          {(!formData.alt || !formData.ast) && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● ALT / AST Enzymes</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* APRI Card */}
              {(() => {
                const theme = results.apriRisk === "low"
                  ? {
                      cardBorder: "border-emerald-300 dark:border-emerald-700/80",
                      cardBg: "bg-emerald-50/50 dark:bg-emerald-950/20",
                      scoreColor: "text-emerald-700 dark:text-emerald-400",
                      badgeBg: "bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700",
                      infoBox: "bg-emerald-100/70 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200",
                    }
                  : results.apriRisk === "moderate"
                  ? {
                      cardBorder: "border-amber-300 dark:border-amber-700/80",
                      cardBg: "bg-amber-50/50 dark:bg-amber-950/20",
                      scoreColor: "text-amber-700 dark:text-amber-400",
                      badgeBg: "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700",
                      infoBox: "bg-amber-100/70 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200",
                    }
                  : {
                      cardBorder: "border-rose-300 dark:border-rose-700/80",
                      cardBg: "bg-rose-50/50 dark:bg-rose-950/20",
                      scoreColor: "text-rose-700 dark:text-rose-400",
                      badgeBg: "bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-900/60 dark:text-rose-200 dark:border-rose-700",
                      infoBox: "bg-rose-100/70 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-200",
                    };
                return (
                  <div className={`bento-card border-2 p-5 space-y-3 transition-all ${results.apriScore !== undefined ? `${theme.cardBorder} ${theme.cardBg}` : "border-slate-300 bg-white dark:bg-slate-900/80"}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                      <span style={{ color: "#000000" }} className="card-title font-mono font-black text-xs uppercase tracking-wider block dark:text-white">
                        APRI Index (Platelet Ratio)
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        Wai et al.
                      </span>
                    </div>
                    {results.apriScore !== undefined ? (
                      <div className="flex flex-col items-center justify-center text-center py-2 space-y-2.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Exact Calculated Reading
                        </span>
                        <div className={`text-5xl sm:text-6xl font-black font-mono tracking-tight ${theme.scoreColor}`}>
                          {results.apriScore.toFixed(2)}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${theme.badgeBg}`}>
                          {results.apriRisk === "low" ? "Low Risk (< 0.50)" : results.apriRisk === "moderate" ? "Indeterminate Range (0.50–1.50)" : "High Risk (> 1.50)"}
                        </span>
                        <div className={`p-3 rounded-xl border text-xs font-bold leading-relaxed text-center w-full ${theme.infoBox}`}>
                          {results.apriInterpretation}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-black glow-red-text flex items-center gap-1">
                          <AlertCircle size={13} className="text-red-600 shrink-0" />
                          <span>APRI Incomplete. Missing required parameters:</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {!formData.platelets && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Platelets (×10³/µL)</span>}
                          {!formData.astUln && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● AST ULN Reference</span>}
                          {!formData.ast && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● AST (SGOT)</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* BARD Card */}
              {(() => {
                const bardRiskLevel = (results.bardScore !== undefined && results.bardScore <= 1) ? "low" : "high";
                const theme = bardRiskLevel === "low"
                  ? {
                      cardBorder: "border-emerald-300 dark:border-emerald-700/80",
                      cardBg: "bg-emerald-50/50 dark:bg-emerald-950/20",
                      scoreColor: "text-emerald-700 dark:text-emerald-400",
                      badgeBg: "bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700",
                      infoBox: "bg-emerald-100/70 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200",
                    }
                  : {
                      cardBorder: "border-rose-300 dark:border-rose-700/80",
                      cardBg: "bg-rose-50/50 dark:bg-rose-950/20",
                      scoreColor: "text-rose-700 dark:text-rose-400",
                      badgeBg: "bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-900/60 dark:text-rose-200 dark:border-rose-700",
                      infoBox: "bg-rose-100/70 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-200",
                    };
                return (
                  <div className={`bento-card border-2 p-5 space-y-3 transition-all ${results.bardScore !== undefined ? `${theme.cardBorder} ${theme.cardBg}` : "border-slate-300 bg-white dark:bg-slate-900/80"}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                      <span style={{ color: "#000000" }} className="card-title font-mono font-black text-xs uppercase tracking-wider block dark:text-white">
                        BARD Score (NASH Fibrosis)
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        Harrison et al.
                      </span>
                    </div>
                    {results.bardScore !== undefined ? (
                      <div className="flex flex-col items-center justify-center text-center py-2 space-y-2.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Exact Calculated Reading
                        </span>
                        <div className={`text-5xl sm:text-6xl font-black font-mono tracking-tight ${theme.scoreColor}`}>
                          {results.bardScore} <span className="text-2xl font-bold text-slate-400 font-sans">/ 4</span>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${theme.badgeBg}`}>
                          {results.bardScore <= 1 ? "Low Risk (Score 0–1)" : "High Risk (Score 2–4)"}
                        </span>
                        <div className={`p-3 rounded-xl border text-xs font-bold leading-relaxed text-center w-full ${theme.infoBox}`}>
                          {results.bardRisk}
                        </div>
                        <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                          {results.bardDetails?.map((d, idx) => (
                            <span key={idx} className="text-[10px] bg-white/90 dark:bg-slate-800 text-slate-950 dark:text-slate-100 font-bold font-mono px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-700">
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-black glow-red-text flex items-center gap-1">
                          <AlertCircle size={13} className="text-red-600 shrink-0" />
                          <span>BARD Incomplete. Missing parameters:</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(!formData.weight || !formData.height) && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Weight & Height (for BMI)</span>}
                          {(!formData.ast || !formData.alt) && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● AST / ALT Ratio</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Fatty Liver Index (FLI) Card */}
              {(() => {
                const theme = results.fliRisk === "low"
                  ? {
                      cardBorder: "border-emerald-300 dark:border-emerald-700/80",
                      cardBg: "bg-emerald-50/50 dark:bg-emerald-950/20",
                      scoreColor: "text-emerald-700 dark:text-emerald-400",
                      badgeBg: "bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700",
                      infoBox: "bg-emerald-100/70 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200",
                    }
                  : results.fliRisk === "intermediate"
                  ? {
                      cardBorder: "border-amber-300 dark:border-amber-700/80",
                      cardBg: "bg-amber-50/50 dark:bg-amber-950/20",
                      scoreColor: "text-amber-700 dark:text-amber-400",
                      badgeBg: "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700",
                      infoBox: "bg-amber-100/70 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200",
                    }
                  : {
                      cardBorder: "border-rose-300 dark:border-rose-700/80",
                      cardBg: "bg-rose-50/50 dark:bg-rose-950/20",
                      scoreColor: "text-rose-700 dark:text-rose-400",
                      badgeBg: "bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-900/60 dark:text-rose-200 dark:border-rose-700",
                      infoBox: "bg-rose-100/70 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-200",
                    };
                return (
                  <div className={`bento-card border-2 p-5 space-y-3 transition-all ${results.fliScore !== undefined ? `${theme.cardBorder} ${theme.cardBg}` : "border-slate-300 bg-white dark:bg-slate-900/80"}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                      <span style={{ color: "#000000" }} className="card-title font-mono font-black text-xs uppercase tracking-wider block dark:text-white">
                        Fatty Liver Index (FLI)
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        Bedogni et al. (EASL)
                      </span>
                    </div>

                    {results.fliScore !== undefined ? (
                      <div className="flex flex-col items-center justify-center text-center py-2 space-y-2.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Exact Calculated Reading
                        </span>
                        <div className={`text-5xl sm:text-6xl font-black font-mono tracking-tight ${theme.scoreColor}`}>
                          {results.fliScore.toFixed(1)} <span className="text-2xl font-bold text-slate-400 font-sans">/ 100</span>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${theme.badgeBg}`}>
                          {results.fliRisk === "low" ? "Low Steatosis Risk (< 30)" : results.fliRisk === "intermediate" ? "Intermediate Risk (30–59)" : "High Steatosis Risk (≥ 60)"}
                        </span>

                        <div className={`p-3 rounded-xl border text-xs font-bold leading-relaxed text-center w-full ${theme.infoBox}`}>
                          {results.fliInterpretation}
                        </div>

                        {results.fliBreakdown && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full pt-2 border-t border-slate-200 dark:border-slate-700 text-[11px]">
                            <div className="bg-white/80 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                              <span className="text-slate-500 font-medium block text-[10px]">BMI</span>
                              <strong className="text-slate-900 dark:text-slate-100 font-mono text-xs">{results.fliBreakdown.bmi} kg/m²</strong>
                            </div>
                            <div className="bg-white/80 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                              <span className="text-slate-500 font-medium block text-[10px]">Waist Circ.</span>
                              <strong className="text-slate-900 dark:text-slate-100 font-mono text-xs">{results.fliBreakdown.waistCircumference} cm</strong>
                            </div>
                            <div className="bg-white/80 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                              <span className="text-slate-500 font-medium block text-[10px]">Triglycerides</span>
                              <strong className="text-slate-900 dark:text-slate-100 font-mono text-xs">{results.fliBreakdown.triglycerides} mg/dL</strong>
                            </div>
                            <div className="bg-white/80 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                              <span className="text-slate-500 font-medium block text-[10px]">GGT</span>
                              <strong className="text-slate-900 dark:text-slate-100 font-mono text-xs">{results.fliBreakdown.ggt} U/L</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-black glow-red-text flex items-center gap-1">
                          <AlertCircle size={13} className="text-red-600 shrink-0" />
                          <span>FLI Calculation Incomplete. Missing required parameters:</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {!formData.triglycerides && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Triglycerides (mg/dL)</span>}
                          {!formData.ggt && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● GGT (U/L)</span>}
                          {!formData.waistCircumference && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Waist Circumference (cm)</span>}
                          {(!formData.weight || !formData.height) && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Weight & Height (BMI)</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setMetabolicPanelOpen(true)}
                          className="text-xs text-indigo-700 dark:text-indigo-400 font-black hover:underline cursor-pointer flex items-center gap-1 pt-1"
                        >
                          <span>+ Open Metabolic & Anthropometric Panel to enter inputs</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Metabolic Syndrome Card */}
              <div style={{ backgroundColor: "#ffffff" }} className="bento-card border-2 border-slate-300 p-5 space-y-3">
                <span style={{ color: "#000000" }} className="card-title font-mono font-black text-xs uppercase tracking-wider block">Metabolic Syndrome (NCEP ATP III)</span>
                {results.ncepMetabolicSyndrome ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        results.ncepMetabolicSyndrome.met
                          ? "bg-rose-100 text-rose-900 border border-rose-300"
                          : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                      }`}>
                        {results.ncepMetabolicSyndrome.met ? "Criteria Met" : "Low Risk"}
                      </span>
                      <span style={{ color: "#000000" }} className="text-xs font-mono font-black">
                        {results.ncepMetabolicSyndrome.count} / 5 Criteria
                      </span>
                    </div>
                    <p style={{ color: "#000000" }} className="text-xs font-black">
                      {results.ncepMetabolicSyndrome.conclusion}
                    </p>
                    <div className="space-y-1 pt-1 border-t border-slate-200">
                      <div style={{ color: "#000000" }} className="text-[10px] uppercase font-black">Met Criteria:</div>
                      {results.ncepMetabolicSyndrome.criteriaMet.length > 0 ? (
                        results.ncepMetabolicSyndrome.criteriaMet.map((c: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-1 text-xs text-rose-700 font-bold">
                            <span>●</span> <span className="text-left">{c}</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "#000000" }} className="text-xs italic font-bold">None</div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div style={{ color: "#000000" }} className="text-[10px] uppercase font-black">Other / Unmet Criteria:</div>
                      {results.ncepMetabolicSyndrome.criteriaNotMet.map((c: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-1 text-xs text-slate-800 font-bold">
                          <span>○</span> <span className="text-left">{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-black glow-red-text flex items-center gap-1">
                      <AlertCircle size={13} className="text-red-600 shrink-0" />
                      <span>Metabolic Criteria Incomplete. Missing parameters:</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {!formData.fastingBloodGlucose && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Fasting Glucose</span>}
                      {!formData.triglycerides && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Triglycerides</span>}
                      {!formData.hdlCholesterol && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● HDL Cholesterol</span>}
                      {!formData.systolicBp && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Blood Pressure</span>}
                      {!formData.waistCircumference && <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Waist Circumference</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Kidney Risk Assessment Card */}
              <div style={{ backgroundColor: "#ffffff" }} className="bento-card border-2 border-slate-300 p-5 space-y-3">
                <span style={{ color: "#000000" }} className="card-title font-mono font-black text-xs uppercase tracking-wider block">Kidney Risk Assessment (Urine ACR)</span>
                {results.acrAssessment ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        results.acrAssessment.value < 30
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : results.acrAssessment.value <= 300
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : "bg-rose-100 text-rose-900 border border-rose-300"
                      }`}>
                        {results.acrAssessment.category}
                      </span>
                    </div>
                    <div>
                      <div style={{ color: "#000000" }} className="text-lg font-mono font-black">
                        {results.acrAssessment.value} <span className="text-xs font-sans font-bold">mg/g</span>
                      </div>
                      <p style={{ color: "#000000" }} className="text-xs mt-1 leading-relaxed text-justify font-bold">
                        {results.acrAssessment.description}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <div style={{ color: "#000000" }} className="text-[10px] uppercase font-black">Clinical Impact:</div>
                      <p style={{ color: "#000000" }} className="text-xs italic font-bold leading-normal mt-0.5 text-justify">
                        {results.acrAssessment.clinicalSignificance}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-black glow-red-text flex items-center gap-1">
                      <AlertCircle size={13} className="text-red-600 shrink-0" />
                      <span>Kidney Risk Incomplete:</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="glow-red-badge px-2 py-0.5 rounded-lg text-[11px] font-black">● Urine ACR (mg/g) Not Fed</span>
                    </div>
                  </div>
                )}
              </div>
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
                <div style={{ backgroundColor: "#ffffff" }} className="relative flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-300 rounded-2xl space-y-4">
                  <p style={{ color: "#000000" }} className="text-xs text-center font-bold leading-relaxed">
                    Need an deep expert clinical review of potential NAFLD/MASH progression, liver fibrosis risk scores, or hepatology staging trends with {activeProviderName}?
                  </p>
                  
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border-2 border-slate-300 cursor-pointer select-none max-w-sm text-left transition-colors hover:bg-slate-100">
                    <input
                      type="checkbox"
                      checked={isVerifiedCheck}
                      onChange={(e) => setIsVerifiedCheck(e.target.checked)}
                      id="lft-verification-checkbox"
                      className="mt-0.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-600 cursor-pointer bg-white w-4 h-4 shrink-0"
                    />
                    <span style={{ color: "#000000" }} className="text-xs leading-normal font-black">
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
                <div style={{ backgroundColor: "#ffffff" }} className="h-28 flex flex-col items-center justify-center space-y-2 rounded-2xl border-2 border-slate-300">
                  <RefreshCw className="animate-spin text-emerald-800" size={24} />
                  <p style={{ color: "#000000" }} className="text-xs font-black">Generating expert clinical interpretation with {activeProviderName}...</p>
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
                      id="lft-verification-retry-checkbox"
                      className="mt-0.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-600 cursor-pointer bg-white w-4 h-4 shrink-0"
                    />
                    <span style={{ color: "#000000" }} className="text-xs leading-normal font-black">
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
                <div style={{ backgroundColor: "#ffffff" }} className="space-y-2 p-4 border-2 border-slate-300 rounded-2xl shadow-xs">
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
            <span style={{ color: "#000000" }} className="text-xs font-bold text-justify">Ensure values are verified before sharing or saving to logs.</span>
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
        title="Take LFT Report Photo"
      />
    </div>
  );
}
