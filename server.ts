import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

// Load local environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up large limit for base64 OCR report transfers
app.use(express.json({ limit: "50mb" }));

// Initialize the secure server-side Google GenAI Client
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

function sanitizePatientName(name: any): string | undefined {
  if (typeof name !== "string" || !name) return undefined;
  
  // Trim any whitespace
  let clean = name.trim();
  
  // Strip common image/file dates or timestamps if glued, e.g., "Suresh Kumar2024-05-16_08:11:00 AM" => "Suresh Kumar"
  clean = clean.replace(/\d{4}[\-\/]\d{2}[\-\/]\d{2}[_\s]?\d{2}:\d{2}:\d{2}.*$/i, "");
  clean = clean.replace(/\d{4}[:\-\/]\d{2}[:\-\/]\d{2}.*/i, "");
  clean = clean.replace(/\d{2}[:\-\/]\d{2}[:\-\/]\d{4}.*/i, "");
  
  // Strip generic sentence explanations or guidelines often outputted by models
  const expressions = [
    "results represent",
    "represent",
    "lab data",
    "as of",
    "patient name is",
    "json mapping",
    "let's list",
    "schema",
    "json",
    "mr. suresh kumar total bilirubin",
    "total bilirubin",
    "direct bilirubin",
    "ast (sgot)",
    "alt (sgpt)",
    "ggt",
    "alp",
    "albumin"
  ];
  
  for (const exp of expressions) {
    const idx = clean.toLowerCase().indexOf(" " + exp);
    if (idx !== -1) {
      clean = clean.substring(0, idx);
    }
  }

  // Double cleanup of any leftover trailing garbage/years/dates
  clean = clean.replace(/\d{4}.*$/g, "");
  clean = clean.replace(/\d+.*$/g, "");
  
  clean = clean.trim();
  
  // Ensure we don't have extremely long strings or junk
  if (clean.length > 60) {
    clean = clean.substring(0, 60);
  }
  
  return clean || undefined;
}

function formatGeminiError(error: any): string {
  const errMsg = error.message || String(error);
  const isQuota = errMsg.includes("429") || 
                  errMsg.toLowerCase().includes("quota") || 
                  errMsg.toLowerCase().includes("resource_exhausted") || 
                  errMsg.toLowerCase().includes("limit exceeded") ||
                  (error.status && String(error.status) === "429") ||
                  (error.code && String(error.code) === "429");
                  
  if (isQuota) {
    return "The system is currently experiencing high demand (Free Tier Quota Exceeded). Please retry in 30 seconds, or add your custom premium Gemini API Key in the settings (Secrets menu) for higher limits.";
  }
  return errMsg || "An unexpected error occurred during the clinical AI analysis.";
}

