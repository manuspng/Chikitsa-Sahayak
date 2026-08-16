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

/**
 * Normalizes letter-spaced tokens like "R a h u l   K u m a r" into "Rahul Kumar"
 */
function normalizeLetterSpacing(str: string): string {
  return str.replace(/\b([A-Za-z])(?:\s+([A-Za-z]))+\b/g, (match) => {
    const multiWords = match.split(/\s{2,}/);
    return multiWords.map(chunk => {
      const chars = chunk.trim().split(/\s+/);
      if (chars.length > 1 && chars.every(c => c.length === 1)) {
        return chars.join("");
      }
      return chunk;
    }).join(" ");
  });
}

/**
 * /**
 * Cleans a candidate patient name, eliminating distant column words, unusual gaps, and unwanted noise
 */
function cleanCandidateName(candidate: string): string | undefined {
  if (!candidate) return undefined;

  // 1. First normalize letter-spaced words (e.g. "R a j e s h   K u m a r" -> "Rajesh   Kumar")
  let normalized = normalizeLetterSpacing(candidate);

  // 2. Cut off at standard medical/report delimiter keywords before column breaks
  const cutoffMarkers = [
    /\b(?:accession(?:\s*id|\s*no)?|acc(?:\s*no|\s*id)?|mrn|cr(?:\s*no)?|uhid|pid|uid|sid|visit(?:\s*no|\s*id)?|case(?:\s*no|\s*id)?|specimen(?:\s*id|\s*no)?|encounter|patient\s*id|reg(?:\s*no)?|id|age|sex|gender|dob|d\.o\.b|date|ref(?:\s*by)?|dr\.|doctor|bed|ward|bill|sample|collected|received|reported|verified|status|barcode|phone|mob|hospital|clinic|lab|test|investigation|page|department)\b/i,
    /[:=]/
  ];

  for (const marker of cutoffMarkers) {
    const match = normalized.search(marker);
    if (match !== -1) {
      normalized = normalized.substring(0, match).trim();
    }
  }

  // 3. Separate at table gaps (2+ spaces, tabs, pipes, semicolons) - ignore distant column spillover!
  const chunks = normalized.split(/\s{2,}|\t+|[|;\\/]+/);
  let firstChunk = (chunks[0] || "").trim();
  if (!firstChunk && chunks.length > 1) {
    firstChunk = chunks[1].trim();
  }

  // 4. Handle "Last, First" or "Surname, GivenName" format: e.g. "Kumar, Ramesh" -> "Ramesh Kumar"
  const commaNameMatch = firstChunk.match(/^([A-Za-z.\-]+)\s*,\s*([A-Za-z.\-]+(?:\s+[A-Za-z.\-]+)?)$/);
  if (commaNameMatch) {
    firstChunk = `${commaNameMatch[2]} ${commaNameMatch[1]}`;
  }

  // 5. Remove unwanted symbols and numbers
  firstChunk = firstChunk.replace(/[^A-Za-z.\-\s]/g, " ").replace(/\s+/g, " ").trim();

  // 6. Extract words and filter
  const words = firstChunk.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return undefined;

  // Discard forbidden non-name words
  const forbiddenTerms = new Set([
    "patient", "name", "pt", "mr", "mrs", "ms", "dr", "doctor", "reference", "range", 
    "result", "normal", "date", "clinical", "report", "hospital", "lab", "page", 
    "male", "female", "years", "year", "biochemistry", "pathology", "haematology", 
    "test", "profile", "specimen", "blood", "serum", "plasma", "accession", "acc",
    "id", "no", "mrn", "crno", "uhid", "pid", "uid", "sid", "visit", "case", "reg",
    "regno", "sample", "panel", "comprehensive", "metabolic", "hepatic", "vitals",
    "provided", "intake", "alcohol", "center", "centre", "diagnostic", "community"
  ]);

  const validWords: string[] = [];
  for (let i = 0; i < words.length && validWords.length < 4; i++) {
    const w = words[i];
    const lowerW = w.toLowerCase().replace(/[^a-z]/g, "");
    if (forbiddenTerms.has(lowerW)) {
      // If it's a prefix like Mr./Mrs./Ms./Dr. at the beginning, keep it
      if (i === 0 && ["mr", "mrs", "ms", "miss", "master", "dr"].includes(lowerW)) {
        validWords.push(w.endsWith(".") ? w : `${w}.`);
        continue;
      }
      break;
    }
    if (w.length >= 2 && /^[A-Za-z.\-]+$/.test(w)) {
      validWords.push(w);
    }
  }

  // If only a title was captured (e.g. "Mr."), reject
  const nonTitleWords = validWords.filter(w => !/^(mr|mrs|ms|miss|master|dr)\.?$/i.test(w));
  if (nonTitleWords.length === 0) return undefined;

  const finalName = validWords.join(" ");
  if (finalName.length >= 3 && finalName.length <= 45) {
    return finalName;
  }
  return undefined;
}

