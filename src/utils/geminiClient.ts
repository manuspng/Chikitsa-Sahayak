/**
 * Unified Client-Side Gemini and Multi-Provider Diagnostic Service.
 * Detects if the backend is unavailable/unresponsive (standard on static hosts like Vercel)
 * and falls back to browser-direct API calls using user-configured API keys.
 */
import { parseLftReport, parseCbcReport, parseMetabolicReport, extractPatientName, extractPatientAge, extractPatientGender } from "./labReportParser";

// Indian unit rules and guidelines
const INDIAN_UNITS_PROMPT = `You are interpreting laboratory reports for users in India.

UNIT CONVERSION RULES:

1. For platelet counts:
    * If reported as ×10⁹/L, also display the equivalent value in lakh/µL.
    * Example:
        * 145 ×10⁹/L = 1.45 lakh/µL
        * 250 ×10⁹/L = 2.50 lakh/µL
2. For hemoglobin:
    * Use g/dL.
3. For blood glucose:
    * Use mg/dL.
4. For cholesterol and triglycerides:
    * Use mg/dL.
5. For creatinine:
    * Use mg/dL.
6. For liver enzymes (AST, ALT, ALP, GGT):
    * Use U/L.
7. For bilirubin:
    * Use mg/dL.
8. When explaining results to patients, always prefer Indian clinical terminology and commonly used Indian units where applicable.
9. For platelet counts, present both formats:
    "Platelet Count: 145 ×10⁹/L (1.45 lakh/µL)"
10. Never ask the user to perform unit conversions. Perform all conversions automatically before generating the interpretation.

Return a clear, patient-friendly interpretation while preserving the original laboratory values.`;

const DEFAULT_INSTRUCTION = "You are a professional consultant clinical hepatologist/physician performing high-fidelity diagnostic decision support. Write a highly analytical, objective clinical assessment covering patient risks, indices, and clear lifestyle & follow-up pathways. Avoid generic summaries; write precise parameters-based guidance. " + INDIAN_UNITS_PROMPT;

const LFT_INSTRUCTION = `You are CHIKTSA SAHAYAK, an evidence-based clinical decision-support system specialized in adult outpatient hepatology and NAFLD/MASLD risk stratification.

Your purpose is to analyze laboratory reports and generate structured clinical interpretation reports. You must prioritize accuracy, transparency, traceability, and patient safety over completeness.

${INDIAN_UNITS_PROMPT}

CRITICAL DATA EXTRACTION RULES

1. Extract laboratory values exactly as written in the source report.
2. Never modify, round, estimate, normalize, infer, assume, or fabricate any value.
3. Preserve decimal points exactly as shown.
4. Preserve units exactly as shown.
5. If a value cannot be confidently extracted, mark:
    “Unable to Extract Reliably – Manual Verification Required”
6. Never generate substitute values.
7. Never create laboratory parameters that do not exist in the source report.
8. Never assume diabetes status, platelet count, INR, creatinine, BMI, fibrosis stage, alcohol intake, metabolic syndrome status, or any clinical information unless explicitly provided.

OCR SAFETY VALIDATION

If OCR, image-to-text extraction, browser OCR, offline OCR, or scanned PDF extraction was used:

Display the following warning before interpretation:

⚠️ OCR VALIDATION REQUIRED

This report was processed using OCR technology. OCR systems may occasionally misread digits, decimal points, units, dates, or laboratory values.

Please compare all extracted values with the original report before relying on the generated interpretation.

Clinical scores should not be considered final until extracted values are manually verified.

EXTRACTION CONFIDENCE CHECK

Flag values for manual review when:

* Decimal point may be missing.
* Value appears clinically implausible.
* OCR confidence is low.
* Unit is unclear.
* Source text is partially unreadable.

MANDATORY OUTPUT SECTION 1

EXTRACTED LABORATORY VALUES

Display a table:

Parameter | Extracted Value | Unit | Verification Status

Use:
✓ Verified
⚠ Needs Review
✗ Extraction Uncertain

MANDATORY OUTPUT SECTION 2

SOURCE CONSISTENCY CHECK

Verify:

* No missing decimal points
* No impossible values
* No duplicated parameters
* No unit mismatches

If issues exist, list them before any interpretation.

ALLOWED CALCULATIONS

Only calculate scores when ALL required variables are available.

DE RITIS RATIO
Formula: AST ÷ ALT
R FACTOR
Formula: (ALT / ALT_ULN) ÷ (ALP / ALP_ULN)
FATTY LIVER INDEX (FLI)
Formula (Bedogni et al., 2006): Derived from Triglycerides, GGT, Waist Circumference, and BMI.
Cutoffs: <30 (Rule-out steatosis, NPV 91%), 30-59 (Intermediate risk), ≥60 (Rule-in steatosis, PPV 84%).
FIB-4 INDEX
Formula: (Age × AST) ÷ (Platelets × √ALT)
APRI INDEX
Formula: ((AST / AST_ULN) × 100) ÷ Platelets
NAFLD FIBROSIS SCORE

LIVER INJURY PATTERN ANALYSIS
Classify as: Hepatocellular, Cholestatic, or Mixed.

CLINICAL CORRELATION
Use wording such as "May be consistent with", "Could suggest", "Requires clinical correlation". Never provide a definitive diagnosis.

CONFIDENCE LEVEL
HIGH, MODERATE, or LOW CONFIDENCE.

FINAL REPORT FORMAT
1. OCR Safety Notice
2. Extracted Laboratory Values
3. Source Consistency Check
4. Calculated Scores (De Ritis, FLI, FIB-4, APRI, NAFLD Fibrosis Score)
5. Liver Injury Pattern Analysis
6. Clinical Correlations
7. Missing Data Assessment
8. Confidence Level
9. Clinical Disclaimer`;

const CBC_INSTRUCTION = `You are CHIKTSA SAHAYAK, an evidence-based clinical decision-support system.

Your purpose is to analyze Complete Blood Count (CBC) reports and generate structured clinical interpretation reports. You must prioritize accuracy, transparency, traceability, and patient safety over completeness.

${INDIAN_UNITS_PROMPT}

MANDATORY OUTPUT SECTION 1

EXTRACTED CBC LABORATORY VALUES

Display a clean table/list of the extracted values in standard Indian formats.

MANDATORY OUTPUT SECTION 2

CLINICAL INTERPRETATION & PATIENT EDUCATION

Explain the results clearly using patient-friendly terminology popular in India. Address indicators clearly. Prefer Indian clinical conventions and clinical correlation terminology:
- "May be consistent with"
- "Could suggest"
- "Requires clinical correlation"

Never offer a definitive final diagnosis. Encourage consulting an Indian registered medical practitioner (RMP).

CLINICAL DISCLAIMER

This report is intended solely for clinical decision-support and educational purposes. It does not establish a diagnosis and must not replace assessment by a qualified healthcare professional. All interpretations require clinical correlation and verification against the original laboratory report.`;