// 1. Diagnosis Advisor Endpoint
app.post("/api/gemini/analyze", async (req, res) => {
  try {
    const { analysisType, prompt, provider } = req.body;
    const activeProvider = provider || "gemini";

    if (!prompt) {
      return res.status(400).json({ error: "Missing diagnostic inputs prompt parameter." });
    }

    const indianUnitRulesPrompt = `You are interpreting laboratory reports for users in India.

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

    let systemInstruction = "You are a professional consultant clinical hepatologist/physician performing high-fidelity diagnostic decision support. Write a highly analytical, objective clinical assessment covering patient risks, indices, and clear lifestyle & follow-up pathways. Avoid generic summaries; write precise parameters-based guidance. " + indianUnitRulesPrompt;

    if (analysisType === "lft") {
      systemInstruction = `You are CHIKITSA SAHAYAK, an evidence-based clinical decision-support system.

Your purpose is to analyze laboratory reports and generate structured clinical interpretation reports. You must prioritize accuracy, transparency, traceability, and patient safety over completeness.

${indianUnitRulesPrompt}

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

Examples:
92 -> 2
1.9 -> 19
0.7 -> 7

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

Requirements:
AST and ALT

Formula:
AST ÷ ALT

Show full calculation.

R FACTOR

Requirements:
ALT
ALT Upper Limit
ALP
ALP Upper Limit

Formula:
(ALT / ALT_ULN) ÷ (ALP / ALP_ULN)

Show full calculation.

FIB-4 INDEX

Calculate ONLY if:

* Age available
* AST available
* ALT available
* Platelet count available

Otherwise output:

“Insufficient Data for FIB-4 Calculation”

APRI INDEX

Calculate ONLY if:

* AST available
* AST Upper Limit available
* Platelet count available

Otherwise output:

“Insufficient Data for APRI Calculation”

NAFLD FIBROSIS SCORE

Calculate ONLY if all required variables exist.

Otherwise output:

“Insufficient Data for NAFLD Fibrosis Score”

MELD SCORE

Calculate ONLY if:

* Bilirubin available
* INR available
* Creatinine available

Otherwise output:

“Insufficient Data for MELD Calculation”

Never estimate missing values.

CHILD-PUGH CLASSIFICATION

Calculate ONLY if:

* Bilirubin available
* Albumin available
* INR/PT available
* Ascites status available
* Encephalopathy status available

Otherwise output:

“Insufficient Data for Child-Pugh Classification”

PROHIBITED BEHAVIOR

Never:

* Invent INR
* Invent platelet count
* Invent creatinine
* Invent diabetes status
* Invent fibrosis stage
* Invent cirrhosis stage
* Invent MELD score
* Invent Child-Pugh class
* Invent APRI
* Invent FIB-4

If required data is missing, report:

“Insufficient Data”

LIVER INJURY PATTERN ANALYSIS

Classify as:

* Hepatocellular
* Cholestatic
* Mixed Pattern

Based only on available laboratory values.

Explain reasoning.

CLINICAL CORRELATION

Provide possible correlations only.

Use wording such as:

“May be consistent with”
“Could suggest”
“Requires clinical correlation”

Never provide a definitive diagnosis.

CONFIDENCE LEVEL

Assign:

HIGH CONFIDENCE
MODERATE CONFIDENCE
LOW CONFIDENCE

Based on:

* Quality of extracted data
* Completeness of required parameters
* OCR reliability

Explain why.

FINAL REPORT FORMAT

1. OCR Safety Notice
2. Extracted Laboratory Values
3. Source Consistency Check
4. Calculated Scores
5. Liver Injury Pattern Analysis
6. Clinical Correlations
7. Missing Data Assessment
8. Confidence Level
9. Clinical Disclaimer

CLINICAL DISCLAIMER

This report is intended solely for clinical decision-support and educational purposes. It does not establish a diagnosis and must not replace assessment by a qualified healthcare professional. All interpretations require clinical correlation and verification against the original laboratory report.`;
    }

    if (analysisType === "cbc") {
      systemInstruction = `You are CHIKITSA SAHAYAK, an evidence-based clinical decision-support system.

Your purpose is to analyze Complete Blood Count (CBC) reports and generate structured clinical interpretation reports. You must prioritize accuracy, transparency, traceability, and patient safety over completeness.

${indianUnitRulesPrompt}

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
    }

    if (activeProvider === "gemini") {
      const userApiKey = req.headers["x-user-gemini-api-key"] as string | undefined;
      const activeApiKey = userApiKey || apiKey;

      if (!activeApiKey) {
        return res.status(200).json({
          insight: `Clinical Insight Demo Mode (Gemini Flash): Excellent baseline medical readings flag no active anomalies. Click the 'AI Provider' button on the top right to configure your personal API Key for actual expert clinical insight.`,
        });
      }

      const activeAi = userApiKey 
        ? new GoogleGenAI({
            apiKey: userApiKey,
            httpOptions: {
              headers: { "User-Agent": "aistudio-build" },
            },
          })
        : ai;

      const response = await activeAi.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
        },
      });

      return res.json({ insight: response.text });
    }

    // Process other providers
    let activeApiKey = "";
    let providerName = "";
    let apiUrl = "";
    let bodyPayload: any = null;
    let requestHeaders: Record<string, string> = { "Content-Type": "application/json" };

    if (activeProvider === "groq") {
      activeApiKey = (req.headers["x-user-groq-api-key"] as string) || process.env.GROQ_API_KEY || "";
      providerName = "Groq";
      apiUrl = "https://api.groq.com/openai/v1/chat/completions";
      requestHeaders["Authorization"] = `Bearer ${activeApiKey}`;
      bodyPayload = {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1024
      };
    } else if (activeProvider === "openrouter") {
      activeApiKey = (req.headers["x-user-openrouter-api-key"] as string) || process.env.OPENROUTER_API_KEY || "";
      providerName = "OpenRouter";
      apiUrl = "https://openrouter.ai/api/v1/chat/completions";
      requestHeaders["Authorization"] = `Bearer ${activeApiKey}`;
      requestHeaders["HTTP-Referer"] = "https://ai.studio/build";
      requestHeaders["X-Title"] = "Chikitsa Sahayak";
      bodyPayload = {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1024
      };
    } else if (activeProvider === "openai") {
      activeApiKey = (req.headers["x-user-openai-api-key"] as string) || process.env.OPENAI_API_KEY || "";
      providerName = "OpenAI";
      apiUrl = "https://api.openai.com/v1/chat/completions";
      requestHeaders["Authorization"] = `Bearer ${activeApiKey}`;
      bodyPayload = {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1024
      };
    } else if (activeProvider === "claude") {
      activeApiKey = (req.headers["x-user-claude-api-key"] as string) || process.env.CLAUDE_API_KEY || "";
      providerName = "Claude";
      apiUrl = "https://api.anthropic.com/v1/messages";
      requestHeaders["x-api-key"] = activeApiKey;
      requestHeaders["anthropic-version"] = "2023-06-01";
      bodyPayload = {
        model: "claude-3-5-haiku-latest",
        system: systemInstruction,
        messages: [
          { role: "user", content: prompt }
        ],
        max_tokens: 1024
      };
    } else if (activeProvider === "deepseek") {
      activeApiKey = (req.headers["x-user-deepseek-api-key"] as string) || process.env.DEEPSEEK_API_KEY || "";
      providerName = "DeepSeek";
      apiUrl = "https://api.deepseek.com/chat/completions";
      requestHeaders["Authorization"] = `Bearer ${activeApiKey}`;
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
      return res.status(400).json({ error: `Unsupported AI provider requested: ${activeProvider}` });
    }

    if (!activeApiKey) {
      return res.status(200).json({
        insight: `Clinical Insight Demo Mode (${providerName}): Excellent baseline medical readings flag no active anomalies. Click the 'AI Provider' button on the top right to configure your personal ${providerName} API Key count for actual expert clinical insight.`,
      });
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: formatProviderError(activeProvider, response.status, errorText)
      });
    }

    const responseData = await response.json();
    let textResult = "";

    if (activeProvider === "claude") {
      textResult = responseData.content && responseData.content[0] ? responseData.content[0].text : "";
    } else {
      textResult = responseData.choices && responseData.choices[0] && responseData.choices[0].message ? responseData.choices[0].message.content : "";
    }

    if (!textResult) {
      return res.status(500).json({ error: `Received empty response payload from ${providerName}.` });
    }

    res.json({ insight: textResult });
  } catch (error: any) {
    console.error("Clinical analysis error across providers:", error);
    res.status(500).json({ error: formatGeminiError(error) });
  }
});