/**
 * Sanitizes and cleans a patient name string
 */
export function sanitizePatientName(name: string): string {
  if (!name) return "";
  let cleaned = name.trim();

  // 1. Separate at large gaps (2+ spaces, tabs, pipes, semicolons)
  const chunks = cleaned.split(/\s{2,}|\t+|[|;\\/]+/);
  cleaned = (chunks[0] || "").trim();

  // 2. Normalize letter spacing
  cleaned = normalizeLetterSpacing(cleaned);

  // 3. Cut off at standard medical/report delimiter keywords
  const cutoffMarkers = [
    /\b(?:accession(?:\s*id|\s*no)?|acc(?:\s*no|\s*id)?|mrn|cr(?:\s*no)?|uhid|pid|uid|sid|visit(?:\s*no|\s*id)?|case(?:\s*no|\s*id)?|specimen(?:\s*id|\s*no)?|encounter|patient\s*id|reg(?:\s*no)?|id|age|sex|gender|dob|d\.o\.b|date|ref(?:\s*by)?|dr\.|doctor|bed|ward|bill|sample|collected|received|reported|verified|status|barcode|phone|mob|hospital|clinic|lab|test|investigation|page|department)\b/i,
    /[:=]/
  ];

  for (const marker of cutoffMarkers) {
    const match = cleaned.search(marker);
    if (match !== -1) {
      cleaned = cleaned.substring(0, match).trim();
    }
  }

  // 4. Handle "Last, First" format
  const commaNameMatch = cleaned.match(/^([A-Za-z.\-]+)\s*,\s*([A-Za-z.\-]+(?:\s+[A-Za-z.\-]+)?)$/);
  if (commaNameMatch) {
    cleaned = `${commaNameMatch[2]} ${commaNameMatch[1]}`;
  }

  cleaned = cleaned.replace(/[^A-Za-z.\-\s]/g, " ").replace(/\s+/g, " ").trim();

  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return "";

  const forbiddenTerms = new Set([
    "patient", "name", "pt", "mr", "mrs", "ms", "dr", "doctor", "reference", "range", 
    "result", "normal", "date", "clinical", "report", "hospital", "lab", "page", 
    "male", "female", "years", "year", "biochemistry", "pathology", "haematology", 
    "test", "profile", "specimen", "blood", "serum", "plasma", "accession", "acc",
    "id", "no", "mrn", "crno", "uhid", "pid", "uid", "sid", "visit", "case", "reg",
    "regno", "sample", "panel", "comprehensive", "metabolic", "hepatic", "vitals",
    "provided", "intake", "alcohol", "center", "centre", "diagnostic", "community"
  ]);

  const validWords = words.filter(w => !forbiddenTerms.has(w.toLowerCase()));
  const nonTitleWords = validWords.filter(w => !/^(mr|mrs|ms|miss|master|dr)\.?$/i.test(w));
  if (nonTitleWords.length === 0) return "";

  const finalName = validWords.slice(0, 4).join(" ");
  if (finalName.length >= 3 && finalName.length <= 45) {
    return finalName;
  }
  return "";
}