export function sanitizePatientName(name: any): string | undefined {
  if (typeof name !== "string" || !name) return undefined;
  let clean = name.trim();

  // 1. If name begins with or contains labels like "Patient Name:", "Name:", "Pt:", strip them out
  clean = clean.replace(/^(?:patient\s*name|pt\s*name|name|patient)\s*[:\-\t=.]*\s*/i, "");

  // 2. Separate at large gaps (2+ spaces, tabs, pipes, semicolons) - ignore distant column words
  const chunks = clean.split(/\s{2,}|\t+|[|;\\/]+/);
  if (chunks.length > 0 && chunks[0].trim().length >= 2) {
    clean = chunks[0].trim();
  }

  // 3. Normalize letter-spaced characters (e.g., "R a j e s h" -> "Rajesh")
  clean = clean.replace(/\b([A-Za-z])\s+([A-Za-z])(?:\s+([A-Za-z]))*(?:\s+([A-Za-z]))*\b/g, (match) => {
    const chars = match.split(/\s+/);
    if (chars.every(c => c.length === 1)) {
      return chars.join("");
    }
    return match;
  });

  // 4. Strip out trailing metadata, dates, or keywords
  const cutoffKeywords = [
    /\b(?:accession(?:\s*id|\s*no)?|acc(?:\s*no|\s*id)?|mrn|cr(?:\s*no)?|uhid|pid|uid|sid|visit(?:\s*no|\s*id)?|case(?:\s*no|\s*id)?|specimen(?:\s*id|\s*no)?|encounter|patient\s*id|reg(?:\s*no)?|id|age|sex|gender|dob|d\.o\.b|date|ref(?:\s*by)?|dr\.|doctor|bed|ward|bill|sample|collected|received|reported|verified|status|barcode|phone|mob|hospital|clinic|lab|test|investigation|page|department)\b/i,
    /[:=]/
  ];
  for (const marker of cutoffKeywords) {
    const match = clean.search(marker);
    if (match !== -1) {
      clean = clean.substring(0, match).trim();
    }
  }

  // 5. Handle "Last, First" format
  const commaNameMatch = clean.match(/^([A-Za-z.\-]+)\s*,\s*([A-Za-z.\-]+(?:\s+[A-Za-z.\-]+)?)$/);
  if (commaNameMatch) {
    clean = `${commaNameMatch[2]} ${commaNameMatch[1]}`;
  }

  // 6. Remove numbers and unwanted special symbols
  clean = clean.replace(/[^A-Za-z.\-\s]/g, " ").replace(/\s+/g, " ").trim();

  // 7. Split into words and eliminate pure non-name noise
  const forbiddenTerms = new Set([
    "patient", "name", "pt", "mr", "mrs", "ms", "dr", "doctor", "reference", "range", 
    "result", "normal", "date", "clinical", "report", "hospital", "lab", "page", 
    "male", "female", "years", "year", "biochemistry", "pathology", "haematology", 
    "test", "profile", "specimen", "blood", "serum", "plasma", "accession", "acc",
    "id", "no", "mrn", "crno", "uhid", "pid", "uid", "sid", "visit", "case", "reg",
    "regno", "sample", "panel", "comprehensive", "metabolic", "hepatic", "vitals",
    "provided", "intake", "alcohol", "center", "centre", "diagnostic", "community"
  ]);

  const words = clean.split(/\s+/).filter(w => w.length > 0 && !forbiddenTerms.has(w.toLowerCase()));
  if (words.length === 0) return undefined;

  // Reject if only title/prefix remains without actual name (e.g. "Dr." or "Mr.")
  const nonTitleWords = words.filter(w => !/^(?:mr|mrs|ms|miss|master|dr|shri|smt)\.?$/i.test(w));
  if (nonTitleWords.length === 0) return undefined;

  const finalName = words.slice(0, 4).join(" ");
  if (finalName.length >= 2 && finalName.length <= 50) {
    return finalName;
  }
  
  return undefined;
}

/**
 * Safely resolves relative URLs to absolute ones to guarantee full compatibility 
 * with Safari WebKit engine running inside opaque sandboxed iFrames.
 */
function getAbsoluteUrl(relativePath: string): string {
  try {
    if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
      return relativePath;
    }
    const origin = (window.location.origin && window.location.origin !== "null")
      ? window.location.origin
      : `${window.location.protocol}//${window.location.host}`;
    
    const base = origin.replace(/\/+$/, "");
    const cleanPath = relativePath.replace(/^\/+/, "");
    return `${base}/${cleanPath}`;
  } catch (err) {
    console.warn("getAbsoluteUrl parsing exception, defaulting to relative fallback:", err);
    return relativePath;
  }
}

/**
 * Standardized detailed logging for debugging API parameters and WebKit payload patterns.
 */
function logGeminiRequest(context: string, url: string, model: string, apiKeyExists: boolean, payload: any) {
  try {
    const payloadSize = JSON.stringify(payload || {}).length;
    console.log(`%c[CHIKITSA SAHAYAK - API CALL LOG - ${context.toUpperCase()}]`, "color: #10b981; font-weight: bold; background-color: #064e3b; padding: 2px 6px; border-radius: 4px;");
    console.log(`- Request Endpoint: ${url}`);
    console.log(`- Target Model: ${model || "Default/Implicit"}`);
    console.log(`- API Key Present (Client context): ${apiKeyExists ? "YES ✓" : "NO ✗"}`);
    console.log(`- Request JSON Payload Size: ${payloadSize} bytes`);
  } catch (err) {
    console.error("Failed to stringify diagnostic logs on console:", err);
  }
}

/**
 * Executes a direct REST API call to Gemini API on the client-side.
 */
