/**
 * Clinical Plausibility & Decimal Point Validation Utility
 * Detects missing or misplaced decimal points caused by low-quality OCR image scans or manual input typos.
 */

export interface PlausibilityIssue {
  fieldKey: string;
  parameterName: string;
  currentValue: number;
  suggestedValue?: number;
  reason: string;
  unit: string;
  severity: "critical" | "warning";
}

interface ParamRule {
  fieldKey: string;
  name: string;
  unit: string;
  minPlausible: number;
  maxPlausible: number;
  typicalMin: number;
  typicalMax: number;
  decimalDivisors?: number[]; // e.g. [10, 100]
}

const CBC_RULES: ParamRule[] = [
  { fieldKey: "hemoglobin", name: "Hemoglobin", unit: "g/dL", minPlausible: 3.0, maxPlausible: 25.0, typicalMin: 10.0, typicalMax: 18.0, decimalDivisors: [10, 100] },
  { fieldKey: "rbc", name: "RBC Count", unit: "x10^12/L", minPlausible: 1.5, maxPlausible: 9.0, typicalMin: 3.5, typicalMax: 6.5, decimalDivisors: [10, 100] },
  { fieldKey: "hematocrit", name: "Hematocrit (PCV)", unit: "%", minPlausible: 15.0, maxPlausible: 70.0, typicalMin: 30.0, typicalMax: 55.0, decimalDivisors: [10] },
  { fieldKey: "mcv", name: "MCV (Cell Volume)", unit: "fL", minPlausible: 45.0, maxPlausible: 150.0, typicalMin: 70.0, typicalMax: 110.0, decimalDivisors: [10] },
  { fieldKey: "mch", name: "MCH (Cellular Hb)", unit: "pg", minPlausible: 12.0, maxPlausible: 50.0, typicalMin: 22.0, typicalMax: 36.0, decimalDivisors: [10] },
  { fieldKey: "mchc", name: "MCHC Concentration", unit: "g/dL", minPlausible: 20.0, maxPlausible: 45.0, typicalMin: 28.0, typicalMax: 38.0, decimalDivisors: [10] },
  { fieldKey: "rdw", name: "RDW (Size Variation)", unit: "%", minPlausible: 8.0, maxPlausible: 35.0, typicalMin: 11.0, typicalMax: 20.0, decimalDivisors: [10] },
  { fieldKey: "vitaminB12", name: "Serum Vitamin B12", unit: "pg/mL", minPlausible: 40.0, maxPlausible: 3000.0, typicalMin: 150.0, typicalMax: 1500.0, decimalDivisors: [10] },
  { fieldKey: "neutrophils", name: "Neutrophils", unit: "%", minPlausible: 5.0, maxPlausible: 98.0, typicalMin: 35.0, typicalMax: 80.0, decimalDivisors: [10] },
  { fieldKey: "lymphocytes", name: "Lymphocytes", unit: "%", minPlausible: 2.0, maxPlausible: 95.0, typicalMin: 15.0, typicalMax: 50.0, decimalDivisors: [10] },
];