function formatProviderError(provider: string, status: number, bodyText: string): string {
  if (status === 401) {
    return `Invalid API Key supplied for ${provider.toUpperCase()}. Please check your input key inside the AI Provider dropdown menu and try again.`;
  }
  if (status === 403) {
    return `Access forbidden / Authentication failed for ${provider.toUpperCase()}. Please verify your accounts billing state or permissions.`;
  }
  if (status === 429) {
    return `Rate limit or quota exceeded for ${provider.toUpperCase()}. Please wait a short while before retrying, or verify if your dynamic API key credit limit has run out.`;
  }
  return `Error from ${provider.toUpperCase()} API (Status ${status}): ${bodyText.slice(0, 160)}`;
}

// 2. Multimodal Lab Report OCR Extractor Endpoint
app.post("/api/gemini/extract-report", async (req, res) => {
  try {
    const { imageBase64, imagesBase64, reportType } = req.body;
    const userApiKey = req.headers["x-user-gemini-api-key"] as string | undefined;
    const activeApiKey = userApiKey || apiKey;

    const b64List: { base64: string, mimeType: string }[] = [];
    if (imagesBase64 && Array.isArray(imagesBase64)) {
      imagesBase64.forEach(item => {
        if (item && typeof item === "object") {
          const b64 = item.base64 || item.data || "";
          const mime = item.mimeType || item.type || "image/jpeg";
          if (b64 && typeof b64 === "string" && b64.length > 0) {
            b64List.push({ base64: b64, mimeType: mime });
          }
        } else if (typeof item === "string" && item.length > 0) {
          b64List.push({ base64: item, mimeType: "image/jpeg" });
        }
      });
    } else if (imageBase64) {
      b64List.push({ base64: imageBase64, mimeType: "image/jpeg" });
    }

    if (b64List.length === 0) {
      return res.status(400).json({ error: "Missing imageBase64 or imagesBase64 data parameters." });
    }
    
    if (!activeApiKey) {
      // Return sample responses depending on reportType if API Key is not set yet, so preview users get a high-quality onboarding experience.
      if (reportType === "lft") {
        return res.json({
          values: {
            patientName: "John Doe",
            ALT: 64,
            AST: 42,
            ALP: 112,
            GGT: 48,
            "Total Bilirubin": 0.9,
            "Direct Bilirubin": 0.2,
            Albumin: 4.2,
            "Total Protein": 7.4,
            INR: 1.0,
            Platelets: 195,
          },
        });
      } else {
        return res.json({
          values: {
            patientName: "Jane Doe",
            Hemoglobin: 12.8,
            Hematocrit: 38.5,
            RBC: 4.1,
            WBC: 9.2,
            Platelets: 165,
            MCV: 84,
            MCH: 28,
            MCHC: 33,
            Neutrophils: 64,
            Lymphocytes: 28,
          },
        });
      }
    }

    const activeAi = userApiKey 
      ? new GoogleGenAI({
          apiKey: userApiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        })
      : ai;

    const imageParts = b64List.map(img => ({
      inlineData: {
        mimeType: img.mimeType || "image/jpeg",
        data: img.base64,
      },
    }));

    let textPrompt = "";
    let responseSchema: any = {};

    if (reportType === "lft") {
      textPrompt = `Identify and extract the clean, brief patient name (excluding any dates, test results, or surrounding sentence text) and all listed Liver Function Test (LFT) numerical value readings from these lab report photo pages. Convert the extracted items into a single flat JSON dictionary representing values consolidated across all original pages. If a specific reading is not present in any page, do not include it. Ignore text and references that are not quantitative indicators. If different pages list the same indicator, use the most recent or logical one.`;
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          patientName: { type: Type.STRING, description: "Strictly the raw patient name only, e.g. 'Mr. Suresh Kumar'. Absolutely no dates, notes, or analytical results included." },
          ALT: { type: Type.NUMBER, description: "Alanine Aminotransferase (ALT/SGPT) in U/L" },
          AST: { type: Type.NUMBER, description: "Aspartate Aminotransferase (AST/SGOT) in U/L" },
          ALP: { type: Type.NUMBER, description: "Alkaline Phosphatase (ALP) in U/L" },
          GGT: { type: Type.NUMBER, description: "Gamma-Glutamyl Transferase (GGT) in U/L" },
          "Total Bilirubin": { type: Type.NUMBER, description: "Total Bilirubin in mg/dL or umol/L" },
          "Direct Bilirubin": { type: Type.NUMBER, description: "Direct Bilirubin in mg/dL" },
          Albumin: { type: Type.NUMBER, description: "Albumin in g/dL or g/L" },
          "Total Protein": { type: Type.NUMBER, description: "Total Protein in g/dL" },
          INR: { type: Type.NUMBER, description: "International Normalized Ratio (INR)" },
          Platelets: { type: Type.NUMBER, description: "Platelet count inside 10^3/uL or 10^9/L" },
        },
      };
    } else {
      textPrompt = `Identify and extract the clean, brief patient name (excluding any dates, test results, or surrounding sentence text) and all listed Complete Blood Count (CBC) numerical value readings from these lab report photo pages. Convert the extracted items into a single flat JSON dictionary representing values consolidated across all original pages. If a specific reading is not present in any page, do not include it. Ignore standard range guides. If different pages list the same indicator, use the most recent or logical one.`;
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          patientName: { type: Type.STRING, description: "Strictly the raw patient name only, e.g. 'Jane Smith'. Absolutely no dates, notes, or analytical results included." },
          Hemoglobin: { type: Type.NUMBER, description: "Hemoglobin value in g/dL" },
          Hematocrit: { type: Type.NUMBER, description: "Hematocrit percentage value" },
          RBC: { type: Type.NUMBER, description: "Red Blood Cell count x10^12/L or x10^6/uL" },
          WBC: { type: Type.NUMBER, description: "White Blood Cell count x10^9/L or x10^3/uL" },
          Platelets: { type: Type.NUMBER, description: "Platelet count inside 10^3/uL or 10^9/L" },
          MCV: { type: Type.NUMBER, description: "Mean Corpuscular Volume in fL" },
          MCH: { type: Type.NUMBER, description: "Mean Corpuscular Hemoglobin in pg" },
          MCHC: { type: Type.NUMBER, description: "Mean Corpuscular Hemoglobin Concentration in g/dL" },
          Neutrophils: { type: Type.NUMBER, description: "Neutrophils percentage" },
          Lymphocytes: { type: Type.NUMBER, description: "Lymphocytes percentage" },
        },
      };
    }

    const response = await activeAi.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [
          ...imageParts,
          { text: textPrompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    let textStr = response.text || "{}";
    if (textStr.includes("```")) {
      const match = textStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        textStr = match[1];
      }
    }

    const parsedJson = JSON.parse(textStr.trim() || "{}");
    
    // Sanitize patientName before passing it back
    if (parsedJson.patientName) {
      parsedJson.patientName = sanitizePatientName(parsedJson.patientName);
    }
    
    res.json({ values: parsedJson });
  } catch (error: any) {
    console.error("Report extraction OCR error:", error);
    res.status(500).json({ error: formatGeminiError(error) });
  }
});

// Mount Vite Dev/Prod middlewares
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