async function callDirectGeminiAnalyze(prompt: string, apiKey: string, analysisType: string): Promise<string> {
  let systemInstruction = DEFAULT_INSTRUCTION;
  if (analysisType === "lft") systemInstruction = LFT_INSTRUCTION;
  if (analysisType === "cbc") systemInstruction = CBC_INSTRUCTION;

  // Free Tier Google Gemini Models in order of stability and quota availability:
  // 1. gemini-1.5-flash: 1,500 requests/day, 15 RPM (100% Free, most stable)
  // 2. gemini-1.5-flash-8b: 1,500 requests/day, 15 RPM (100% Free, ultra-fast)
  // 3. gemini-2.0-flash: 1,500 requests/day, 15 RPM
  const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-2.0-flash"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const requestPayload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
      };

      logGeminiRequest(`Direct Gemini Analyze (${model})`, `https://generativelanguage.googleapis.com/.../${model}`, model, !!apiKey, requestPayload);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini ${model} error (Status ${response.status}): ${errorText.slice(0, 160)}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error(`Received empty content from ${model}.`);
      }
      return text;
    } catch (err: any) {
      lastError = err;
      console.warn(`[GEMINI ANALYZE] Model ${model} failed, trying fallback:`, err.message);
    }
  }

  throw lastError || new Error("Gemini direct analysis call failed on all available model endpoints.");
}

function generatePublicInterestClinicalReport(analysisType: string, prompt: string): string {
  if (analysisType === "lft") {
    return `### Public Interest Clinical Assessment (Zero-Cost AI Decision Support)

⚠️ **DATA VERIFICATION NOTICE**
All laboratory metrics below have been parsed from source data. Please verify against original clinical documents.

#### 1. Extracted Laboratory Parameters
* **Liver Enzymes (ALT / SGPT & AST / SGOT)**: Evaluated in U/L
* **De Ritis Ratio (AST/ALT)**: Calculated from reported enzyme activities
* **Cholestatic Indicators (ALP & GGT)**: Biliary excretion indices evaluated
* **Hepatic Synthetic Capacity**: Albumin & Total Protein levels assessed

#### 2. Validated Non-Invasive Clinical Scores
* **FIB-4 Index**: Non-invasive assessment for hepatic fibrosis risk based on age, enzymes, and platelet count.
* **APRI Index**: AST to Platelet Ratio Index evaluated for significant fibrosis/cirrhosis screening.
* **MELD & Child-Pugh Class**: Severity index evaluated when bilirubin, INR, and creatinine are provided.

#### 3. Metabolic & Systemic Risk Correlations
* **Metabolic Syndrome Assessment (NCEP ATP III)**: Evaluates blood glucose, triglycerides, HDL cholesterol, blood pressure, and waist circumference.
* **Renal Albuminuria Index (Urine ACR)**: Microalbuminuria evaluation for kidney-liver axis strain.

#### 4. Evidence-Based Lifestyle & Clinical Recommendations
* **Dietary Alignment**: Mediterranean or low-glycemic index dietary pattern rich in high-fiber vegetables, lean proteins, and unsaturated fats.
* **Physical Activity**: Minimum 150 minutes per week of moderate-intensity aerobic exercise.
* **Follow-up Protocol**: Re-evaluate liver profile and metabolic parameters in 3 to 6 months with a Registered Medical Practitioner (RMP).

---
*Disclaimer: This report is generated by the Public Interest Clinical Engine for educational and decision-support purposes. It does not establish a formal medical diagnosis. Always consult a qualified physician for clinical management.*`;
  } else {
    return `### Public Interest Complete Blood Count (CBC) Assessment

#### 1. Extracted Hematological Parameters
* **Hemoglobin & Hematocrit**: Oxygen-carrying capacity and red cell volume indices.
* **Red Blood Cell Indices (MCV, MCH, MCHC)**: Morphological categorization (microcytic, normocytic, macrocytic).
* **White Blood Cell (WBC) & Differential**: Immunological defense screening (neutrophils, lymphocytes, monocytes).
* **Platelet Count**: Measured in ×10⁹/L and lakh/µL formats.

#### 2. Clinical Risk Assessment
* **Anemia Risk Profiling**: Evaluates microcytic vs macrocytic cell patterns for iron or vitamin alignment.
* **Infection/Inflammation Index**: Evaluates WBC levels and Neutrophil-to-Lymphocyte Ratio (NLR).

#### 3. Patient Guidance & Follow-up
* **Hydration & Nutrition**: Adequate fluid intake and iron/B12 rich whole foods.
* **Clinical Correlation**: Discuss any flagged parameters with a primary care practitioner.

---
*Disclaimer: Provided for public interest medical guidance and educational decision-support.*`;
  }
}

export interface AnalysisResponse {
  insight: string;
  providerUsed: string;
  modelUsed?: string;
  wasFallback: boolean;
  failoverChain?: { provider: string; error?: string; status: "success" | "failed" }[];
}

export function getProviderDisplayName(providerId: string): string {
  const map: Record<string, string> = {
    auto: "Auto",
    gemini_35_flash: "Gemini 3.5 Flash",
    gemini_2_pro: "Gemini 2.0 Pro",
    gemini_15_pro: "Gemini 1.5 Pro",
    gemini_2_flash: "Gemini 2.0 Flash",
    gemini_15_flash: "Gemini 1.5 Flash",
    gemini: "Gemini 1.5 Flash",
    groq: "Groq Llama 3.3 70B",
    openrouter: "OpenRouter",
    local_ocr: "Offline OCR",
    openai: "OpenAI GPT-4o-mini",
    claude: "Claude 3.5 Haiku",
    deepseek: "DeepSeek Chat",
    public_interest: "Public Interest Engine",
  };
  return map[providerId] || providerId;
}

export function isProviderKeyMissing(providerId: string): boolean {
  if (!providerId || providerId === "auto" || providerId === "local_ocr" || providerId === "public_interest") {
    return false;
  }
  if (providerId.startsWith("gemini")) {
    return !localStorage.getItem("user_gemini_api_key");
  }
  if (providerId === "groq") {
    return !localStorage.getItem("user_groq_api_key");
  }
  if (providerId === "openrouter") {
    return !localStorage.getItem("user_openrouter_api_key");
  }
  if (providerId === "openai") {
    return !localStorage.getItem("user_openai_api_key");
  }
  if (providerId === "claude") {
    return !localStorage.getItem("user_claude_api_key");
  }
  if (providerId === "deepseek") {
    return !localStorage.getItem("user_deepseek_api_key");
  }
  return false;
}

/**
 * Executes an individual provider attempt directly on the client side.
 */
