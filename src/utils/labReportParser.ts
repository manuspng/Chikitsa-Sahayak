/**
 * Utility for parsing medical lab reports offline using regular expressions and keywords.
 * Designed to work with raw text extracted via Tesseract.js.
 */

// Helper to clean and normalize raw OCR text
export function normalizeOcrText(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\|\[\]\(\)\{\}]/g, " ") // replace brackets/pipes with space for cleaner regex matching
    .replace(/\s+/g, " "); // consolidate spaces
}

// Extract patient name from text
export function extractPatientName(text: string): string | undefined {
  const normalized = normalizeOcrText(text);
  
  // Regex combinations for matching patient name
  const nameRegexes = [
    /(?:patient\s+name|patient\s*:\s*|name\s*:\s*|patient's\s+name)[\s:._]*([A-Za-z]+(?:\s+[A-Za-z]+){1,3})/i,
    /(?:mr\.|ms\.|mrs\.|dr\.)\s*([A-Za-z]+(?:\s+[A-Za-z]+){1,2})/i,
    /name\s+([\w\s]+?)(?=\s+(?:age|sex|gender|date|ref|id|uhid|reg))/i
  ];

  for (const regex of nameRegexes) {
    const match = normalized.match(regex);
    if (match && match[1]) {
      const name = match[1].trim();
      // Enforce sanity checks on name: shouldn't contain numbers or common medical report terms
      const lowerName = name.toLowerCase();
      const forbiddenTerms = ["reference", "range", "result", "normal", "date", "clinical", "report", "hospital", "doctor", "lab", "page"];
      const hasForbiddenTerm = forbiddenTerms.some(term => lowerName.includes(term));
      const hasNumbers = /\d/.test(name);
      
      if (name.length >= 3 && name.length <= 40 && !hasForbiddenTerm && !hasNumbers) {
        return name;
      }
    }
  }

  // Fallback check on individual lines
  const lines = text.split("\n");
  for (const line of lines) {
    if (/name/i.test(line) && !/reference|ref/i.test(line)) {
      const parts = line.split(/[:\-\t]/);
      if (parts.length > 1) {
        const potentialName = parts[1].trim();
        if (potentialName.length >= 3 && potentialName.length <= 30 && !/\d/.test(potentialName)) {
          return potentialName;
        }
      }
    }
  }

  return undefined;
}

// Extract patient gender dynamically
export function extractPatientGender(text: string): "male" | "female" | undefined {
  const normalized = text.toLowerCase();
  
  // Look for gender/sex strings followed by indicators
  const genderRegexes = [
    /(?:gender|sex|biological\s+sex)\s*[:\-\t]*\s*\b(female|male|f|m)\b/i,
    /\b(gender|sex)\b[\s:._]*(female|male|f|m)\b/i
  ];

  for (const regex of genderRegexes) {
    const match = normalized.match(regex);
    if (match) {
      const val = (match[1] || match[2] || "").toLowerCase();
      if (val === "female" || val === "f") {
        return "female";
      }
      if (val === "male" || val === "m") {
        return "male";
      }
    }
  }

  // Plain word scan but prioritizing "female" to avoid substring issues within male
  if (/\bfemale\b/i.test(text) || /\bsex\s*:\s*f\b/i.test(text)) {
    return "female";
  }
  if (/\bmale\b/i.test(text) || /\bsex\s*:\s*m\b/i.test(text)) {
    return "male";
  }

  return undefined;
}

// Extract patient age dynamically
export function extractPatientAge(text: string): string | undefined {
  const normalized = text.toLowerCase();
  const ageRegexes = [
    /age\s*[:\-\t]*\s*([0-9]{1,3})\s*(?:years|yr|y\.?o\.?|s)?\b/i,
    /\b([0-9]{1,3})\s*years\b/i,
    /age\s*\/sex\s*[:\-\t]*\s*([0-9]{1,3})/i
  ];

  for (const regex of ageRegexes) {
    const match = normalized.match(regex);
    if (match && match[1]) {
      const ageVal = parseInt(match[1]);
      if (ageVal > 0 && ageVal < 120) {
        return String(ageVal);
      }
    }
  }
  return undefined;
}

// Generalized parser to find a laboratory value in OCR text with reference exclusion
function extractLabValue(text: string, patterns: RegExp[], keywords: string[], fallbackLineSearch = true): number | undefined {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  // 1. Try pattern-based whole text search first (highest precision)
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) return val;
    }
  }

  // 2. Try line by line search
  if (fallbackLineSearch) {
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      // Check if this line contains any of the keywords
      const hasKeyword = keywords.some(kw => lowerLine.includes(kw.toLowerCase()));
      if (hasKeyword) {
        // Clean line from reference ranges that might contain other numbers (e.g. "ALT 45 (Ref: <40)" or "WBC 7.2 Male: 4.5 - 11.0")
        let cleanedLine = line;
        
        // Remove text in parentheses or square brackets (often reference ranges)
        cleanedLine = cleanedLine.replace(/\([^)]+\)/g, " ");
        cleanedLine = cleanedLine.replace(/\[[^\]]+\]/g, " ");

        // Remove things after keyword markers like "ref", "range", "normal", "limit"
        const refMarkers = ["ref", "range", "normal", "standard", "limit", "interval"];
        for (const marker of refMarkers) {
          const mIndex = cleanedLine.toLowerCase().lastIndexOf(marker);
          if (mIndex !== -1 && mIndex > cleanedLine.toLowerCase().indexOf(keywords[0].toLowerCase())) {
            cleanedLine = cleanedLine.substring(0, mIndex);
          }
        }

        const lowerCleaned = cleanedLine.toLowerCase();
        
        // Search for numbers in this cleaned line
        for (const kw of keywords) {
          const kwIndex = lowerCleaned.indexOf(kw.toLowerCase());
          if (kwIndex !== -1) {
            const searchSlice = cleanedLine.substring(kwIndex + kw.length);
            
            // Look for actual numeric values block (supports decimals, optional comparison chars, and comma-separated integers)
            const numMatch = searchSlice.match(/[:\s\-\t=<>]*([0-9]+(?:[,.][0-9]+)?)/);
            if (numMatch && numMatch[1]) {
              // Strip out commas if present (e.g., platelet count 150,000 -> 150000)
              const parsedStr = numMatch[1].replace(/,/g, "");
              const val = parseFloat(parsedStr);
              if (!isNaN(val)) return val;
            }
          }
        }
      }
    }
  }

  return undefined;
}

