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

  // 6. Fatty Liver Index (FLI) - Bedogni et al., 2006 (EASL/AASLD/INASL Validated)
  // Required Parameters: Triglycerides (mg/dL), GGT (U/L), Waist Circumference (cm), and BMI (kg/m²)
  let fliScore: number | undefined;
  let fliRisk: "low" | "intermediate" | "high" | undefined;
  let fliInterpretation: string | undefined;
  let fliBreakdown: { bmi: number; waistCircumference: number; triglycerides: number; ggt: number } | undefined;

  const bmiVal = (weight !== undefined && height !== undefined && height > 0)
    ? weight / ((height / 100) ** 2)
    : undefined;

  if (
    bmiVal !== undefined &&
    triglycerides !== undefined &&
    ggt !== undefined &&
    waistCircumference !== undefined &&
    triglycerides > 0 &&
    ggt > 0 &&
    waistCircumference > 0 &&
    bmiVal > 0
  ) {
    const lnTG = Math.log(triglycerides);
    const lnGGT = Math.log(ggt);
    const y = 0.953 * lnTG + 0.139 * bmiVal + 0.718 * lnGGT + 0.053 * waistCircumference - 15.745;
    const expY = Math.exp(y);
    const rawFli = (expY / (1 + expY)) * 100;
    fliScore = parseFloat(rawFli.toFixed(1));

    if (fliScore < 30) {
      fliRisk = "low";
      fliInterpretation = "Low Risk of Hepatic Steatosis (Rule-out fatty liver, NPV ~91%)";
    } else if (fliScore < 60) {
      fliRisk = "intermediate";
      fliInterpretation = "Intermediate / Indeterminate Risk of Hepatic Steatosis (Clinical monitoring advised)";
    } else {
      fliRisk = "high";
      fliInterpretation = "High Risk of Hepatic Steatosis (Rule-in fatty liver, PPV ~84%)";
    }

    fliBreakdown = {
      bmi: parseFloat(bmiVal.toFixed(1)),
      waistCircumference,
      triglycerides,
      ggt
    };
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
  const fliPart = fliScore !== undefined ? `FLI: ${fliScore} (${fliRisk?.toUpperCase()})` : "";
  const summary = [
    `NAFLD Risk: ${nafldRisk.toUpperCase()}`,
    `AST/ALT Ratio: ${astAltRatio.toFixed(2)}`,
    fliPart,
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
    fliScore,
    fliRisk,
    fliInterpretation,
    fliBreakdown,
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
    rdw,
    vitaminB12,
    neutrophils,
    lymphocytes,
    gender,
  } = inputs;

  let abnormalCount = 0;

  // 1. Hemoglobin Assessment
  const hbMin = gender === "male" ? 13.5 : 12.0;
  const hbMax = gender === "male" ? 17.5 : 15.5;
  let hemoglobinStatus = "Normal";
  let isAnemic = false;

  if (hemoglobin < hbMin) {
    abnormalCount++;
    isAnemic = true;
    if (mcv < 80) {
      hemoglobinStatus = "Low – Microcytic";
    } else if (mcv > 100) {
      hemoglobinStatus = "Low – Macrocytic";
    } else {
      hemoglobinStatus = "Low – Normocytic";
    }
  } else if (hemoglobin > hbMax) {
    abnormalCount++;
    hemoglobinStatus = "High – Polycythemia / Erythrocytosis";
  }

  // 2. Red Cell Indices Interpretations (MCV, MCH, MCHC)
  // 2a. MCV (Mean Corpuscular Volume: 80 - 100 fL)
  let mcvStatus = "Normal (Normocytic)";
  let mcvInterpretation = "Erythrocyte volume is within standard reference range (80–100 fL).";
  if (mcv < 80) {
    abnormalCount++;
    mcvStatus = "Low (Microcytic)";
    mcvInterpretation = "Microcytic erythrocytes (< 80 fL). Suggestive of iron deficiency, thalassemia trait, or sideroblastic anemia.";
  } else if (mcv > 100) {
    abnormalCount++;
    mcvStatus = "High (Macrocytic)";
    mcvInterpretation = "Macrocytic erythrocytes (> 100 fL). Suggestive of Vitamin B12 deficiency, folate deficiency, reticulocytosis, alcoholism, or liver disease.";
  }

  // 2b. MCH (Mean Corpuscular Hemoglobin: 27 - 33 pg)
  let mchStatus = "Normal (Normochromic)";
  let mchInterpretation = "Mean cellular hemoglobin content is normal (27–33 pg).";
  if (mch < 27) {
    abnormalCount++;
    mchStatus = "Low (Hypochromic)";
    mchInterpretation = "Hypochromic erythrocytes (< 27 pg). Reduced cellular hemoglobin content per red cell.";
  } else if (mch > 33) {
    abnormalCount++;
    mchStatus = "High (Hyperchromic)";
    mchInterpretation = "Hyperchromic erythrocytes (> 33 pg). Elevated cellular hemoglobin content per red cell.";
  }

  // 2c. MCHC (Mean Corpuscular Hemoglobin Concentration: 32 - 36 g/dL)
  let mchcStatus = "Normal (Normochromic)";
  let mchcInterpretation = "Cellular hemoglobin concentration is optimal (32–36 g/dL).";
  if (mchc < 32) {
    abnormalCount++;
    mchcStatus = "Low (Hypochromic)";
    mchcInterpretation = "Hypochromic concentration (< 32 g/dL). Decreased relative hemoglobin density.";
  } else if (mchc > 36) {
    abnormalCount++;
    mchcStatus = "High (Hyperchromic)";
    mchcInterpretation = "Elevated MCHC (> 36 g/dL). Consider hereditary spherocytosis, cold agglutinins, or true hyperchromia.";
  }

  // 2d. RDW (Red Cell Distribution Width: 11.5% - 14.5%)
  let rdwStatus: string | undefined;
  let rdwInterpretation: string | undefined;
  if (rdw !== undefined && rdw > 0) {
    if (rdw > 14.5) {
      abnormalCount++;
      rdwStatus = "Elevated (Anisocytosis)";
      rdwInterpretation = `Elevated RDW (${rdw}% > 14.5%). Significant variation in red cell size (anisocytosis), characteristic of active iron deficiency, early nutritional anemia, or mixed etiology.`;
    } else if (rdw < 11.5) {
      rdwStatus = "Low (Homogeneous)";
      rdwInterpretation = `Low RDW (${rdw}% < 11.5%). Uniform red blood cell sizing with minimal variation.`;
    } else {
      rdwStatus = "Normal Distribution";
      rdwInterpretation = `Normal RDW (${rdw}% within 11.5%–14.5%). Homogeneous cell size distribution.`;
    }
  }

  // 2e. Vitamin B12 (Cobalamin: 200 - 900 pg/mL) & MCV Kinetic Correlation
  let vitaminB12Status: string | undefined;
  let vitaminB12Interpretation: string | undefined;
  let b12McvDiscordance: CBCResults["b12McvDiscordance"];

  if (vitaminB12 !== undefined && vitaminB12 > 0) {
    if (vitaminB12 < 200) {
      abnormalCount++;
      vitaminB12Status = "Deficient (< 200 pg/mL)";
      
      if (mcv <= 100) {
        if (mcv < 80) {
          b12McvDiscordance = {
            isEarlyOrMasked: true,
            pattern: "masked_by_microcytosis",
            badgeText: "B12 Deficiency Masked by Microcytosis",
            clinicalInsight: `Low Vitamin B12 (${vitaminB12} pg/mL) with microcytic cells (MCV: ${mcv} fL). Expected macrocytic enlargement is suppressed or masked by concurrent iron deficiency or hemoglobinopathy.`,
            earlyConsiderations: "Combined nutritional deficiency (Iron + B12). Correcting iron deficiency will gradually unmask underlying macrocytosis.",
            confirmatoryWorkup: "Order Serum Ferritin, TIBC, Serum Methylmalonic Acid (MMA), Homocysteine, and Peripheral Blood Smear."
          };
          vitaminB12Interpretation = `Deficient Vitamin B12 (${vitaminB12} pg/mL) with microcytic indices (MCV: ${mcv} fL). Macrocytic reflection is masked by co-existing microcytic pathology (e.g. Iron Deficiency Anemia). Combined iron and B12 therapy indicated.`;
        } else {
          // MCV 80 - 100
          b12McvDiscordance = {
            isEarlyOrMasked: true,
            pattern: "early_subclinical",
            badgeText: "Early B12 Deficiency (MCV Lag Phase)",
            clinicalInsight: `Serum Vitamin B12 is deficient (${vitaminB12} pg/mL), yet MCV remains normocytic (${mcv} fL). Macrocytic cell reflection is a late hematological manifestation requiring up to 120 days of erythrocyte replacement. Cellular or neurological deficiency occurs well before MCV rises.`,
            earlyConsiderations: "Normal MCV must not rule out active B12 deficiency. Evaluate RDW (anisocytosis), peripheral blood smear (hypersegmented neutrophils), and neurological symptoms (numbness, tingling, cognitive fatigue).",
            confirmatoryWorkup: "Order Serum Methylmalonic Acid (MMA), Homocysteine, and Active B12 (Holotranscobalamin) for early tissue-level confirmation."
          };
          vitaminB12Interpretation = `Deficient Vitamin B12 (${vitaminB12} pg/mL) with normocytic MCV (${mcv} fL). Represents early/subclinical B12 deficiency prior to macrocytic erythrocyte reflection (MCV lag due to 120-day red cell turnover) or early dimorphic shift. Neurological risk exists before macrocytosis develops.`;
        }
      } else {
        // MCV > 100
        b12McvDiscordance = {
          isEarlyOrMasked: false,
          pattern: "concordant_macrocytic",
          badgeText: "Concordant Macrocytic B12 Depletion",
          clinicalInsight: `Established Vitamin B12 deficiency (${vitaminB12} pg/mL) with fully reflected macrocytosis (MCV: ${mcv} fL). Indicates megaloblastic nuclear-cytoplasmic dyssynchrony.`,
          earlyConsiderations: "Established megaloblastosis. Monitor for subacute combined degeneration and pancytopenia.",
          confirmatoryWorkup: "Serum Folate, Reticulocyte Count, Serum MMA, and Anti-Intrinsic Factor Antibodies."
        };
        vitaminB12Interpretation = `Severe Vitamin B12 deficiency (${vitaminB12} pg/mL) with macrocytosis (MCV: ${mcv} fL). Classical megaloblastic hematopoiesis pattern. High risk of peripheral neuropathy, myelopathy, and glossitis. Therapeutic cobalamin indicated.`;
      }
    } else if (vitaminB12 <= 300) {
      abnormalCount++;
      vitaminB12Status = "Borderline (200–300 pg/mL)";
      
      if (mcv <= 100) {
        b12McvDiscordance = {
          isEarlyOrMasked: true,
          pattern: "early_subclinical",
          badgeText: "Borderline B12 with Normocytic Indices",
          clinicalInsight: `Borderline Vitamin B12 reserve (${vitaminB12} pg/mL) without red cell enlargement (MCV: ${mcv} fL). Subclinical tissue deficiency may be present before macrocytic morphological changes occur.`,
          earlyConsiderations: "Erythrocyte indices take months to reflect borderline tissue depletion. Assess for early fatigue, cognitive haze, or paresthesias.",
          confirmatoryWorkup: "Check Serum Methylmalonic Acid (MMA) and Homocysteine to detect functional tissue-level cobalamin deficiency."
        };
        vitaminB12Interpretation = `Borderline Vitamin B12 reserve (${vitaminB12} pg/mL) with normal MCV (${mcv} fL). Early metabolic depletion can precede hematological macrocytosis. Evaluate functional markers (MMA/Homocysteine).`;
      } else {
        b12McvDiscordance = {
          isEarlyOrMasked: false,
          pattern: "concordant_macrocytic",
          badgeText: "Borderline B12 with Macrocytosis",
          clinicalInsight: `Borderline B12 (${vitaminB12} pg/mL) with elevated MCV (${mcv} fL). Suggests active megaloblastic shift or concurrent folate deficiency/liver factors.`,
          earlyConsiderations: "Assess dietary intake, red cell folate, and thyroid/hepatic function.",
          confirmatoryWorkup: "Serum MMA, Homocysteine, Serum & RBC Folate."
        };
        vitaminB12Interpretation = `Borderline Vitamin B12 (${vitaminB12} pg/mL) with macrocytosis (${mcv} fL). Suggests active megaloblastic marrow response or mixed folate/B12 depletion.`;
      }
    } else if (vitaminB12 > 900) {
      vitaminB12Status = "Elevated (> 900 pg/mL)";
      vitaminB12Interpretation = `Elevated serum Vitamin B12 (${vitaminB12} pg/mL). May reflect recent cobalamin supplementation, acute liver disease/hepatocellular clearance reduction, renal insufficiency, or myeloproliferative disorder.`;
      b12McvDiscordance = {
        isEarlyOrMasked: false,
        pattern: "elevated",
        badgeText: "Elevated Vitamin B12 Level",
        clinicalInsight: `Serum B12 is elevated (${vitaminB12} pg/mL). Correlate with recent supplement intake, hepatic function, or renal clearance.`,
        earlyConsiderations: "Rule out exogenous supplement excess vs hepatic enzyme release.",
        confirmatoryWorkup: "Liver function panel, renal profile."
      };
    } else {
      vitaminB12Status = "Normal (300–900 pg/mL)";
      vitaminB12Interpretation = `Normal physiological Vitamin B12 level (${vitaminB12} pg/mL).`;
      b12McvDiscordance = {
        isEarlyOrMasked: false,
        pattern: "normal",
        badgeText: "Balanced Vitamin B12 Reserve",
        clinicalInsight: `Serum B12 (${vitaminB12} pg/mL) is within normal reference range with concordant erythrocyte indices.`,
        earlyConsiderations: "Standard nutritional maintenance.",
        confirmatoryWorkup: "Routine periodic health monitoring."
      };
    }
  }

  // 2f. Mentzer Index (MCV / RBC) for Microcytosis
  let mentzerIndex: number | undefined;
  let mentzerInterpretation: string | undefined;
  if (mcv < 80 && rbc > 0) {
    mentzerIndex = parseFloat((mcv / rbc).toFixed(2));
    if (mentzerIndex < 13) {
      mentzerInterpretation = `Mentzer Index: ${mentzerIndex} (< 13). Suggestive of Thalassemia Trait / Minor due to preserved RBC count relative to microcytosis.`;
    } else {
      mentzerInterpretation = `Mentzer Index: ${mentzerIndex} (≥ 13). Suggestive of Iron Deficiency Anemia (IDA) due to depressed erythropoiesis relative to cell volume.`;
    }
  }

  // 2g. Integrated Anemia Morphological Classification
  let anemiaType: string | undefined;
  let morphologyClassification: string | undefined;
  let morphologyDetails: string | undefined;

  if (isAnemic) {
    if (mcv < 80) {
      if (vitaminB12 !== undefined && vitaminB12 < 200) {
        anemiaType = "Microcytic Anemia with Masked B12 Deficiency";
        morphologyClassification = "Microcytic with Masked Vitamin B12 Deficiency";
        morphologyDetails = `Microcytic erythrocytes (MCV: ${mcv} fL) with concurrent Vitamin B12 deficiency (${vitaminB12} pg/mL). The expected macrocytosis is masked by co-existing microcytic pathology (e.g. Iron Deficiency Anemia). Combined nutritional therapy required.`;
      } else if (rdw !== undefined && rdw > 14.5) {
        anemiaType = "Microcytic Hypochromic Anemia (Iron Deficiency Pattern)";
        morphologyClassification = "Microcytic Hypochromic with Anisocytosis";
        morphologyDetails = `High likelihood of Iron Deficiency Anemia (IDA) evidenced by microcytosis (MCV: ${mcv} fL), hypochromia (MCH: ${mch} pg), and elevated RDW (${rdw}%).`;
      } else if (mentzerIndex !== undefined && mentzerIndex < 13) {
        anemiaType = "Microcytic Anemia (Thalassemia Trait Pattern)";
        morphologyClassification = "Microcytic with Normal RDW / High RBC Count";
        morphologyDetails = `Microcytic anemia with Mentzer Index ${mentzerIndex} (< 13) and normal size distribution. High suspicion of Beta-Thalassemia Trait/Minor. Confirm with Hb HPLC / Electrophoresis.`;
      } else {
        anemiaType = "Microcytic Hypochromic Anemia";
        morphologyClassification = "Microcytic Hypochromic Profile";
        morphologyDetails = `Reduced erythrocyte volume (MCV: ${mcv} fL) and hemoglobin content (MCH: ${mch} pg). Recommend serum ferritin, total iron binding capacity (TIBC), and hemoglobin electrophoresis.`;
      }
    } else if (mcv > 100) {
      if (vitaminB12 !== undefined && vitaminB12 < 200) {
        anemiaType = "Macrocytic Megaloblastic Anemia (Confirmed B12 Deficiency)";
        morphologyClassification = "Macrocytic Megaloblastic with Severe B12 Depletion";
        morphologyDetails = `Macrocytosis (MCV: ${mcv} fL) directly driven by severe Vitamin B12 deficiency (${vitaminB12} pg/mL). High clinical risk of neuropathy and nuclear maturation defects.`;
      } else if (vitaminB12 !== undefined && vitaminB12 <= 300) {
        anemiaType = "Macrocytic Anemia (Borderline B12 / Folate Suspected)";
        morphologyClassification = "Macrocytic with Borderline B12";
        morphologyDetails = `Macrocytic indices with borderline Vitamin B12 reserve (${vitaminB12} pg/mL). Assess red cell folate, serum MMA, and reticulocyte count.`;
      } else {
        anemiaType = "Macrocytic Anemia";
        morphologyClassification = "Macrocytic Erythrocyte Morphology";
        morphologyDetails = `Elevated red cell volume (MCV: ${mcv} fL). Evaluate Vitamin B12, serum folate, thyroid function (TSH), hepatic profile, and alcohol history.`;
      }
    } else {
      // MCV 80 - 100
      if (vitaminB12 !== undefined && vitaminB12 < 200) {
        anemiaType = "Normocytic Anemia with Early/Pre-Macrocytic B12 Deficiency";
        morphologyClassification = "Normocytic with Early B12 Deficiency (MCV Lag Phase)";
        morphologyDetails = `Depressed hemoglobin with normal red cell size (MCV: ${mcv} fL) despite severe B12 deficiency (${vitaminB12} pg/mL). Red cell enlargement takes up to 120 days to reflect in circulating blood. Treat early to prevent irreversible neurological sequelae.`;
      } else if (vitaminB12 !== undefined && vitaminB12 <= 300) {
        anemiaType = "Normocytic Anemia with Borderline B12";
        morphologyClassification = "Normocytic with Borderline B12 Reserve";
        morphologyDetails = `Normocytic anemia with borderline Vitamin B12 (${vitaminB12} pg/mL). Check serum MMA/homocysteine to rule out early tissue deficiency.`;
      } else {
        anemiaType = "Normocytic Normochromic Anemia";
        morphologyClassification = "Normocytic Normochromic Profile";
        morphologyDetails = `Normal erythrocyte size (MCV: ${mcv} fL) with depressed hemoglobin. Differential includes acute blood loss, hemolysis, anemia of chronic disease / inflammation, or renal impairment.`;
      }
    }
  } else if (hemoglobin > hbMax) {
    anemiaType = "Polycythemia / Erythrocytosis";
    morphologyClassification = "Elevated Red Cell Mass";
    morphologyDetails = `Elevated hemoglobin (${hemoglobin} g/dL) and hematocrit (${hematocrit}%). Evaluate hydration status, hypoxemia, smoking, or myeloproliferative disorder (JAK2 mutation).`;
  } else {
    if (vitaminB12 !== undefined && vitaminB12 < 200 && mcv <= 100) {
      morphologyClassification = "Normocytic Profile with Subclinical B12 Depletion";
      morphologyDetails = `Normal red cell sizing (MCV: ${mcv} fL) despite low Vitamin B12 (${vitaminB12} pg/mL). Early subclinical deficiency prior to macrocytic erythrocyte turnover. Early supplementation indicated.`;
    } else {
      morphologyClassification = "Normal Red Cell Indices";
      morphologyDetails = `Red cell volume (MCV: ${mcv} fL), cellular hemoglobin (MCH: ${mch} pg), and concentration (MCHC: ${mchc} g/dL) are all balanced.`;
    }
  }

  // 3. WBC Assessment (White Blood Cells)
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

  // 4. Platelets Assessment
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

  // 5. NLR Ratio (Neutrophil-to-Lymphocyte Ratio)
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

  // 6. Triage Level
  let riskLevel: RiskLevel = "low";
  let overallStatus = "Normal baseline hematological & nutrient profile";
  if (abnormalCount === 0) {
    riskLevel = "low";
    overallStatus = "All core CBC parameters and red cell indices remain within standard clinical reference ranges";
  } else if (abnormalCount === 1) {
    riskLevel = "moderate";
    overallStatus = "Single out-of-range metric detected – clinical context and symptom tracking requested";
  } else if (abnormalCount === 2) {
    riskLevel = "high";
    overallStatus = "Multiple hematological / nutrient deviations found – recommend physician consultation and targeted workup";
  } else {
    riskLevel = "critical";
    overallStatus = "Clustered hematological exceptions – urgent physician clinical overview and laboratory correlation recommended";
  }

  const rdwPart = rdw ? ` | RDW: ${rdw}%` : "";
  const b12Part = vitaminB12 ? ` | B12: ${vitaminB12} pg/mL` : "";
  const summary = `Hb: ${hemoglobin} | MCV: ${mcv} | MCH: ${mch} | MCHC: ${mchc}${rdwPart}${b12Part} | Status: ${abnormalCount} Abnormalities`;

  return {
    hemoglobinStatus,
    anemiaType,
    wbcStatus,
    infectionRisk,
    plateletStatus,
    nlratio,
    nlratioInterpretation,
    mcvStatus,
    mcvInterpretation,
    mchStatus,
    mchInterpretation,
    mchcStatus,
    mchcInterpretation,
    rdwStatus,
    rdwInterpretation,
    vitaminB12Status,
    vitaminB12Interpretation,
    b12McvDiscordance,
    mentzerIndex,
    mentzerInterpretation,
    morphologyClassification,
    morphologyDetails,
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