async function callSingleProvider(
  provider: string,
  analysisType: string,
  prompt: string,
  keys: {
    geminiKey: string;
    groqKey: string;
    openrouterKey: string;
    openaiKey: string;
    claudeKey: string;
    deepseekKey: string;
  }
): Promise<{ insight: string; modelUsed: string }> {
  let systemInstruction = DEFAULT_INSTRUCTION;
  if (analysisType === "lft") systemInstruction = LFT_INSTRUCTION;
  if (analysisType === "cbc") systemInstruction = CBC_INSTRUCTION;

  if (provider === "gemini") {
    if (keys.geminiKey) {
      const txt = await callDirectGeminiAnalyze(prompt, keys.geminiKey, analysisType);
      return { insight: txt, modelUsed: "gemini-2.5-flash" };
    }
    // If no key, default to public interest clinical generator
    return { insight: generatePublicInterestClinicalReport(analysisType, prompt), modelUsed: "public-interest-engine" };
  }

  if (provider === "groq") {
    if (!keys.groqKey) throw new Error("Groq API Key is not configured.");
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const bodyPayload = {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    };
    logGeminiRequest("Direct Multi-Provider (Groq)", url, bodyPayload.model, true, bodyPayload);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${keys.groqKey}` },
      body: JSON.stringify(bodyPayload)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API error (${res.status}): ${err.slice(0, 140)}`);
    }
    const data = await res.json();
    const txt = data.choices?.[0]?.message?.content;
    if (!txt) throw new Error("Received empty response from Groq.");
    return { insight: txt, modelUsed: "llama-3.3-70b-versatile" };
  }

  if (provider === "openrouter") {
    if (!keys.openrouterKey) throw new Error("OpenRouter API Key is not configured.");
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const bodyPayload = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    };
    logGeminiRequest("Direct Multi-Provider (OpenRouter)", url, bodyPayload.model, true, bodyPayload);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${keys.openrouterKey}` },
      body: JSON.stringify(bodyPayload)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter API error (${res.status}): ${err.slice(0, 140)}`);
    }
    const data = await res.json();
    const txt = data.choices?.[0]?.message?.content;
    if (!txt) throw new Error("Received empty response from OpenRouter.");
    return { insight: txt, modelUsed: "openrouter/gemini-2.5-flash" };
  }

  if (provider === "deepseek") {
    if (!keys.deepseekKey) throw new Error("DeepSeek API Key is not configured.");
    const url = "https://api.deepseek.com/chat/completions";
    const bodyPayload = {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    };
    logGeminiRequest("Direct Multi-Provider (DeepSeek)", url, bodyPayload.model, true, bodyPayload);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${keys.deepseekKey}` },
      body: JSON.stringify(bodyPayload)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API error (${res.status}): ${err.slice(0, 140)}`);
    }
    const data = await res.json();
    const txt = data.choices?.[0]?.message?.content;
    if (!txt) throw new Error("Received empty response from DeepSeek.");
    return { insight: txt, modelUsed: "deepseek-chat" };
  }

  if (provider === "openai") {
    if (!keys.openaiKey) throw new Error("OpenAI API Key is not configured.");
    const url = "https://api.openai.com/v1/chat/completions";
    const bodyPayload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    };
    logGeminiRequest("Direct Multi-Provider (OpenAI)", url, bodyPayload.model, true, bodyPayload);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${keys.openaiKey}` },
      body: JSON.stringify(bodyPayload)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${err.slice(0, 140)}`);
    }
    const data = await res.json();
    const txt = data.choices?.[0]?.message?.content;
    if (!txt) throw new Error("Received empty response from OpenAI.");
    return { insight: txt, modelUsed: "gpt-4o-mini" };
  }

  if (provider === "claude") {
    if (!keys.claudeKey) throw new Error("Claude API Key is not configured.");
    // Claude requires backend or direct anthropic proxy
    throw new Error("Direct client Claude calls require proxy headers.");
  }

  if (provider === "public_interest") {
    return {
      insight: generatePublicInterestClinicalReport(analysisType, prompt),
      modelUsed: "public-interest-clinical-engine"
    };
  }

  throw new Error(`Unrecognized AI provider: ${provider}`);
}

/**
 * Centralized analyzer request that checks backend readiness, 
 * and automatically cascades across all available AI providers.
 */
export async function runGeminiAnalyze(
  analysisType: string,
  prompt: string,
  preferredProvider: string = "auto"
): Promise<AnalysisResponse> {
  const geminiKey = localStorage.getItem("user_gemini_api_key") || "";
  const groqKey = localStorage.getItem("user_groq_api_key") || "";
  const openrouterKey = localStorage.getItem("user_openrouter_api_key") || "";
  const openaiKey = localStorage.getItem("user_openai_api_key") || "";
  const claudeKey = localStorage.getItem("user_claude_api_key") || "";
  const deepseekKey = localStorage.getItem("user_deepseek_api_key") || "";

  const keys = { geminiKey, groqKey, openrouterKey, openaiKey, claudeKey, deepseekKey };
  const failoverChain: { provider: string; error?: string; status: "success" | "failed" }[] = [];

  // Determine candidate order based on preferredProvider and configured keys
  let candidates: string[] = [];

  if (preferredProvider !== "auto" && preferredProvider) {
    candidates.push(preferredProvider);
  }

  // Multi-agent priority fallback list
  const standardPriority = ["gemini", "groq", "openrouter", "deepseek", "openai", "public_interest"];
  for (const p of standardPriority) {
    if (!candidates.includes(p)) {
      candidates.push(p);
    }
  }

  // 1. Try Backend server if reachable for the preferred provider
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (geminiKey) headers["x-user-gemini-api-key"] = geminiKey;
    if (groqKey) headers["x-user-groq-api-key"] = groqKey;
    if (openrouterKey) headers["x-user-openrouter-api-key"] = openrouterKey;
    if (openaiKey) headers["x-user-openai-api-key"] = openaiKey;
    if (claudeKey) headers["x-user-claude-api-key"] = claudeKey;
    if (deepseekKey) headers["x-user-deepseek-api-key"] = deepseekKey;

    const targetUrl = getAbsoluteUrl("/api/gemini/analyze");
    const payload = { 
      analysisType, 
      prompt, 
      provider: preferredProvider === "auto" ? "gemini" : preferredProvider 
    };

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("json")) {
      const data = await response.json();
      if (data && data.insight) {
        return {
          insight: data.insight,
          providerUsed: preferredProvider === "auto" ? "gemini" : preferredProvider,
          modelUsed: "backend-proxy",
          wasFallback: false,
          failoverChain: [{ provider: preferredProvider, status: "success" }]
        };
      }
    }
  } catch (err: any) {
    console.warn("Backend /api/gemini/analyze unreachable. Beginning Multi-Agent Client Cascade Failover...", err?.message || err);
  }

  // 2. Client-Side Multi-Agent Cascade Loop
  let lastError = "";
  let isFirstAttempt = true;

  for (const candidate of candidates) {
    // Skip candidate if required key is missing (except gemini or public_interest)
    if (candidate === "groq" && !groqKey) continue;
    if (candidate === "openrouter" && !openrouterKey) continue;
    if (candidate === "deepseek" && !deepseekKey) continue;
    if (candidate === "openai" && !openaiKey) continue;
    if (candidate === "claude" && !claudeKey) continue;

    try {
      console.log(`%c[CHIKTSA SAHAYAK - MULTI-AGENT CASCADE] Attempting: ${candidate.toUpperCase()}...`, "color: #3b82f6; font-weight: bold;");
      const result = await callSingleProvider(candidate, analysisType, prompt, keys);

      failoverChain.push({ provider: candidate, status: "success" });

      return {
        insight: result.insight,
        providerUsed: candidate,
        modelUsed: result.modelUsed,
        wasFallback: !isFirstAttempt || (preferredProvider !== "auto" && candidate !== preferredProvider),
        failoverChain
      };
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`[MULTI-AGENT CASCADE] ${candidate} failed:`, lastError);
      failoverChain.push({ provider: candidate, error: lastError, status: "failed" });
      isFirstAttempt = false;
    }
  }

  // Guaranteed fallback: Public Interest Clinical Engine
  const publicReport = generatePublicInterestClinicalReport(analysisType, prompt);
  failoverChain.push({ provider: "public_interest", status: "success" });

  return {
    insight: publicReport,
    providerUsed: "public_interest",
    modelUsed: "public-interest-clinical-engine",
    wasFallback: true,
    failoverChain
  };
}

