import { LFTInputs, LFTResults, BMIInputs, BMIResults, CBCInputs, CBCResults, RiskLevel, MetabolicInputs, MetabolicResults } from "../types";

export function calculateLFT(inputs: LFTInputs): LFTResults {
  const {
    alt,
    ast,
    alp,
    ggt,
    totalBilirubin,
    directBilirubin,
    albumin,
    totalProtein,
    inr,
    platelets,
    age,
    astUln,
    weight,
    height,
    diabetes,
    gender,
    fastingBloodGlucose,
    triglycerides,
    hdlCholesterol,
    systolicBp,
    diastolicBp,
    onHypertensionMeds,
    urineAcr,
    waistCircumference,
  } = inputs;

  // 1. AST/ALT Ratio (De Ritis ratio)
  const astAltRatio = alt > 0 ? ast / alt : 0;
  let astAltInterpretation = "";
  if (astAltRatio < 1) {
    astAltInterpretation = "< 1 – Hepatocellular pattern (viral/toxic hepatitis likely)";
  } else if (astAltRatio < 2) {
    astAltInterpretation = "1–2 – Borderline; lifestyle, alcohol, or metabolic-dysfunction fatty liver possible";
  } else {
    astAltInterpretation = "≥ 2 – Alcoholic liver disease, advanced fibrosis, or cirrhosis likely";
  }

  // 2. NAFLD (Non-Alcoholic Fatty Liver Disease) Activity Score
  let nafldScore = 0;
  if (alt > 40) nafldScore += alt > 80 ? 2 : 1;
  if (ast > 40) nafldScore += ast > 80 ? 2 : 1;
  if (ggt && ggt > 55) nafldScore += ggt > 100 ? 2 : 1;
  if (astAltRatio > 1) nafldScore += 1;
  if (albumin < 3.5) nafldScore += 2;
  if (totalBilirubin > 1.2) nafldScore += 1;

  let nafldRisk: RiskLevel = "low";
  let nafldDescription = "";
  if (nafldScore <= 2) {
    nafldRisk = "low";
    nafldDescription = "Low NAFLD risk – Liver enzymes and indicators are within acceptable ranges";
  } else if (nafldScore <= 4) {
    nafldRisk = "moderate";
    nafldDescription = "Moderate NAFLD/MASH risk – Metabolic load check or lifestyle modifications recommended";
  } else if (nafldScore <= 6) {
    nafldRisk = "high";
    nafldDescription = "High NAFLD/fatty liver risk – Consultation with an expert hepatology team advised";
  } else {
    nafldRisk = "critical";
    nafldDescription = "Critical NAFLD risk – Suspicion of advanced fibrosis or liver compromise. Urgent clinic check needed";
  }

  // 3. FIB-4 Score (Vallet-Pichard 2007)
  // Formula: (Age * AST) / (Platelets * sqrt(ALT))
  let fib4Score: number | undefined;
  let fib4Interpretation: string | undefined;
  let fib4Risk: "low" | "moderate" | "high" | undefined;

  if (age !== undefined && platelets !== undefined && alt > 0 && platelets > 0) {
    fib4Score = parseFloat(((age * ast) / (platelets * Math.sqrt(alt))).toFixed(2));
    if (fib4Score < 1.30) {
      fib4Risk = "low";
      fib4Interpretation = "< 1.30 – Low fibrosis risk (F0-F1); Negative Predictive Value ~90%";
    } else if (fib4Score <= 2.67) {
      fib4Risk = "moderate";
      fib4Interpretation = "1.30–2.67 – Indeterminate risk; non-invasive FibroScan or biomarker checks recommended";
    } else {
      fib4Risk = "high";
      fib4Interpretation = "> 2.67 – High fibrosis risk (F3-F4); Positive Predictive Value ~65%";
    }
  }

  // 4. APRI Score (Wai 2003)
  // Formula: ((AST / AST ULN) / Platelets) * 100
  let apriScore: number | undefined;
  let apriInterpretation: string | undefined;
  let apriRisk: "low" | "moderate" | "high" | undefined;
  const effectiveUln = astUln ?? 40;

  if (platelets !== undefined && platelets > 0) {
    apriScore = parseFloat((((ast / effectiveUln) / platelets) * 100).toFixed(2));
    if (apriScore < 0.5) {
      apriRisk = "low";
      apriInterpretation = "< 0.5 – Significant fibrosis ruled out (F0-F1)";
    } else if (apriScore <= 1.5) {
      apriRisk = "moderate";
      apriInterpretation = "0.5–1.5 – Indeterminate range; further evaluation suggested";
    } else {
      apriRisk = "high";
      apriInterpretation = apriScore > 2.0 
        ? "> 2.0 – Cirrhosis highly likely (Positive Predictive Value ~75%)" 
        : "> 1.5 – Significant fibrosis likely (F2-F4)";
    }
  }

  // 5. BARD Score (Harrison 2008)
  // BMI >= 28 (+1) | AST/ALT >= 0.8 (+2) | Diabetes (+1). Range 0 to 4.
  let bardScore: number | undefined;
  let bardRisk: string | undefined;
  let bardDetails: string[] | undefined;

  if (weight !== undefined && height !== undefined && height > 0) {
    const bmi = weight / Math.pow(height / 100, 2);
    bardScore = 0;
    bardDetails = [];

    if (bmi >= 28) {
      bardScore += 1;
      bardDetails.push(`BMI ${bmi.toFixed(1)} ≥ 28 (+1)`);
    } else {
      bardDetails.push(`BMI ${bmi.toFixed(1)} < 28 (+0)`);
    }

    if (astAltRatio >= 0.8) {
      bardScore += 2;
      bardDetails.push(`AST/ALT ${astAltRatio.toFixed(2)} ≥ 0.8 (+2)`);
    } else {
      bardDetails.push(`AST/ALT ${astAltRatio.toFixed(2)} < 0.8 (+0)`);
    }

    if (diabetes) {
      bardScore += 1;
      bardDetails.push("Diabetes present (+1)");
    } else {
      bardDetails.push("No diabetes (+0)");
    }

    bardRisk = bardScore >= 2
      ? `Score ${bardScore} – High risk of advanced fibrosis/NASH`
      : `Score ${bardScore} – Low risk of advanced fibrosis`;
  }

  // 6. Child-Pugh Score
  let childPughScore: number | undefined;
  let childPughClass: string | undefined;
  if (inr !== undefined) {
    let score = 0;
    // Total Bilirubin score
    score += totalBilirubin < 2.0 ? 1 : totalBilirubin <= 3.0 ? 2 : 3;
    // Albumin score
    score += albumin > 3.5 ? 1 : albumin >= 2.8 ? 2 : 3;
    // INR score
    score += inr < 1.7 ? 1 : inr <= 2.2 ? 2 : 3;
    // Encephalopathy and Ascites default to None (1 + 1)
    score += 1; // Ascites: None (+1)
    score += 1; // Encephalopathy: None (+1)

    childPughScore = score;
    childPughClass = score <= 6 ? "Class A (Well compensated, 100% 1yr survival)" : score <= 9 ? "Class B (Significant functional compromise)" : "Class C (Decompensated liver disease)";
  }

  // 7. MELD Score (Model for End-Stage Liver Disease)
  let meldScore: number | undefined;
  if (inr !== undefined) {
    const biliVal = Math.max(totalBilirubin, 1);
    const inrVal = Math.max(inr, 1);
    // Creatinine is assumed 1.0 mg/dL if not supplied to keep it within safe assumptions.
    const creatinineVal = 1.0;
    // MELD Formula: 3.78 * ln(Bili) + 11.2 * ln(INR) + 9.57 * ln(Creatinine) + 6.43
    // Standard UNOS MELD score calculation rounded to integer:
    meldScore = Math.round(3.78 * Math.log(biliVal) + 11.2 * Math.log(inrVal) + 9.57 * Math.log(creatinineVal) + 6.43);
    meldScore = Math.max(6, Math.min(40, meldScore));
  }

  // Fibrosis legacy scores kept for UI compatibility
  const fibrosisScore = fib4Score ?? (nafldScore * 0.8 + (astAltRatio > 1 ? 1.5 : 0));
  let fibrosisStage = "";
  if (fibrosisScore < 1.3) {
    fibrosisStage = "F0-F1 – No to mild fibrosis";
  } else if (fibrosisScore < 2.67) {
    fibrosisStage = "F2-F3 – Significant active fibrosis";
  } else {
    fibrosisStage = "F4 – Advanced fibrosis / liver cirrhosis likely";
  }

  // Construct patient summary string
  const fibPart = fib4Score !== undefined ? `FIB-4: ${fib4Score}` : "";
  const apriPart = apriScore !== undefined ? `APRI: ${apriScore}` : "";
  const summary = [
    `NAFLD Risk: ${nafldRisk.toUpperCase()}`,
    `AST/ALT Ratio: ${astAltRatio.toFixed(2)}`,
    fibPart,
    apriPart
  ].filter(Boolean).join(" | ");

  // NCEP ATP III Metabolic Syndrome Evaluation
  let ncepMetabolicSyndrome: any = undefined;
  const isMale = gender === "male";
  const hasMetabolicData = waistCircumference !== undefined || triglycerides !== undefined || hdlCholesterol !== undefined || systolicBp !== undefined || diastolicBp !== undefined || fastingBloodGlucose !== undefined || diabetes || onHypertensionMeds;

  if (hasMetabolicData) {
    const criteriaMet: string[] = [];
    const criteriaNotMet: string[] = [];
    let count = 0;

    // 1. Waist Circumference (NCEP ATP III Cutoffs: Male > 102cm, Female > 88cm)
    if (waistCircumference !== undefined) {
      const threshold = isMale ? 102 : 88;
      if (waistCircumference > threshold) {
        criteriaMet.push(`Waist Circumference: ${waistCircumference} cm (> ${threshold} cm)`);
        count++;
      } else {
        criteriaNotMet.push(`Waist Circumference: ${waistCircumference} cm (≤ ${threshold} cm)`);
      }
    } else {
      criteriaNotMet.push("Waist Circumference: Not Provided");
    }

    // 2. Triglycerides ≥150 mg/dL
    if (triglycerides !== undefined) {
      if (triglycerides >= 150) {
        criteriaMet.push(`Triglycerides: ${triglycerides} mg/dL (≥ 150 mg/dL)`);
        count++;
      } else {
        criteriaNotMet.push(`Triglycerides: ${triglycerides} mg/dL (< 150 mg/dL)`);
      }
    } else {
      criteriaNotMet.push("Triglycerides: Not Provided");
    }

    // 3. HDL Cholesterol: Male <40 mg/dL, Female <50 mg/dL
    if (hdlCholesterol !== undefined) {
      const hdlThreshold = isMale ? 40 : 50;
      if (hdlCholesterol < hdlThreshold) {
        criteriaMet.push(`HDL Cholesterol: ${hdlCholesterol} mg/dL (< ${hdlThreshold} mg/dL)`);
        count++;
      } else {
        criteriaNotMet.push(`HDL Cholesterol: ${hdlCholesterol} mg/dL (≥ ${hdlThreshold} mg/dL)`);
      }
    } else {
      criteriaNotMet.push("HDL Cholesterol: Not Provided");
    }

    // 4. Blood Pressure ≥130/85 mmHg or treatment for hypertension
    if (systolicBp !== undefined || diastolicBp !== undefined || onHypertensionMeds) {
      const sBp = systolicBp ?? 0;
      const dBp = diastolicBp ?? 0;
      if (sBp >= 130 || dBp >= 85 || onHypertensionMeds) {
        let text = "BP/Hypertension: ";
        if (onHypertensionMeds) text += "On hypertension treatment";
        else text += `${sBp}/${dBp} mmHg (≥ 130/85 mmHg)`;
        criteriaMet.push(text);
        count++;
      } else {
        criteriaNotMet.push(`BP/Hypertension: ${sBp}/${dBp} mmHg (< 130/85 mmHg)`);
      }
    } else {
      criteriaNotMet.push("BP/Hypertension: Not Provided");
    }

    // 5. Fasting Blood Glucose ≥100 mg/dL or diabetes
    if (fastingBloodGlucose !== undefined || diabetes) {
      const glucoseVal = fastingBloodGlucose ?? 0;
      if (glucoseVal >= 100 || diabetes) {
        let text = "Fasting Glucose: ";
        if (diabetes) text += "History of Type 2 Diabetes";
        else text += `${glucoseVal} mg/dL (≥ 100 mg/dL)`;
        criteriaMet.push(text);
        count++;
      } else {
        criteriaNotMet.push(`Fasting Glucose: ${glucoseVal} mg/dL (< 100 mg/dL)`);
      }
    } else {
      criteriaNotMet.push("Fasting Glucose: Not Provided");
    }

    const met = count >= 3;
    const conclusion = met 
      ? `Metabolic Syndrome Present (${count}/5 criteria met)` 
      : `Metabolic Syndrome Not Present (${count}/5 criteria met)`;

    ncepMetabolicSyndrome = {
      met,
      criteriaMet,
      criteriaNotMet,
      count,
      conclusion
    };
  }

  // 9. Urine ACR Interpretation
  let acrAssessment: any = undefined;
  if (urineAcr !== undefined) {
    let category = "";
    let description = "";
    let clinicalSignificance = "";

    if (urineAcr < 30) {
      category = "Normal to mildly increased";
      description = "Urine ACR < 30 mg/g is within the normal healthy excretion rate.";
      clinicalSignificance = "Low risk for diabetic kidney disease. Maintain good blood glucose and blood pressure controls.";
    } else if (urineAcr <= 300) {
      category = "Moderately increased albuminuria";
      description = "Urine ACR 30–300 mg/g indicates moderately elevated albumin elimination (microalbuminuria).";
      clinicalSignificance = "Indicates early metabolic renal stress and elevated cardiovascular risk. ACE inhibitors/ARBs should be clinically correlated.";
    } else {
      category = "Severely increased albuminuria";
      description = "Urine ACR > 300 mg/g indicates severely elevated albumin elimination (macroalbuminuria).";
      clinicalSignificance = "Significant nephropathy and systemic cardiovascular threat. Requires intensive, prompt clinical intervention.";
    }

    acrAssessment = {
      value: urineAcr,
      category,
      description,
      clinicalSignificance
    };
  }

  return {
    nafldScore,
    nafldRisk,
    nafldDescription,
    astAltRatio: parseFloat(astAltRatio.toFixed(2)),
    astAltInterpretation,
    childPughScore,
    childPughClass,
    meldScore,
    fib4Score,
    fib4Interpretation,
    fib4Risk,
    apriScore,
    apriInterpretation,
    apriRisk,
    bardScore,
    bardRisk,
    bardDetails,
    fibrosisScore: parseFloat(fibrosisScore.toFixed(2)),
    fibrosisStage,
    summary,
    ncepMetabolicSyndrome,
    acrAssessment,
  };
}