const LFT_RULES: ParamRule[] = [
  { fieldKey: "totalBilirubin", name: "Total Bilirubin", unit: "mg/dL", minPlausible: 0.1, maxPlausible: 30.0, typicalMin: 0.2, typicalMax: 2.0, decimalDivisors: [10, 100] },
  { fieldKey: "directBilirubin", name: "Direct Bilirubin", unit: "mg/dL", minPlausible: 0.0, maxPlausible: 15.0, typicalMin: 0.0, typicalMax: 0.8, decimalDivisors: [10, 100] },
  { fieldKey: "albumin", name: "Serum Albumin", unit: "g/dL", minPlausible: 1.5, maxPlausible: 6.5, typicalMin: 3.0, typicalMax: 5.5, decimalDivisors: [10, 100] },
  { fieldKey: "totalProtein", name: "Total Protein", unit: "g/dL", minPlausible: 3.5, maxPlausible: 12.0, typicalMin: 5.5, typicalMax: 9.0, decimalDivisors: [10, 100] },
  { fieldKey: "inr", name: "INR", unit: "", minPlausible: 0.6, maxPlausible: 6.0, typicalMin: 0.8, typicalMax: 2.5, decimalDivisors: [10, 100] },
  { fieldKey: "alt", name: "ALT (SGPT)", unit: "U/L", minPlausible: 3.0, maxPlausible: 3000.0, typicalMin: 10.0, typicalMax: 200.0 },
  { fieldKey: "ast", name: "AST (SGOT)", unit: "U/L", minPlausible: 3.0, maxPlausible: 3000.0, typicalMin: 10.0, typicalMax: 200.0 },
  { fieldKey: "alp", name: "ALP (Alk Phos)", unit: "U/L", minPlausible: 15.0, maxPlausible: 2500.0, typicalMin: 40.0, typicalMax: 300.0 },
  { fieldKey: "ggt", name: "GGT", unit: "U/L", minPlausible: 3.0, maxPlausible: 2000.0, typicalMin: 8.0, typicalMax: 150.0 },
  { fieldKey: "triglycerides", name: "Triglycerides", unit: "mg/dL", minPlausible: 20.0, maxPlausible: 2000.0, typicalMin: 50.0, typicalMax: 500.0 },
  { fieldKey: "fastingGlucose", name: "Fasting Glucose", unit: "mg/dL", minPlausible: 30.0, maxPlausible: 700.0, typicalMin: 65.0, typicalMax: 250.0 },
  { fieldKey: "waistCircumference", name: "Waist Circumference", unit: "cm", minPlausible: 45.0, maxPlausible: 200.0, typicalMin: 60.0, typicalMax: 140.0, decimalDivisors: [10] },
];

const METABOLIC_RULES: ParamRule[] = [
  { fieldKey: "creatinine", name: "Serum Creatinine", unit: "mg/dL", minPlausible: 0.2, maxPlausible: 15.0, typicalMin: 0.5, typicalMax: 2.0, decimalDivisors: [10, 100] },
  { fieldKey: "hba1c", name: "HbA1c", unit: "%", minPlausible: 3.5, maxPlausible: 18.0, typicalMin: 4.5, typicalMax: 12.0, decimalDivisors: [10] },
  { fieldKey: "acr", name: "Urine ACR", unit: "mg/g", minPlausible: 1.0, maxPlausible: 6000.0, typicalMin: 5.0, typicalMax: 1000.0 },
];

/**
 * Validates a set of form values against physiological ranges and finds missing decimals.
 */
export function checkDecimalPlausibility(
  analysisType: "cbc" | "lft" | "metabolic",
  values: Record<string, any>
): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = [];
  const rules = analysisType === "cbc" ? CBC_RULES : analysisType === "lft" ? LFT_RULES : METABOLIC_RULES;

  for (const rule of rules) {
    const raw = values[rule.fieldKey];
    if (raw === undefined || raw === null || raw === "") continue;

    const num = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, ""));
    if (isNaN(num) || num <= 0) continue;

    // Check if value is outside the physiological plausible range
    if (num > rule.maxPlausible || num < rule.minPlausible) {
      let suggested: number | undefined = undefined;

      // Try division by 10, 100 to see if it lands inside typical range
      if (rule.decimalDivisors) {
        for (const div of rule.decimalDivisors) {
          const candidate = parseFloat((num / div).toFixed(2));
          if (candidate >= rule.typicalMin && candidate <= rule.typicalMax) {
            suggested = candidate;
            break;
          }
        }
      }

      // Build clinical explanation
      let reason = "";
      if (num > rule.maxPlausible) {
        reason = suggested 
          ? `Reading of ${num} ${rule.unit} is exceptionally high. Missing decimal point suspected (likely intended as ${suggested} ${rule.unit}).`
          : `Reading of ${num} ${rule.unit} is exceptionally high for human physiology. Please inspect the decimal point on your report.`;
      } else {
        reason = `Reading of ${num} ${rule.unit} is exceptionally low. Please check decimal placement against original lab report.`;
      }

      issues.push({
        fieldKey: rule.fieldKey,
        parameterName: rule.name,
        currentValue: num,
        suggestedValue: suggested,
        unit: rule.unit,
        reason,
        severity: "critical",
      });
    }
  }

  return issues;
}