// Extract patient name from text strictly from adjacent tokens without crossing columns or lines
export function extractPatientName(text: string): string | undefined {
  if (!text) return undefined;

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  // 1. Line-by-line targeted anchor search (highest precision)
  for (const line of lines) {
    // Check for "Patient Name:", "Patient's Name:", "Pt Name:", "Patient:", "Name:"
    // Consume trailing delimiters (:, -, =, ., _) so cleanCandidateName receives only the value
    const nameLabelMatch = line.match(/(?:patient\s+name|patient's\s+name|pt\.?\s*name|patient|name)[\s:._\-=]+([^\n\r]+)/i);
    if (nameLabelMatch && nameLabelMatch[1]) {
      const candidate = nameLabelMatch[1].trim();
      const cleaned = cleanCandidateName(candidate);
      if (cleaned) return cleaned;
    }
  }

  // 2. Honorific search on header lines (first 12 lines only)
  const headerLines = lines.slice(0, 12);
  for (const line of headerLines) {
    // Look for lines starting with or containing "Mr.", "Mrs.", "Ms.", "Miss", "Master", "Shri", "Smt."
    const honorificMatch = line.match(/\b(mr\.|ms\.|mrs\.|dr\.|master|miss|shri|smt\.)\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,2})/i);
    if (honorificMatch) {
      // Ensure this line isn't a doctor reference line
      if (!/ref(?:erred)?\s*(?:by)?|consultant|pathologist|doctor\s*name|dr\s*incharge/i.test(line)) {
        const cleaned = cleanCandidateName(honorificMatch[0]);
        if (cleaned) return cleaned;
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

/**
 * Calculates current age in years given a Date of Birth (DOB) string or year
 */
export function calculateAgeFromDob(dobStr: string): string | undefined {
  if (!dobStr) return undefined;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentDay = new Date().getDate();

  // Pattern 1: ISO format YYYY-MM-DD or YYYY/MM/DD: e.g. "1990-10-25" or "1985/07/15"
  const isoMatch = dobStr.match(/\b([0-9]{4})[-/.]([0-9]{1,2})[-/.]([0-9]{1,2})\b/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]);
    const day = parseInt(isoMatch[3]);
    if (year > 1900 && year <= currentYear) {
      let age = currentYear - year;
      if (month && (currentMonth < month || (currentMonth === month && day && currentDay < day))) {
        age--;
      }
      if (age >= 0 && age <= 120) {
        return String(age);
      }
    }
  }

  // Pattern 2: DD/MM/YYYY or DD-Mon-YYYY: e.g. "15/07/1985", "12-Apr-1980", "12/04/85"
  const standardMatch = dobStr.match(/\b([0-9]{1,2})[-/.]([0-9]{1,2}|[A-Za-z]{3,9})[-/.]([0-9]{2,4})\b/);
  if (standardMatch) {
    const rawYear = standardMatch[3];
    let year: number;
    if (rawYear.length === 2) {
      const y2 = parseInt(rawYear);
      const cur2 = currentYear % 100;
      year = y2 <= cur2 ? 2000 + y2 : 1900 + y2;
    } else {
      year = parseInt(rawYear);
    }

    const day = parseInt(standardMatch[1]);
    let month: number | undefined;
    if (isNaN(parseInt(standardMatch[2]))) {
      const mStr = standardMatch[2].toLowerCase().slice(0, 3);
      const months: Record<string, number> = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
      };
      month = months[mStr];
    } else {
      month = parseInt(standardMatch[2]);
    }

    if (year > 1900 && year <= currentYear) {
      let age = currentYear - year;
      if (month && (currentMonth < month || (currentMonth === month && day && currentDay < day))) {
        age--;
      }
      if (age >= 0 && age <= 120) {
        return String(age);
      }
    }
  }

  // Pattern 3: Month name first: "April 12, 1980" or "Jul 15 1985"
  const monthFirstMatch = dobStr.match(/\b([A-Za-z]{3,9})\s+([0-9]{1,2}),?\s+([0-9]{4})\b/);
  if (monthFirstMatch) {
    const year = parseInt(monthFirstMatch[3]);
    const mStr = monthFirstMatch[1].toLowerCase().slice(0, 3);
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };
    const month = months[mStr];
    const day = parseInt(monthFirstMatch[2]);
    if (year > 1900 && year <= currentYear) {
      let age = currentYear - year;
      if (month && (currentMonth < month || (currentMonth === month && day && currentDay < day))) {
        age--;
      }
      if (age >= 0 && age <= 120) {
        return String(age);
      }
    }
  }

  // Pattern 4: Explicit 4-digit birth year: e.g. "Born 1982" or "DOB: 1978"
  const yearMatch = dobStr.match(/\b(19[2-9][0-9]|20[0-2][0-9])\b/);
  if (yearMatch) {
    const yr = parseInt(yearMatch[1]);
    const age = currentYear - yr;
    if (age >= 0 && age <= 120) {
      return String(age);
    }
  }

  return undefined;
}