export function calculateBMI(inputs: BMIInputs): BMIResults {
  const { weight, height, age, gender, waist, hip } = inputs;
  const heightM = height / 100;
  const bmi = heightM > 0 ? weight / (heightM * heightM) : 0;

  let category = "";
  let riskLevel: RiskLevel = "low";
  if (bmi < 18.5) {
    category = "Underweight";
    riskLevel = "moderate";
  } else if (bmi < 25.0) {
    category = "Normal Weight";
    riskLevel = "low";
  } else if (bmi < 30.0) {
    category = "Overweight";
    riskLevel = "moderate";
  } else if (bmi < 35.0) {
    category = "Obese Class I";
    riskLevel = "high";
  } else if (bmi < 40.0) {
    category = "Obese Class II";
    riskLevel = "high";
  } else {
    category = "Obese Class III (Morbid)";
    riskLevel = "critical";
  }

  const idealWeightMin = 18.5 * heightM * heightM;
  const idealWeightMax = 24.9 * heightM * heightM;

  let whr: number | undefined;
  let whrInterpretation: string | undefined;
  if (waist && hip && hip > 0) {
    whr = parseFloat((waist / hip).toFixed(2));
    const isMale = gender === "male";
    const threshold = isMale ? 0.95 : 0.85;
    if (whr > threshold) {
      whrInterpretation = `High abdominal adiposity (${whr}) – elevated metabolic & vascular risk`;
    } else {
      whrInterpretation = `Normal waist-to-hip ratio (${whr})`;
    }
  }

  let metabolicRisk = "";
  if (bmi >= 30) {
    metabolicRisk = "High risk of metabolic syndrome, fatty liver (NAFLD), T2DM, and hepatic steatosis";
  } else if (bmi >= 25) {
    metabolicRisk = "Moderate risk – steady active threshold of fatty infiltration in hepatic tissues";
  } else if (bmi < 18.5) {
    metabolicRisk = "Nutritional scarcity risk – liver requires balanced metabolic building-blocks";
  } else {
    metabolicRisk = "Healthy baseline hepatic status – low weight-determined metabolic strain";
  }

  const summary = `BMI: ${bmi.toFixed(1)} (${category}) | WHR: ${whr ?? "N/A"}`;

  return {
    bmi: parseFloat(bmi.toFixed(1)),
    category,
    riskLevel,
    idealWeightMin: parseFloat(idealWeightMin.toFixed(1)),
    idealWeightMax: parseFloat(idealWeightMax.toFixed(1)),
    whr,
    whrInterpretation,
    metabolicRisk,
    summary,
  };
}