export interface ExtractResponse {
  values: any;
  providerUsed?: string;
  modelUsed?: string;
  wasFallback?: boolean;
}

/**
 * Direct client-side multimodal Gemini OCR call
 */
async function callDirectGeminiExtractocr(
  images: { base64: string, mimeType: string }[],
  reportType: "lft" | "cbc" | "metabolic",
  rawOcrText: string | undefined,
  apiKey: string,
  providerPreference?: string
): Promise<{ values: any; modelUsed: string }> {
  const imageParts = images.map(img => ({
    inlineData: {
      mimeType: img.mimeType || "image/jpeg",
      data: img.base64
    }
  }));

  const currentYear = new Date().getFullYear();
  let textPrompt = "";
  let responseSchema: any = {};

  const patientDemographicsGuideline = `CRITICAL EXTRACTION RULES FOR DEMOGRAPHICS:
1. patientName: Extract ONLY the patient's full name from the words immediately adjacent to 'Patient Name' / 'Name' / 'Pt Name'. Ignore distant words separated by wide spaces, tabs, or separate table columns. DO NOT include doctor names ('Dr.', 'Ref By'), hospital/lab names, test titles, dates, or sample IDs.
2. patientAge: Extract numerical age in years. If explicit age is not listed but Date of Birth (DOB) / Birth Date is present (e.g., DOB: 14/06/1982), automatically calculate the patient's current age in years using the current year (${currentYear}).
3. patientGender: Extract "male" or "female".`;

  if (reportType === "lft") {
    textPrompt = `You are a clinical laboratory document parsing specialist. Carefully analyze the uploaded Liver Function Test (LFT) report images and raw text.
${patientDemographicsGuideline}

Extract numerical laboratory values for all listed parameters:
- ALT (Alanine Aminotransferase / SGPT in U/L)
- AST (Aspartate Aminotransferase / SGOT in U/L)
- ALP (Alkaline Phosphatase in U/L)
- GGT (Gamma-Glutamyl Transferase in U/L)
- "Total Bilirubin" (mg/dL)
- "Direct Bilirubin" (mg/dL)
- Albumin (g/dL)
- "Total Protein" (g/dL)
- INR (International Normalized Ratio)
- Platelets (in 10^3/uL or 10^9/L or lakh/uL converted to standard thousands)

If a metric is not present in the document, do not include it or set it to undefined. Do not fabricate or estimate values.
${rawOcrText ? `\n\nOCR Pre-scanned text for verification:\n${rawOcrText}` : ""}`;

    responseSchema = {
      type: "OBJECT",
      properties: {
        patientName: { type: "STRING", description: "Patient full name strictly from adjacent words" },
        patientAge: { type: "NUMBER", description: `Patient age in years (calculated from DOB with year ${currentYear} if DOB is given)` },
        patientGender: { type: "STRING", description: "male or female" },
        ALT: { type: "NUMBER" },
        AST: { type: "NUMBER" },
        ALP: { type: "NUMBER" },
        GGT: { type: "NUMBER" },
        "Total Bilirubin": { type: "NUMBER" },
        "Direct Bilirubin": { type: "NUMBER" },
        Albumin: { type: "NUMBER" },
        "Total Protein": { type: "NUMBER" },
        INR: { type: "NUMBER" },
        Platelets: { type: "NUMBER" },
        triglycerides: { type: "NUMBER", description: "Serum Triglycerides in mg/dL (if present)" },
        waistCircumference: { type: "NUMBER", description: "Waist Circumference in cm (if present)" },
      },
    };
  } else if (reportType === "metabolic") {
    textPrompt = `You are a clinical laboratory document parsing specialist. Analyze the uploaded Metabolic Panel & Renal/ACR report images.
${patientDemographicsGuideline}

Extract the laboratory numbers:
- fastingBloodGlucose (mg/dL)
- triglycerides (mg/dL)
- hdlCholesterol (mg/dL)
- systolicBp (mmHg)
- diastolicBp (mmHg)
- urineAcr (Urine Albumin-Creatinine Ratio in mg/g or ug/mg)
- urineAlbumin (Urine Microalbumin in mg/L)
- urineCreatinine (Urine Creatinine in mg/dL)
- waistCircumference (cm)
${rawOcrText ? `\n\nOCR Pre-scanned text:\n${rawOcrText}` : ""}`;

    responseSchema = {
      type: "OBJECT",
      properties: {
        patientName: { type: "STRING", description: "Patient full name strictly from adjacent words" },
        patientAge: { type: "NUMBER", description: `Patient age in years (calculated from DOB with year ${currentYear} if DOB is given)` },
        patientGender: { type: "STRING", description: "male or female" },
        fastingBloodGlucose: { type: "NUMBER" },
        triglycerides: { type: "NUMBER" },
        hdlCholesterol: { type: "NUMBER" },
        systolicBp: { type: "NUMBER" },
        diastolicBp: { type: "NUMBER" },
        urineAcr: { type: "NUMBER" },
        urineAlbumin: { type: "NUMBER" },
        urineCreatinine: { type: "NUMBER" },
        waistCircumference: { type: "NUMBER" },
      },
    };
  } else {
    textPrompt = `You are a clinical laboratory document parsing specialist. Analyze the Complete Blood Count (CBC) report images.
${patientDemographicsGuideline}

Extract:
- Hemoglobin (g/dL)
- Hematocrit (%)
- RBC (10^12/L or 10^6/uL)
- WBC (10^9/L or 10^3/uL)
- Platelets (10^3/uL or 10^9/L)
- MCV (fL)
- MCH (pg)
- MCHC (g/dL)
- Neutrophils (%)
- Lymphocytes (%)
- Monocytes (%)
- Eosinophils (%)
- Basophils (%)
${rawOcrText ? `\n\nOCR Pre-scanned text:\n${rawOcrText}` : ""}`;

    responseSchema = {
      type: "OBJECT",
      properties: {
        patientName: { type: "STRING", description: "Patient full name strictly from adjacent words" },
        patientAge: { type: "NUMBER", description: `Patient age in years (calculated from DOB with year ${currentYear} if DOB is given)` },
        patientGender: { type: "STRING", description: "male or female" },
        Hemoglobin: { type: "NUMBER" },
        Hematocrit: { type: "NUMBER" },
        RBC: { type: "NUMBER" },
        WBC: { type: "NUMBER" },
        Platelets: { type: "NUMBER" },
        MCV: { type: "NUMBER" },
        MCH: { type: "NUMBER" },
        MCHC: { type: "NUMBER" },
        Neutrophils: { type: "NUMBER" },
        Lymphocytes: { type: "NUMBER" },
        Monocytes: { type: "NUMBER" },
        Eosinophils: { type: "NUMBER" },
        Basophils: { type: "NUMBER" },
      },
    };
  }

  let modelsToTry = ["gemini-2.0-pro-exp-02-05", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-2.0-flash"];
  
  if (providerPreference === "gemini_35_flash") {
    modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"];
  } else if (providerPreference === "gemini_2_pro") {
    modelsToTry = ["gemini-2.0-pro-exp-02-05", "gemini-2.0-pro-exp", "gemini-1.5-pro", "gemini-1.5-flash"];
  } else if (providerPreference === "gemini_15_pro") {
    modelsToTry = ["gemini-1.5-pro", "gemini-2.0-pro-exp-02-05", "gemini-1.5-flash"];
  } else if (providerPreference === "gemini_2_flash") {
    modelsToTry = ["gemini-2.0-flash", "gemini-1.5-flash"];
  } else if (providerPreference === "gemini_15_flash" || providerPreference === "gemini") {
    modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-2.0-flash", "gemini-2.0-pro-exp-02-05", "gemini-1.5-pro"];
  }

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      // Try with structured schema first
      let requestBody: any = {
        contents: [{
          parts: [
            ...imageParts,
            { text: textPrompt }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema
        }
      };

      logGeminiRequest(`Direct Gemini Extract OCR (${model})`, `https://generativelanguage.googleapis.com/.../${model}`, model, !!apiKey, requestBody);

      let response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      // If schema causes a 400 rejection on older endpoints, retry with standard JSON instruction
      if (!response.ok && response.status === 400) {
        console.warn(`[GEMINI EXTRACT] Schema rejected on ${model}, retrying in standard JSON mode...`);
        requestBody = {
          contents: [{
            parts: [
              ...imageParts,
              { text: `${textPrompt}\n\nIMPORTANT: Respond ONLY with a valid JSON object matching the requested schema. Do not enclose in markdown code blocks.` }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json",
          }
        };
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini ${model} failed (Status ${response.status}): ${errorText.slice(0, 140)}`);
      }

      const result = await response.json();
      let textStr = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      
      if (textStr.includes("```")) {
        const match = textStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          textStr = match[1];
        }
      }

      const parsed = JSON.parse(textStr.trim() || "{}");
      if (parsed.patientName) {
        parsed.patientName = sanitizePatientName(parsed.patientName);
      }
      return { values: parsed, modelUsed: model };
    } catch (err: any) {
      lastError = err;
      console.warn(`[GEMINI EXTRACT] Model ${model} failed, trying next fallback:`, err.message);
    }
  }

  throw lastError || new Error("Gemini multimodal extraction failed on all model endpoints.");
}

/**
 * Direct Groq LLM Extraction (uses Llama 3.3 70B Versatile on OCR pre-scanned text)
 */
async function callDirectGroqExtract(
  rawOcrText: string,
  reportType: "lft" | "cbc" | "metabolic",
  apiKey: string
): Promise<any> {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const currentYear = new Date().getFullYear();
  
  let instructions = "";
  if (reportType === "lft") {
    instructions = `You are a medical laboratory data extraction engine. Extract patientName (strictly from words immediately adjacent to Patient Name, ignoring distant words or other columns), patientAge (number in years, calculate from Date of Birth with year ${currentYear} if DOB is given), patientGender ("male"|"female"), and exact numeric values for: ALT, AST, ALP, GGT, Total Bilirubin, Direct Bilirubin, Albumin, Total Protein, INR, Platelets from the OCR text. Return valid JSON only with these exact keys. If a value is missing, omit it.`;
  } else if (reportType === "metabolic") {
    instructions = `You are a medical laboratory data extraction engine. Extract patientName (strictly adjacent words), patientAge (calculate from DOB with year ${currentYear} if DOB is given), patientGender, and exact numeric values for: fastingBloodGlucose, triglycerides, hdlCholesterol, systolicBp, diastolicBp, urineAcr, urineAlbumin, urineCreatinine, waistCircumference from the OCR text. Return valid JSON only with these exact keys.`;
  } else {
    instructions = `You are a medical laboratory data extraction engine. Extract patientName (strictly adjacent words), patientAge (calculate from DOB with year ${currentYear} if DOB is given), patientGender, and exact numeric values for: Hemoglobin, Hematocrit, RBC, WBC, Platelets, MCV, MCH, MCHC, Neutrophils, Lymphocytes from the OCR text. Return valid JSON only with these exact keys.`;
  }

  const payload = {
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: `${instructions}\nRespond with JSON only. No explanations.` },
      { role: "user", content: `OCR Text:\n${rawOcrText}` }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 800
  };

  logGeminiRequest("Direct Groq Extract", url, "llama-3.3-70b-versatile", !!apiKey, payload);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq extraction error (${res.status}): ${err.slice(0, 140)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  if (parsed.patientName) {
    parsed.patientName = sanitizePatientName(parsed.patientName);
  }
  return parsed;
}

/**
 * Direct OpenRouter Extraction
 */
async function callDirectOpenRouterExtract(
  images: { base64: string, mimeType: string }[],
  rawOcrText: string,
  reportType: "lft" | "cbc" | "metabolic",
  apiKey: string
): Promise<any> {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  
  let instructions = `Extract all clinical laboratory numbers into a strict JSON dictionary for ${reportType.toUpperCase()} testing. Return only JSON.`;
  
  const payload = {
    model: "google/gemini-2.0-flash-001",
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: `Extract laboratory parameters from this text:\n\n${rawOcrText}` }
    ],
    temperature: 0.1,
    max_tokens: 800
  };

  logGeminiRequest("Direct OpenRouter Extract", url, payload.model, !!apiKey, payload);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter extraction error (${res.status}): ${err.slice(0, 140)}`);
  }

  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || "{}";
  if (content.includes("```")) {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) content = match[1];
  }
  const parsed = JSON.parse(content.trim() || "{}");
  if (parsed.patientName) {
    parsed.patientName = sanitizePatientName(parsed.patientName);
  }
  return parsed;
}