// Extract patient age dynamically (supports explicit age and calculates from Date of Birth)
export function extractPatientAge(text: string): string | undefined {
  if (!text) return undefined;
  const normalized = text.toLowerCase();

  // 1. Explicit age patterns (e.g. "Age: 45 Y", "45 Y / M", "Age/Sex: 45/Male")
  const ageRegexes = [
    /age\s*[:\-\t]*\s*([0-9]{1,3})\s*(?:years|yr|y\.?o\.?|s)?\b/i,
    /age\s*\/sex\s*[:\-\t]*\s*([0-9]{1,3})/i,
    /\b([0-9]{1,3})\s*(?:y|yr|yrs|years)\s*(?:\/|\s)\s*(?:m|f|male|female)\b/i,
    /(?:male|female|m|f)\s*(?:\/|\s)\s*([0-9]{1,3})\s*(?:y|yr|yrs|years)\b/i,
    /\b([0-9]{1,3})\s*years\b/i
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

  // 2. Date of Birth (DOB) pattern detection and current year age calculation
  const dobRegexes = [
    /(?:dob|d\.o\.b|date\s+of\s+birth|birth\s*date|born)\s*[:\-\t/]*\s*([^\n\r,;|]+)/i,
    /(?:age\s*\/\s*dob|dob\s*\/\s*age)\s*[:\-\t/]*\s*([^\n\r,;|]+)/i
  ];

  for (const dobRegex of dobRegexes) {
    const dobMatch = text.match(dobRegex);
    if (dobMatch && dobMatch[1]) {
      const calculatedAge = calculateAgeFromDob(dobMatch[1]);
      if (calculatedAge) {
        return calculatedAge;
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
  triglycerides?: number;
  waistCircumference?: number;
  fastingBloodGlucose?: number;
  urineAcr?: number;
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
  ], ["ggt", "gamma glutamyl", "gamma-gt", "gamma"]);

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

  // Platelets with Lakhs / Thousands normalization
  const rawPlt = extractLabValue(text, [
    /(?:platelet\s+count|platelets|platelet|plt)[\s:.\-\t=]*([0-9]+(?:[,.][0-9]+)?)/i
  ], ["platelet count", "platelets", "platelet", "plt"]);

  if (rawPlt !== undefined) {
    // If entered as absolute number (e.g. 150000 -> 150, or 1.5 Lakhs -> 150)
    if (rawPlt > 1000) {
      result.Platelets = Math.round(rawPlt / 1000);
    } else if (rawPlt > 0 && rawPlt < 10) {
      result.Platelets = Math.round(rawPlt * 100);
    } else {
      result.Platelets = Math.round(rawPlt);
    }
  }

  // Triglycerides (for FLI)
  result.triglycerides = extractLabValue(text, [
    /(?:triglycerides|triglyceride|tg|trig|triacylglyceride)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["triglycerides", "triglyceride", "tg", "trig"]);

  // Waist Circumference (for FLI)
  result.waistCircumference = extractLabValue(text, [
    /(?:waist\s+circumference|waist\s+size|waist\s+circ|waist)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["waist circumference", "waist size", "waist circ", "waist"]);

  // Fasting Blood Glucose
  result.fastingBloodGlucose = extractLabValue(text, [
    /(?:fasting\s+blood\s+glucose|fasting\s+glucose|fbg|fasting\s+sugar|glucose\s+fasting)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["fasting blood glucose", "fasting glucose", "fbg", "fasting sugar", "fbs"]);

  // Urine ACR
  result.urineAcr = extractLabValue(text, [
    /(?:urine\s+acr|urine\s+albumin\-creatinine\s+ratio|uacr|acr)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["urine acr", "uacr", "acr"]);

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
  RDW?: number;
  vitaminB12?: number;
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

  // Platelets with Lakhs / Thousands normalization
  const rawPlt = extractLabValue(text, [
    /(?:platelet\s+count|platelets|platelet|plt)[\s:.\-\t=]*([0-9]+(?:[,.][0-9]+)?)/i
  ], ["platelet count", "platelets", "platelet", "plt"]);

  if (rawPlt !== undefined) {
    if (rawPlt > 1000) {
      result.Platelets = Math.round(rawPlt / 1000);
    } else if (rawPlt > 0 && rawPlt < 10) {
      result.Platelets = Math.round(rawPlt * 100);
    } else {
      result.Platelets = Math.round(rawPlt);
    }
  }

  result.MCV = extractLabValue(text, [
    /(?:mcv|mean\s+corpuscular\s+volume)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["mcv", "mean corpuscular volume"]);

  result.MCH = extractLabValue(text, [
    /(?:mch|mean\s+corpuscular\s+hemoglobin)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["mch", "mean corpuscular hemoglobin"]);

  result.MCHC = extractLabValue(text, [
    /(?:mchc)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["mchc"]);

  // RDW (Red Cell Distribution Width)
  result.RDW = extractLabValue(text, [
    /(?:rdw[\s\-_]?(?:cv|sd)?|red\s+cell\s+distribution\s+width)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["rdw-cv", "rdw-sd", "rdw cv", "rdw sd", "rdw", "red cell distribution width"]);

  // Vitamin B12 (Cobalamin)
  result.vitaminB12 = extractLabValue(text, [
    /(?:vitamin\s+b[\s\-_]?12|vit\s+b[\s\-_]?12|b12|cobalamin|cyanocobalamin)[\s:.\-\t=]*([0-9]+(?:\.[0-9]+)?)/i
  ], ["vitamin b12", "vitamin b-12", "vit b12", "vit b-12", "b12", "cobalamin", "cyanocobalamin"]);

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