export function calculateCBC(inputs: CBCInputs): CBCResults {
  const {
    hemoglobin,
    hematocrit,
    rbc,
    wbc,
    platelets,
    mcv,
    mch,
    mchc,
    neutrophils,
    lymphocytes,
    gender,
  } = inputs;

  let abnormalCount = 0;

  // 1. Hemoglobin Assessment
  const hbMin = gender === "male" ? 13.5 : 12.0;
  const hbMax = gender === "male" ? 17.5 : 15.5;
  let hemoglobinStatus = "Normal";
  let anemiaType: string | undefined;

  if (hemoglobin < hbMin) {
    abnormalCount++;
    if (mcv < 80) {
      anemiaType = "Microcytic anemia (likely iron deficiency, chronic blood loss, or thalassemia trait)";
      hemoglobinStatus = "Low – Microcytic";
    } else if (mcv > 100) {
      anemiaType = "Macrocytic anemia (possible Vitamin B12 or Folate deficiency)";
      hemoglobinStatus = "Low – Macrocytic";
    } else {
      anemiaType = "Normocytic anemia (possible active infection, chronic inflammatory disease, or anemia of chronic disease)";
      hemoglobinStatus = "Low – Normocytic";
    }
  } else if (hemoglobin > hbMax) {
    abnormalCount++;
    hemoglobinStatus = "High – Polycythemia (could indicate dehydration or elevated red cell mass)";
  }

  // 2. WBC Assessment (White Blood Cells)
  let wbcStatus = "Normal";
  let infectionRisk = "Normal immunological count";
  if (wbc < 4.5) {
    abnormalCount++;
    wbcStatus = "Low (Leukopenia)";
    infectionRisk = "Increased infection vulnerability – potential bone marrow suppression or viral status";
  } else if (wbc > 11.0) {
    abnormalCount++;
    wbcStatus = "High (Leukocytosis)";
    infectionRisk = wbc > 20.0
      ? "Significant leukocytosis – suspicion of acute systemic infection or chronic hematological process"
      : "Mild rise – possible biological stress response, inflammatory response, or mild infection";
  }

  // 3. Platelets Assessment
  let plateletStatus = "Normal";
  if (platelets < 150) {
    abnormalCount++;
    plateletStatus = platelets < 50
      ? "Critical – severe thrombocytopenia (high systemic bleeding warning)"
      : "Low – mild to moderate thrombocytopenia (often seen in passive portal hypertension / splenomegaly)";
  } else if (platelets > 450) {
    abnormalCount++;
    plateletStatus = "High (Thrombocytosis) – reactive inflammation or essential thrombocythemia";
  }

  // 4. NLR Ratio (Neutrophil-to-Lymphocyte Ratio)
  let nlratio: number | undefined;
  let nlratioInterpretation: string | undefined;
  if (neutrophils && lymphocytes && lymphocytes > 0) {
    nlratio = parseFloat((neutrophils / lymphocytes).toFixed(2));
    if (nlratio > 3.0) {
      nlratioInterpretation = `Elevated NLR (${nlratio}) – suggests systemic stress response, infection, or chronic low-grade inflammation`;
    } else if (nlratio < 1.0) {
      nlratioInterpretation = `Low NLR (${nlratio}) – potential viral suppression or hematological shift`;
    } else {
      nlratioInterpretation = `Balanced baseline immunoprofile (NLR: ${nlratio})`;
    }
  }

  // 5. Triage Level
  let riskLevel: RiskLevel = "low";
  let overallStatus = "Normal baseline immunoprofile";
  if (abnormalCount === 0) {
    riskLevel = "low";
    overallStatus = "All core CBC parameters remain within standard clinical reference ranges";
  } else if (abnormalCount === 1) {
    riskLevel = "moderate";
    overallStatus = "Single out-of-range metric detected – clinical context and symptom tracking requested";
  } else if (abnormalCount === 2) {
    riskLevel = "high";
    overallStatus = "Multiple deviations found – recommend expert primary care checkup";
  } else {
    riskLevel = "critical";
    overallStatus = "Clustered hematological exceptions – urgent physician clinical overview recommended";
  }

  const summary = `Hb: ${hemoglobin} | WBC: ${wbc} | Plt: ${platelets} | Status: ${abnormalCount} Abnormalities`;

  return {
    hemoglobinStatus,
    anemiaType,
    wbcStatus,
    infectionRisk,
    plateletStatus,
    nlratio,
    nlratioInterpretation,
    overallStatus,
    riskLevel,
    abnormalCount,
    summary,
  };
}