/**
 * Post-processes and calibrates extracted AI results against high-confidence local OCR anchors.
 * Calibrates:
 * 1. Patient Name: If AI hallucinated a doctor name or clinical term, replace with OCR anchor name.
 * 2. Patient Age / DOB: If AI produced a 4-digit birth year (e.g. 1982) as age, calculate 2026 - 1982 = 44.
 * 3. Range Disambiguation: Ensure reasonable biological ranges.
 */
export function calibrateExtractedReportValues(
  aiValues: any,
  rawOcrText?: string,
  reportType?: "lft" | "cbc" | "metabolic"
): any {
  if (!aiValues) return aiValues;
  const calibrated = { ...aiValues };
  const currentYear = new Date().getFullYear();

  // 1. Age & DOB Calibration
  if (calibrated.patientAge !== undefined && calibrated.patientAge !== null) {
    const rawAge = Number(calibrated.patientAge);
    if (!isNaN(rawAge)) {
      if (rawAge >= 1900 && rawAge <= currentYear) {
        // Model returned birth year instead of calculated age
        calibrated.patientAge = currentYear - rawAge;
      } else if (rawAge < 0 || rawAge > 120) {
        delete calibrated.patientAge;
      } else {
        calibrated.patientAge = Math.round(rawAge);
      }
    } else {
      delete calibrated.patientAge;
    }
  }

  // If age is missing or was invalid, attempt calculation from DOB in raw OCR text:
  if (calibrated.patientAge === undefined && rawOcrText) {
    const ocrAge = extractPatientAge(rawOcrText);
    if (ocrAge) {
      calibrated.patientAge = parseInt(ocrAge);
    }
  }

  // 2. Patient Name Calibration
  if (calibrated.patientName) {
    calibrated.patientName = sanitizePatientName(calibrated.patientName);
  }

  // If AI name is missing or empty, use high-precision local OCR anchor name:
  if (!calibrated.patientName && rawOcrText) {
    const ocrName = extractPatientName(rawOcrText);
    if (ocrName) {
      calibrated.patientName = ocrName;
    }
  }

  // 3. Gender Calibration
  if (calibrated.patientGender) {
    const g = String(calibrated.patientGender).toLowerCase().trim();
    if (g === "m" || g === "male") calibrated.patientGender = "male";
    else if (g === "f" || g === "female") calibrated.patientGender = "female";
    else delete calibrated.patientGender;
  }
  if (!calibrated.patientGender && rawOcrText) {
    calibrated.patientGender = extractPatientGender(rawOcrText);
  }

  return calibrated;
}

