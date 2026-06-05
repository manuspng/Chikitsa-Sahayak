/**
 * Unified Client-Side Gemini and Multi-Provider Diagnostic Service.
 * Detects if the backend is unavailable/unresponsive (standard on static hosts like Vercel)
 * and falls back to browser-direct API calls using user-configured API keys.
 */

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

const LFT_INSTRUCTION = `You are CHIKITSA SAHAYAK, an evidence-based clinical decision-support system.

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
FIB-4 INDEX
APRI INDEX
NAFLD FIBROSIS SCORE
MELD SCORE
CHILD-PUGH CLASSIFICATION

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
4. Calculated Scores
5. Liver Injury Pattern Analysis
6. Clinical Correlations
7. Missing Data Assessment
8. Confidence Level
9. Clinical Disclaimer`;

const CBC_INSTRUCTION = `You are CHIKITSA SAHAYAK, an evidence-based clinical decision-support system.

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
  clean = clean.replace(/\d{4}[\-\/]\d{2}[\-\/]\d{2}[_\s]?\d{2}:\d{2}:\d{2}.*$/i, "");
  clean = clean.replace(/\d{4}[:\-\/]\d{2}[:\-\/]\d{2}.*/i, "");
  clean = clean.replace(/\d{2}[:\-\/]\d{2}[:\-\/]\d{4}.*/i, "");
  
  const expressions = [
    "results represent", "represent", "lab data", "as of", "patient name is",
    "json mapping", "let's list", "schema", "json", "total bilirubin",
    "direct bilirubin", "ast (sgot)", "alt (sgpt)", "ggt", "alp", "albumin"
  ];
  
  for (const exp of expressions) {
    const idx = clean.toLowerCase().indexOf(" " + exp);
    if (idx !== -1) {
      clean = clean.substring(0, idx);
    }
  }

  clean = clean.replace(/\d{4}.*$/g, "");
  clean = clean.replace(/\d+.*$/g, "");
  clean = clean.trim();
  
  if (clean.length > 60) {
    clean = clean.substring(0, 60);
  }
  
  return clean || undefined;
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const requestPayload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
  };

  logGeminiRequest("Direct Gemini Analyze fallback", "https://generativelanguage.googleapis.com/.../generateContent", "gemini-2.5-flash", !!apiKey, requestPayload);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini direct call error (Status ${response.status}): ${errorText.slice(0, 160)}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Received empty content from direct Gemini generator.");
  }
  return text;
}

/**
 * Centralized analyzer request that checks backend readiness, and falls back to browser direct calls
 */
export async function runGeminiAnalyze(analysisType: string, prompt: string, provider: string): Promise<{ insight: string }> {
  const geminiKey = localStorage.getItem("user_gemini_api_key") || "";
  const groqKey = localStorage.getItem("user_groq_api_key") || "";
  const openrouterKey = localStorage.getItem("user_openrouter_api_key") || "";
  const openaiKey = localStorage.getItem("user_openai_api_key") || "";
  const claudeKey = localStorage.getItem("user_claude_api_key") || "";
  const deepseekKey = localStorage.getItem("user_deepseek_api_key") || "";

  // 1. Try backend server request first
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (geminiKey) headers["x-user-gemini-api-key"] = geminiKey;
    if (groqKey) headers["x-user-groq-api-key"] = groqKey;
    if (openrouterKey) headers["x-user-openrouter-api-key"] = openrouterKey;
    if (openaiKey) headers["x-user-openai-api-key"] = openaiKey;
    if (claudeKey) headers["x-user-claude-api-key"] = claudeKey;
    if (deepseekKey) headers["x-user-deepseek-api-key"] = deepseekKey;

    const targetUrl = getAbsoluteUrl("/api/gemini/analyze");
    const payload = { analysisType, prompt, provider };
    const hasAnyApiKey = !!(geminiKey || groqKey || openrouterKey || openaiKey || claudeKey || deepseekKey);

    logGeminiRequest("Backend Analytical Request", targetUrl, provider === "gemini" ? "gemini-3.5-flash" : provider, hasAnyApiKey, payload);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("json")) {
      const data = await response.json();
      if (data && data.insight) {
        return { insight: data.insight };
      }
    } else {
      const respText = await response.text();
      console.warn(`Backend responded with status ${response.status} (Not valid JSON):`, respText.slice(0, 150));
    }
  } catch (err) {
    console.warn("Backend /api/gemini/analyze unreachable/errored. Falling back to direct client-side integration.", err);
  }

  // 2. Client-side fallback if backend failed, timed out, or returned HTML (e.g. Vercel static router)
  if (provider === "gemini") {
    if (!geminiKey) {
      throw new Error("No Gemini API Key found. Because this deployment is serverless, you need to configure your personal Gemini API Key in 'AI Settings' (Secrets dropdown) to activate clinical diagnostics.");
    }
    const txt = await callDirectGeminiAnalyze(prompt, geminiKey, analysisType);
    return { insight: txt };
  }

  // Fallbacks for other client-configured providers if backend is inactive
  let url = "";
  let bodyPayload: any = null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let systemInstruction = DEFAULT_INSTRUCTION;
  if (analysisType === "lft") systemInstruction = LFT_INSTRUCTION;
  if (analysisType === "cbc") systemInstruction = CBC_INSTRUCTION;

  if (provider === "groq") {
    if (!groqKey) throw new Error("Please configure your Groq API Key.");
    url = "https://api.groq.com/openai/v1/chat/completions";
    headers["Authorization"] = `Bearer ${groqKey}`;
    bodyPayload = {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    };
  } else if (provider === "openrouter") {
    if (!openrouterKey) throw new Error("Please configure your OpenRouter API Key.");
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers["Authorization"] = `Bearer ${openrouterKey}`;
    bodyPayload = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    };
  } else if (provider === "openai") {
    if (!openaiKey) throw new Error("Please configure your OpenAI API Key.");
    url = "https://api.openai.com/v1/chat/completions";
    headers["Authorization"] = `Bearer ${openaiKey}`;
    bodyPayload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    };
  } else if (provider === "deepseek") {
    if (!deepseekKey) throw new Error("Please configure your DeepSeek API Key.");
    url = "https://api.deepseek.com/chat/completions";
    headers["Authorization"] = `Bearer ${deepseekKey}`;
    bodyPayload = {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    };
  } else {
    throw new Error(`Provider fallback for ${provider} is not configured on the client side without a server.`);
  }

  logGeminiRequest(`Fallback Direct Multi-Provider Client (${provider})`, url, bodyPayload?.model || "unknown", true, bodyPayload);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyPayload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Direct provider API call failed (Status ${res.status}): ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content;
  if (!txt) throw new Error("Received empty response from fallback model provider.");
  return { insight: txt };
}

/**
 * Direct client-side multimodal Gemini OCR call
 */
async function callDirectGeminiExtractocr(images: { base64: string, mimeType: string }[], reportType: "lft" | "cbc", apiKey: string): Promise<any> {
  const imageParts = images.map(img => ({
    inlineData: {
      mimeType: img.mimeType || "image/jpeg",
      data: img.base64
    }
  }));

  let textPrompt = "";
  let responseSchema: any = {};

  if (reportType === "lft") {
    textPrompt = `Identify and extract the clean, brief patient name (excluding any dates, test results, or surrounding sentence text) and all listed Liver Function Test (LFT) numerical value readings from these lab report photo pages. Convert the extracted items into a single flat JSON dictionary representing values consolidated across all original pages. If a specific reading is not present in any page, do not include it. Ignore text and references that are not quantitative indicators.`;
    responseSchema = {
      type: "OBJECT",
      properties: {
        patientName: { type: "STRING", description: "Strictly the raw patient name only, e.g. 'Mr. Suresh Kumar'." },
        ALT: { type: "NUMBER", description: "Alanine Aminotransferase (ALT/SGPT) in U/L" },
        AST: { type: "NUMBER", description: "Aspartate Aminotransferase (AST/SGOT) in U/L" },
        ALP: { type: "NUMBER", description: "Alkaline Phosphatase (ALP) in U/L" },
        GGT: { type: "NUMBER", description: "Gamma-Glutamyl Transferase (GGT) in U/L" },
        "Total Bilirubin": { type: "NUMBER", description: "Total Bilirubin in mg/dL or umol/L" },
        "Direct Bilirubin": { type: "NUMBER", description: "Direct Bilirubin in mg/dL" },
        Albumin: { type: "NUMBER", description: "Albumin in g/dL or g/L" },
        "Total Protein": { type: "NUMBER", description: "Total Protein in g/dL" },
        INR: { type: "NUMBER", description: "International Normalized Ratio (INR)" },
        Platelets: { type: "NUMBER", description: "Platelet count inside 10^3/uL or 10^9/L" },
      },
    };
  } else {
    textPrompt = `Identify and extract the clean, brief patient name (excluding any dates, test results, or surrounding sentence text) and all listed Complete Blood Count (CBC) numerical value readings from these lab report photo pages. Convert the extracted items into a single flat JSON dictionary representing values consolidated across all original pages. If a specific reading is not present in any page, do not include it.`;
    responseSchema = {
      type: "OBJECT",
      properties: {
        patientName: { type: "STRING", description: "Strictly the raw patient name only, e.g. 'Jane Smith'." },
        Hemoglobin: { type: "NUMBER", description: "Hemoglobin value in g/dL" },
        Hematocrit: { type: "NUMBER", description: "Hematocrit percentage value" },
        RBC: { type: "NUMBER", description: "Red Blood Cell count x10^12/L or x10^6/uL" },
        WBC: { type: "NUMBER", description: "White Blood Cell count x10^9/L or x10^3/uL" },
        Platelets: { type: "NUMBER", description: "Platelet count inside 10^3/uL or 10^9/L" },
        MCV: { type: "NUMBER", description: "Mean Corpuscular Volume in fL" },
        MCH: { type: "NUMBER", description: "Mean Corpuscular Hemoglobin in pg" },
        MCHC: { type: "NUMBER", description: "Mean Corpuscular Hemoglobin Concentration in g/dL" },
        Neutrophils: { type: "NUMBER", description: "Neutrophils percentage" },
        Lymphocytes: { type: "NUMBER", description: "Lymphocytes percentage" },
      },
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const requestBody = {
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

  logGeminiRequest("Direct Gemini Extract OCR", "https://generativelanguage.googleapis.com/.../generateContent", "gemini-2.5-flash", !!apiKey, requestBody);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Direct OCR extraction failed (Status ${response.status}): ${errorText.slice(0, 150)}`);
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
  return parsed;
}