export function calculateMetabolic(inputs: MetabolicInputs): MetabolicResults {
  const {
    gender,
    age,
    diabetes,
    fastingBloodGlucose,
    triglycerides,
    hdlCholesterol,
    systolicBp,
    diastolicBp,
    onHypertensionMeds,
    urineAcr,
    waistCircumference,
  } = inputs;

  const isMale = gender === "male";
  let ncepMetabolicSyndrome: any = undefined;
  const hasMetabolicData = waistCircumference !== undefined || triglycerides !== undefined || hdlCholesterol !== undefined || systolicBp !== undefined || diastolicBp !== undefined || fastingBloodGlucose !== undefined || diabetes || onHypertensionMeds;

  if (hasMetabolicData) {
    const criteriaMet: string[] = [];
    const criteriaNotMet: string[] = [];
    let count = 0;

    // 1. Waist Circumference
    if (waistCircumference !== undefined) {
      const threshold = isMale ? 102 : 88;
      if (waistCircumference > threshold) {
        criteriaMet.push(`Waist Circumference: ${waistCircumference} cm (> ${threshold} cm)`);
        count++;
      } else {
        criteriaNotMet.push(`Waist Circumference: ${waistCircumference} cm (≤ ${threshold} cm)`);
      }
    } else {
      criteriaNotMet.push("Waist Circumference: Not Provided");
    }

    // 2. Triglycerides ≥150 mg/dL
    if (triglycerides !== undefined) {
      if (triglycerides >= 150) {
        criteriaMet.push(`Triglycerides: ${triglycerides} mg/dL (≥ 150 mg/dL)`);
        count++;
      } else {
        criteriaNotMet.push(`Triglycerides: ${triglycerides} mg/dL (< 150 mg/dL)`);
      }
    } else {
      criteriaNotMet.push("Triglycerides: Not Provided");
    }

    // 3. HDL Cholesterol
    if (hdlCholesterol !== undefined) {
      const hdlThreshold = isMale ? 40 : 50;
      if (hdlCholesterol < hdlThreshold) {
        criteriaMet.push(`HDL Cholesterol: ${hdlCholesterol} mg/dL (< ${hdlThreshold} mg/dL)`);
        count++;
      } else {
        criteriaNotMet.push(`HDL Cholesterol: ${hdlCholesterol} mg/dL (≥ ${hdlThreshold} mg/dL)`);
      }
    } else {
      criteriaNotMet.push("HDL Cholesterol: Not Provided");
    }

    // 4. Blood Pressure
    if (systolicBp !== undefined || diastolicBp !== undefined || onHypertensionMeds) {
      const sBp = systolicBp ?? 0;
      const dBp = diastolicBp ?? 0;
      if (sBp >= 130 || dBp >= 85 || onHypertensionMeds) {
        let text = "BP/Hypertension: ";
        if (onHypertensionMeds) text += "On hypertension treatment";
        else text += `${sBp}/${dBp} mmHg (≥ 130/85 mmHg)`;
        criteriaMet.push(text);
        count++;
      } else {
        criteriaNotMet.push(`BP/Hypertension: ${sBp}/${dBp} mmHg (< 130/85 mmHg)`);
      }
    } else {
      criteriaNotMet.push("BP/Hypertension: Not Provided");
    }

    // 5. Fasting Blood Glucose
    if (fastingBloodGlucose !== undefined || diabetes) {
      const glucoseVal = fastingBloodGlucose ?? 0;
      if (glucoseVal >= 100 || diabetes) {
        let text = "Fasting Glucose: ";
        if (diabetes) text += "History of Type 2 Diabetes";
        else text += `${glucoseVal} mg/dL (≥ 100 mg/dL)`;
        criteriaMet.push(text);
        count++;
      } else {
        criteriaNotMet.push(`Fasting Glucose: ${glucoseVal} mg/dL (< 100 mg/dL)`);
      }
    } else {
      criteriaNotMet.push("Fasting Glucose: Not Provided");
    }

    const met = count >= 3;
    const conclusion = met 
      ? `Metabolic Syndrome Present (${count}/5 criteria met)` 
      : `Metabolic Syndrome Not Present (${count}/5 criteria met)`;

    ncepMetabolicSyndrome = {
      met,
      criteriaMet,
      criteriaNotMet,
      count,
      conclusion
    };
  }

  // Urine ACR Interpretation
  let acrAssessment: any = undefined;
  if (urineAcr !== undefined) {
    let category = "";
    let description = "";
    let clinicalSignificance = "";

    if (urineAcr < 30) {
      category = "Normal to mildly increased";
      description = "Urine ACR < 30 mg/g is within the normal healthy excretion rate.";
      clinicalSignificance = "Low risk for diabetic kidney disease. Maintain good blood glucose and blood pressure controls.";
    } else if (urineAcr <= 300) {
      category = "Moderately increased albuminuria";
      description = "Urine ACR 30–300 mg/g indicates moderately elevated albumin elimination (microalbuminuria).";
      clinicalSignificance = "Indicates early metabolic renal stress and elevated cardiovascular risk. ACE inhibitors/ARBs should be clinically correlated.";
    } else {
      category = "Severely increased albuminuria";
      description = "Urine ACR > 300 mg/g indicates severely elevated albumin elimination (macroalbuminuria).";
      clinicalSignificance = "Significant nephropathy and systemic cardiovascular threat. Requires intensive, prompt clinical intervention.";
    }

    acrAssessment = {
      value: urineAcr,
      category,
      description,
      clinicalSignificance
    };
  }

  // Risk Rating logic
  let riskLevel: RiskLevel = "low";
  if (ncepMetabolicSyndrome?.met || (acrAssessment && acrAssessment.value > 300)) {
    riskLevel = "high";
  } else if ((ncepMetabolicSyndrome && ncepMetabolicSyndrome.count > 0) || (acrAssessment && acrAssessment.value >= 30)) {
    riskLevel = "moderate";
  }

  const metabolicSummaryStr = ncepMetabolicSyndrome 
    ? `Metabolic: ${ncepMetabolicSyndrome.count}/5 Met` 
    : "No Metabolic Data";
  const kidneySummaryStr = acrAssessment 
    ? `ACR: ${acrAssessment.value} mg/g (${acrAssessment.category})` 
    : "No Kidney Data";
  const summary = `${metabolicSummaryStr} | ${kidneySummaryStr}`;

  return {
    summary,
    riskLevel,
    ncepMetabolicSyndrome,
    acrAssessment
  };
}