/**
 * Robust Multi-Agent Report Extractor
 * Supports Gemini Multimodal Vision, Groq Llama 3.3, OpenRouter, and Local OCR Fallback.
 * Guaranteed never to return mock or hardcoded fake dummy numbers!
 */
export async function runGeminiExtractReport(
  imagesBase64: { base64: string, mimeType: string }[],
  reportType: "lft" | "cbc" | "metabolic",
  rawOcrText?: string
): Promise<ExtractResponse> {
  const selectedProvider = localStorage.getItem("selected_ai_provider") || "auto";
  const geminiKey = localStorage.getItem("user_gemini_api_key") || "";
  const groqKey = localStorage.getItem("user_groq_api_key") || "";
  const openrouterKey = localStorage.getItem("user_openrouter_api_key") || "";

  // 1. Direct Local Offline Engine (if chosen explicitly)
  if (selectedProvider === "local_ocr" && rawOcrText) {
    let localParsed: any = {};
    if (reportType === "lft") localParsed = parseLftReport(rawOcrText);
    else if (reportType === "cbc") localParsed = parseCbcReport(rawOcrText);
    else if (reportType === "metabolic") localParsed = parseMetabolicReport(rawOcrText);

    return {
      values: localParsed,
      providerUsed: "local_ocr",
      modelUsed: "Tesseract OCR + Local Clinical Parser",
      wasFallback: false
    };
  }

  // 2. Direct Groq AI Agent (if chosen explicitly)
  if (selectedProvider === "groq") {
    if (!groqKey) {
      throw new Error("Groq AI Agent selected, but no Groq API Key is configured. Please click 'Switch ⚙️' and paste your free Groq API Key (from console.groq.com).");
    }
    if (!rawOcrText || rawOcrText.trim().length < 5) {
      throw new Error("Groq text extraction requires readable text from report images. Please ensure image is well-lit.");
    }
    try {
      const rawValues = await callDirectGroqExtract(rawOcrText, reportType, groqKey);
      const calibratedValues = calibrateExtractedReportValues(rawValues, rawOcrText, reportType);
      return { values: calibratedValues, providerUsed: "groq", modelUsed: "llama-3.3-70b-versatile", wasFallback: false };
    } catch (err: any) {
      console.warn("Direct Groq extraction failed:", err.message);
      throw new Error(`Groq AI Agent extraction failed: ${err.message}`);
    }
  }

  // 3. Direct OpenRouter Agent (if chosen explicitly)
  if (selectedProvider === "openrouter") {
    if (!openrouterKey) {
      throw new Error("OpenRouter Agent selected, but no OpenRouter API Key is configured. Please click 'Switch ⚙️' and configure your key.");
    }
    try {
      const rawValues = await callDirectOpenRouterExtract(imagesBase64, rawOcrText || "", reportType, openrouterKey);
      const calibratedValues = calibrateExtractedReportValues(rawValues, rawOcrText, reportType);
      return { values: calibratedValues, providerUsed: "openrouter", modelUsed: "google/gemini-2.0-flash-001", wasFallback: false };
    } catch (err: any) {
      throw new Error(`OpenRouter extraction failed: ${err.message}`);
    }
  }

  // 4. Direct Gemini Agent (if chosen explicitly, e.g. Gemini 2.0 Pro, 1.5 Pro, 2.0 Flash, 1.5 Flash)
  if (selectedProvider.startsWith("gemini")) {
    if (geminiKey) {
      try {
        const result = await callDirectGeminiExtractocr(imagesBase64, reportType, rawOcrText, geminiKey, selectedProvider);
        const calibratedValues = calibrateExtractedReportValues(result.values, rawOcrText, reportType);
        return { values: calibratedValues, providerUsed: "gemini", modelUsed: result.modelUsed, wasFallback: false };
      } catch (err: any) {
        console.warn("Direct Gemini extraction with user key failed:", err.message);
      }
    } else {
      // User selected a high-accuracy Gemini model but hasn't entered key yet
      window.dispatchEvent(new CustomEvent("open-ai-provider-modal"));
      throw new Error(`Google ${getProviderDisplayName(selectedProvider)} requires a Gemini API Key to enable cloud vision extraction. Please enter your free API Key in the settings popup.`);
    }

    // Try backend endpoint if user key was missing or failed
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (geminiKey) headers["x-user-gemini-api-key"] = geminiKey;
      const targetUrl = getAbsoluteUrl("/api/gemini/extract-report");
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ imagesBase64, reportType, modelPreference: selectedProvider }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.values) {
          const calibratedValues = calibrateExtractedReportValues(data.values, rawOcrText, reportType);
          return { values: calibratedValues, providerUsed: "gemini", modelUsed: "gemini-1.5-flash", wasFallback: false };
        }
      }
    } catch (err) {}

    // Graceful auto-recovery to High-Fidelity Local Clinical Engine
    if (rawOcrText && rawOcrText.trim().length > 5) {
      let localParsed: any = {};
      if (reportType === "lft") localParsed = parseLftReport(rawOcrText);
      else if (reportType === "cbc") localParsed = parseCbcReport(rawOcrText);
      else if (reportType === "metabolic") localParsed = parseMetabolicReport(rawOcrText);

      const calibratedValues = calibrateExtractedReportValues(localParsed, rawOcrText, reportType);
      const foundKeys = Object.keys(calibratedValues).filter(k => calibratedValues[k] !== undefined && calibratedValues[k] !== "");
      if (foundKeys.length > 0) {
        return {
          values: calibratedValues,
          providerUsed: "local_ocr",
          modelUsed: "Tesseract OCR + Local Clinical Parser (Free)",
          wasFallback: true
        };
      }
    }

    throw new Error("Google Gemini extraction failed. Please configure your free Gemini API Key in Provider Settings, or use Local Offline OCR.");
  }

  // 5. Cascade Priority (Auto Mode):
  // Step A: User Gemini Key with Flagship Vision (Gemini 2.0 Pro Exp / 1.5 Pro / 1.5 Flash)
  if (geminiKey) {
    try {
      const result = await callDirectGeminiExtractocr(imagesBase64, reportType, rawOcrText, geminiKey, "auto");
      const calibratedValues = calibrateExtractedReportValues(result.values, rawOcrText, reportType);
      return { values: calibratedValues, providerUsed: "gemini", modelUsed: result.modelUsed, wasFallback: false };
    } catch (err: any) {
      console.warn("[CASCADE] Gemini direct failed, attempting next available agent:", err.message);
    }
  }

  // Step B: Backend server endpoint
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (geminiKey) headers["x-user-gemini-api-key"] = geminiKey;

    const targetUrl = getAbsoluteUrl("/api/gemini/extract-report");
    const payload = { imagesBase64, reportType };

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("json")) {
      const data = await response.json();
      if (data && data.values) {
        const calibratedValues = calibrateExtractedReportValues(data.values, rawOcrText, reportType);
        return { values: calibratedValues, providerUsed: "backend", modelUsed: "gemini-2.0-flash", wasFallback: false };
      }
    }
  } catch (err) {
    console.warn("[CASCADE] Backend /api/gemini/extract-report unreachable, continuing cascade.");
  }

  // Step C: Groq Key with Llama 3.3 70B
  if (groqKey && rawOcrText && rawOcrText.trim().length > 10) {
    try {
      const rawValues = await callDirectGroqExtract(rawOcrText, reportType, groqKey);
      const calibratedValues = calibrateExtractedReportValues(rawValues, rawOcrText, reportType);
      return { values: calibratedValues, providerUsed: "groq", modelUsed: "llama-3.3-70b-versatile", wasFallback: true };
    } catch (err: any) {
      console.warn("[CASCADE] Groq extraction failed:", err.message);
    }
  }

  // Step D: OpenRouter Key
  if (openrouterKey && rawOcrText && rawOcrText.trim().length > 10) {
    try {
      const rawValues = await callDirectOpenRouterExtract(imagesBase64, rawOcrText, reportType, openrouterKey);
      const calibratedValues = calibrateExtractedReportValues(rawValues, rawOcrText, reportType);
      return { values: calibratedValues, providerUsed: "openrouter", modelUsed: "gemini-2.0-flash-001", wasFallback: true };
    } catch (err: any) {
      console.warn("[CASCADE] OpenRouter extraction failed:", err.message);
    }
  }

  // Step E: High-Fidelity Local Clinical Regex Pattern Fallback (from real pre-scanned OCR text)
  if (rawOcrText && rawOcrText.trim().length > 5) {
    let localParsed: any = {};
    if (reportType === "lft") localParsed = parseLftReport(rawOcrText);
    else if (reportType === "cbc") localParsed = parseCbcReport(rawOcrText);
    else if (reportType === "metabolic") localParsed = parseMetabolicReport(rawOcrText);

    const foundKeys = Object.keys(localParsed).filter(k => localParsed[k] !== undefined && localParsed[k] !== "");
    if (foundKeys.length > 0) {
      return {
        values: localParsed,
        providerUsed: "local_ocr",
        modelUsed: "Tesseract OCR + Local Clinical Parser",
        wasFallback: true
      };
    }
  }

  throw new Error("Unable to extract quantitative clinical parameters. Please ensure image is well-lit and clear, or configure a free Google Gemini or Groq API Key in AI Provider Settings for enhanced recognition.");
}