// Parse LFT report text
export interface ParsedLft {
  patientName?: string;
  patientGender?: "male" | "female";
  patientAge?: string;
  ALT?: number;
  AST?: number;
  ALP?: number;
  GGT?: number;
  "Total Bilirubin"?: number;
  "Direct Bilirubin"?: number;
  Albumin?: number;
  "Total Protein"?: number;
  INR?: number;
  Platelets?: number;
}

export function parseLftReport(text: string): ParsedLft {
  const result: ParsedLft = {};
  
  const name = extractPatientName(text);
  if (name) result.patientName = name;

  const gender = extractPatientGender(text);
  if (gender) result.patientGender = gender;

  const age = extractPatientAge(text);
  if (age) result.patientAge = age;

  // Define regexes and keywords for LFT markers
  result.ALT = extractLabValue(text, [
    /(?:alt|sgpt|alanine\s+transaminase|alanine\s+aminotransferase)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["sgpt", "alt", "alanine"]);

  result.AST = extractLabValue(text, [
    /(?:ast|sgot|aspartate\s+transaminase|aspartate\s+aminotransferase)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["sgot", "ast", "aspartate"]);

  result.ALP = extractLabValue(text, [
    /(?:alp|alkaline\s+phosphatase|alk\s+phos)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["alp", "alkaline", "alk phos"]);

  result.GGT = extractLabValue(text, [
    /(?:ggt|gamma\s+glutamyl|gamma\s+gt|g-gt)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["ggt", "gamma glutamyl", "gamma-gt"]);

  result["Total Bilirubin"] = extractLabValue(text, [
    /(?:total\s+bilirubin|t\.?\s*bili|bilirubin\s+total)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["total bilirubin", "t. bili", "t bili", "bilirubin total"]);

  result["Direct Bilirubin"] = extractLabValue(text, [
    /(?:direct\s+bilirubin|d\.?\s*bili|bilirubin\s+direct|conjugated\s+bilirubin)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["direct bilirubin", "d. bili", "d bili", "bilirubin direct"]);

  result.Albumin = extractLabValue(text, [
    /(?:albumin|alb)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["albumin", "alb"]);

  result["Total Protein"] = extractLabValue(text, [
    /(?:total\s+protein|t\.?\s*protein|protein\s+total)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["total protein", "t. protein", "protein total"]);

  result.INR = extractLabValue(text, [
    /(?:inr|international\s+normalized\s+ratio)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["inr", "ratio"]);

  result.Platelets = extractLabValue(text, [
    /(?:platelet|plt|platelet\s+count|platelets)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["platelet", "plt", "platelets"]);

  return result;
}

// Parse CBC report text
export interface ParsedCbc {
  patientName?: string;
  patientGender?: "male" | "female";
  patientAge?: string;
  Hemoglobin?: number;
  Hematocrit?: number;
  RBC?: number;
  WBC?: number;
  Platelets?: number;
  MCV?: number;
  MCH?: number;
  MCHC?: number;
  Neutrophils?: number;
  Lymphocytes?: number;
}

export function parseCbcReport(text: string): ParsedCbc {
  const result: ParsedCbc = {};

  const name = extractPatientName(text);
  if (name) result.patientName = name;

  const gender = extractPatientGender(text);
  if (gender) result.patientGender = gender;

  const age = extractPatientAge(text);
  if (age) result.patientAge = age;

  result.Hemoglobin = extractLabValue(text, [
    /(?:hemoglobin|hb|hgb)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["hemoglobin", "hb", "hgb"]);

  result.Hematocrit = extractLabValue(text, [
    /(?:hematocrit|hct|pcv|packed\s+cell\s+volume)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["hematocrit", "hct", "pcv", "packed cell"]);

  result.RBC = extractLabValue(text, [
    /(?:rbc|red\s+blood\s+cell|rbcs|erythrocyte|erythrocytes)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["rbc", "red blood", "erythrocyte"]);

  result.WBC = extractLabValue(text, [
    /(?:wbc|white\s+blood\s+cell|wbcs|leucocyte|leukocyte|leukocytes)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["wbc", "white blood", "leukocyte", "leucocyte"]);

  result.Platelets = extractLabValue(text, [
    /(?:platelet\s+count|platelet|plt|platelets)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["platelet", "plt", "platelets"]);

  result.MCV = extractLabValue(text, [
    /(?:mcv|mean\s+corpuscular\s+volume)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["mcv", "mean corpuscular volume"]);

  result.MCH = extractLabValue(text, [
    /(?:mch|mean\s+corpuscular\s+hemoglobin)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["mch", "mean corpuscular hemoglobin"]);

  result.MCHC = extractLabValue(text, [
    /(?:mchc)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["mchc"]);

  result.Neutrophils = extractLabValue(text, [
    /(?:neutrophils|neut|neutr|granulocytes)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["neutrophils", "neut", "granulocytes"]);

  result.Lymphocytes = extractLabValue(text, [
    /(?:lymphocytes|lymph|lym)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["lymphocytes", "lymph", "lym"]);

  return result;
}

export interface ParsedMetabolic {
  patientName?: string;
  patientGender?: "male" | "female";
  patientAge?: string;
  waistCircumference?: number;
  fastingBloodGlucose?: number;
  triglycerides?: number;
  hdlCholesterol?: number;
  systolicBp?: number;
  diastolicBp?: number;
  urineAcr?: number;
}

export function parseMetabolicReport(text: string): ParsedMetabolic {
  const result: ParsedMetabolic = {};

  const name = extractPatientName(text);
  if (name) result.patientName = name;

  const gender = extractPatientGender(text);
  if (gender) result.patientGender = gender;

  const age = extractPatientAge(text);
  if (age) result.patientAge = age;

  // Waist Circumference
  result.waistCircumference = extractLabValue(text, [
    /(?:waist\s+circumference|waist\s+size|waist\s+circ|waist)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["waist circumference", "waist size", "waist circ", "waist"]);

  // Fasting Blood Glucose
  result.fastingBloodGlucose = extractLabValue(text, [
    /(?:fasting\s+blood\s+glucose|fasting\s+glucose|fbg|fasting\s+sugar|glucose\s+fasting)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["fasting blood glucose", "fasting glucose", "fbg", "fasting sugar", "glucose fasting", "fbs"]);

  // Triglycerides
  result.triglycerides = extractLabValue(text, [
    /(?:triglycerides|triglyceride|tg|trig|triacylglyceride|triacylglycerides)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["triglycerides", "triglyceride", "tg", "trig", "triacylglycerides"]);

  // HDL Cholesterol
  result.hdlCholesterol = extractLabValue(text, [
    /(?:hdl\s+cholesterol|hdl\-c|hdl)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["hdl cholesterol", "hdl-c", "hdl"]);

  // Urine ACR
  result.urineAcr = extractLabValue(text, [
    /(?:urine\s+acr|urine\s+albumin\-creatinine\s+ratio|uacr|acr|urine\s+albumin\s+creatinine)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["urine acr", "uacr", "acr", "urine albumin-creatinine"]);

  // Extract blood pressure
  const bpRegexes = [
    /(?:bp|blood\s+pressure)[\s:._\-\t=]*([0-9]{2,3})\s*[\/\\|]\s*([0-9]{2,3})(?:\s*mm\s*hg)?/i,
    /([0-9]{2,3})\s*[\/\\|]\s*([0-9]{2,3})(?:\s*mm\s*hg)?/i
  ];

  for (const regex of bpRegexes) {
    const match = text.match(regex);
    if (match && match[1] && match[2]) {
      const sys = parseInt(match[1]);
      const dia = parseInt(match[2]);
      if (sys >= 70 && sys <= 250 && dia >= 40 && dia <= 150) {
        result.systolicBp = sys;
        result.diastolicBp = dia;
        break;
      }
    }
  }

  // If BP extraction failed as a single string, try to split systems and diastols if separated
  if (result.systolicBp === undefined) {
    result.systolicBp = extractLabValue(text, [
      /(?:systolic\s+bp|systolic\s+blood\s+pressure|sys\s+bp)[\s:.\-\t=]*([0-9]{2,3})/i
    ], ["systolic bp", "systolic blood pressure", "sys bp"]);
  }

  if (result.diastolicBp === undefined) {
    result.diastolicBp = extractLabValue(text, [
      /(?:diastolic\s+bp|diastolic\s+blood\s+pressure|dia\s+bp)[\s:.\-\t=]*([0-9]{2,3})/i
    ], ["diastolic bp", "diastolic blood pressure", "dia bp"]);
  }

  return result;
}