/**
 * Robust OCR extractor selector that checks backend readiness, and falls back to client direct call
 */
export async function runGeminiExtractReport(imagesBase64: { base64: string, mimeType: string }[], reportType: "lft" | "cbc"): Promise<{ values: any }> {
  const geminiKey = localStorage.getItem("user_gemini_api_key") || "";

  // 1. Try backend server request first
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (geminiKey) headers["x-user-gemini-api-key"] = geminiKey;

    const targetUrl = getAbsoluteUrl("/api/gemini/extract-report");
    const payload = { imagesBase64, reportType };

    logGeminiRequest("Backend Custom OCR Extract", targetUrl, "gemini-3.5-flash", !!geminiKey, payload);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("json")) {
      const data = await response.json();
      if (data && data.values) {
        return { values: data.values };
      }
    } else {
      const errText = await response.text();
      console.warn(`Backend responded with status ${response.status} (Not valid JSON):`, errText.slice(0, 150));
    }
  } catch (err) {
    console.warn("Backend /api/gemini/extract-report unreachable. Falling back to direct client-side OCR extraction.", err);
  }

  // 2. Client-side fallback if backend failed or is not available (e.g. Vercel deployment)
  if (!geminiKey) {
    throw new Error("No Gemini API Key found. Because this deployment is serverless, you need to configure your personal Gemini API Key in 'AI Settings' (Secrets dropdown) to activate clinical diagnostics.");
  }

  const values = await callDirectGeminiExtractocr(imagesBase64, reportType, geminiKey);
  return { values };
}
