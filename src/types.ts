export type RiskLevel = "low" | "moderate" | "high" | "critical";

export interface LFTInputs {
  alt: number;
  ast: number;
  alp?: number;
  ggt?: number;
  totalBilirubin: number;
  directBilirubin?: number;
  albumin: number;
  totalProtein?: number;
  inr?: number;
  platelets?: number;
  age?: number;
  astUln?: number;
  weight?: number;
  height?: number;
  diabetes?: boolean;
  gender?: "male" | "female";
  fastingBloodGlucose?: number;
  triglycerides?: number;
  hdlCholesterol?: number;
  systolicBp?: number;
  diastolicBp?: number;
  onHypertensionMeds?: boolean;
  urineAcr?: number;
  waistCircumference?: number;
}

export interface LFTResults {
  nafldScore: number;
  nafldRisk: RiskLevel;
  nafldDescription: string;
  astAltRatio: number;
  astAltInterpretation: string;
  childPughScore?: number;
  childPughClass?: string;
  meldScore?: number;
  fib4Score?: number;
  fib4Interpretation?: string;
  fib4Risk?: "low" | "moderate" | "high";
  apriScore?: number;
  apriInterpretation?: string;
  apriRisk?: "low" | "moderate" | "high";
  bardScore?: number;
  bardRisk?: string;
  bardDetails?: string[];
  fibrosisScore: number;
  fibrosisStage: string;
  summary: string;
  ncepMetabolicSyndrome?: {
    met: boolean;
    criteriaMet: string[];
    criteriaNotMet: string[];
    count: number;
    conclusion: string;
  };
  acrAssessment?: {
    value: number;
    category: string;
    description: string;
    clinicalSignificance: string;
  };
}

export interface BMIInputs {
  weight: number;
  height: number;
  age: number;
  gender: "male" | "female";
  waist?: number;
  hip?: number;
}

export interface BMIResults {
  bmi: number;
  category: string;
  riskLevel: RiskLevel;
  idealWeightMin: number;
  idealWeightMax: number;
  whr?: number;
  whrInterpretation?: string;
  metabolicRisk: string;
  summary: string;
}

export interface CBCInputs {
  hemoglobin: number;
  hematocrit: number;
  rbc: number;
  wbc: number;
  platelets: number;
  mcv: number;
  mch: number;
  mchc: number;
  neutrophils?: number;
  lymphocytes?: number;
  monocytes?: number;
  eosinophils?: number;
  basophils?: number;
  gender: "male" | "female";
}

export interface CBCResults {
  hemoglobinStatus: string;
  anemiaType?: string;
  wbcStatus: string;
  infectionRisk: string;
  plateletStatus: string;
  nlratio?: number;
  nlratioInterpretation?: string;
  overallStatus: string;
  riskLevel: RiskLevel;
  abnormalCount: number;
  summary: string;
}

export interface MetabolicInputs {
  gender: "male" | "female";
  age?: number;
  diabetes?: boolean;
  fastingBloodGlucose?: number;
  triglycerides?: number;
  hdlCholesterol?: number;
  systolicBp?: number;
  diastolicBp?: number;
  onHypertensionMeds?: boolean;
  urineAcr?: number;
  waistCircumference?: number;
}

export interface MetabolicResults {
  summary: string;
  riskLevel: RiskLevel;
  ncepMetabolicSyndrome?: {
    met: boolean;
    criteriaMet: string[];
    criteriaNotMet: string[];
    count: number;
    conclusion: string;
  };
  acrAssessment?: {
    value: number;
    category: string;
    description: string;
    clinicalSignificance: string;
  };
}

export type AnalysisType = "lft" | "cbc" | "bmi" | "metabolic";

export interface AnalysisRecord {
  id: string;
  type: AnalysisType;
  title: string;
  date: string;
  inputs: LFTInputs | BMIInputs | CBCInputs | MetabolicInputs;
  results: LFTResults | BMIResults | CBCResults | MetabolicResults;
  aiInsight?: string;
  riskLevel: RiskLevel;
  patientName?: string;
  patientGender?: string;
  patientAge?: number;
}
