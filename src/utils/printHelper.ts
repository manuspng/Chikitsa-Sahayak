import { AnalysisRecord } from "../types";
import logoImg from "../assets/images/regenerated_image_1779900749774.jpg";

export function printClinicalReport(record: Partial<AnalysisRecord>) {
  const finalLogoUrl = logoImg.startsWith("data:") || logoImg.startsWith("http")
    ? logoImg
    : window.location.origin + logoImg;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Could not open print window. Please ensure popups are enabled.");
    return;
  }

  const patientName = record.patientName || "Not Specified";
  const patientAge = record.patientAge !== undefined ? `${record.patientAge} years` : "Not Specified";
  const patientGender = record.patientGender || "Not Specified";
  const reportDate = record.date ? new Date(record.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }) : new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const riskColors = {
    low: { text: "#166534", bg: "#dcfce7", border: "#bbf7d0" },
    moderate: { text: "#9a3412", bg: "#ffedd5", border: "#fed7aa" },
    high: { text: "#ea580c", bg: "#ffedd5", border: "#fed7aa" },
    critical: { text: "#991b1b", bg: "#fee2e2", border: "#fecaca" }
  };

  const risk = record.riskLevel || "low";
  const style = riskColors[risk] || riskColors.low;

  // Compile appropriate key-value pairs for input data with friendly medical names
  const renderInputMetrics = () => {
    if (!record.inputs) return "";
    const inputs = record.inputs;
    
    let rows = "";
    if (record.type === "lft") {
      const l = inputs as any;
      const metrics = [
        { name: "Alanine Aminotransferase (ALT)", val: l.alt, ref: "7 - 56 U/L" },
        { name: "Aspartate Aminotransferase (AST)", val: l.ast, ref: "10 - 40 U/L" },
        { name: "Alkaline Phosphatase (ALP)", val: l.alp, ref: "44 - 147 U/L" },
        { name: "Gamma-Glutamyl Transferase (GGT)", val: l.ggt, ref: "8 - 61 U/L" },
        { name: "Total Bilirubin", val: l.totalBilirubin, ref: "0.1 - 1.2 mg/dL" },
        { name: "Direct Bilirubin", val: l.directBilirubin, ref: "0.0 - 0.3 mg/dL" },
        { name: "Albumin", val: l.albumin, ref: "3.5 - 5.0 g/dL" },
        { name: "Total Protein", val: l.totalProtein, ref: "6.0 - 8.3 g/dL" },
        { name: "Platelet Count", val: l.platelets, ref: "150,000 - 450,000 /µL" },
        { name: "International Normalized Ratio (INR)", val: l.inr, ref: "0.8 - 1.2" },
        { name: "Diabetes Mellitus Status", val: l.diabetes ? "Diagnosed" : "None Detected" },
        { name: "Fasting Blood Glucose", val: l.fastingBloodGlucose, ref: "< 100 mg/dL" },
        { name: "Serum Triacylglycerides", val: l.triglycerides, ref: "< 150 mg/dL" },
        { name: "HDL Cholesterol", val: l.hdlCholesterol, ref: l.gender === "female" ? "≥ 50 mg/dL" : "≥ 40 mg/dL" },
        { name: "Waist Circumference", val: l.waistCircumference, ref: l.gender === "female" ? "≤ 88 cm" : "≤ 102 cm" },
        { name: "Blood Pressure (Systolic)", val: l.systolicBp, ref: "< 130 mmHg" },
        { name: "Blood Pressure (Diastolic)", val: l.diastolicBp, ref: "< 85 mmHg" },
        { name: "Urine Albumin-Creatinine Ratio (ACR)", val: l.urineAcr, ref: "< 30 mg/g" }
      ];

      metrics.forEach(m => {
        if (m.val !== undefined && m.val !== null && m.val !== "") {
          let displayVal = String(m.val);
          if (m.name.toLowerCase().includes("platelet")) {
            const lakhVal = (parseFloat(displayVal) / 100).toFixed(2);
            displayVal = `${displayVal} ×10⁹/L (${lakhVal} lakh/µL)`;
          }
          rows += `
            <tr class="table-row">
              <td class="metric-name">${m.name}</td>
              <td class="metric-val font-mono">${displayVal}</td>
              <td class="metric-ref font-mono text-muted">${m.ref}</td>
            </tr>
          `;
        }
      });
    } else if (record.type === "cbc") {
      const c = inputs as any;
      const metrics = [
        { name: "Hemoglobin", val: c.hemoglobin, ref: c.gender === "male" ? "13.8 - 17.2 g/dL" : "12.1 - 15.1 g/dL" },
        { name: "Hematocrit", val: c.hematocrit, ref: c.gender === "male" ? "40.7% - 50.3%" : "36.1% - 44.3%" },
        { name: "Red Blood Cell (RBC) Count", val: c.rbc, ref: c.gender === "male" ? "4.5 - 5.9 x10^6/µL" : "4.1 - 5.1 x10^6/µL" },
        { name: "White Blood Cell (WBC) Count", val: c.wbc, ref: "4,500 - 11,000 /µL" },
        { name: "Platelets Count", val: c.platelets, ref: "150,000 - 450,000 /µL" },
        { name: "Mean Corpuscular Volume (MCV)", val: c.mcv, ref: "80 - 96 fL" },
        { name: "Mean Corpuscular Hemoglobin (MCH)", val: c.mch, ref: "27.5 - 33.2 pg" },
        { name: "MCHC Concentration", val: c.mchc, ref: "32.0 - 36.0 g/dL" },
        { name: "Neutrophils %", val: c.neutrophils, ref: "40.0% - 70.0%" },
        { name: "Lymphocytes %", val: c.lymphocytes, ref: "20.0% - 40.0%" }
      ];

      metrics.forEach(m => {
        if (m.val !== undefined && m.val !== null && m.val !== "") {
          let displayVal = String(m.val);
          if (m.name.toLowerCase().includes("platelet")) {
            const lakhVal = (parseFloat(displayVal) / 100).toFixed(2);
            displayVal = `${displayVal} ×10⁹/L (${lakhVal} lakh/µL)`;
          }
          rows += `
            <tr class="table-row">
              <td class="metric-name">${m.name}</td>
              <td class="metric-val font-mono">${displayVal}</td>
              <td class="metric-ref font-mono text-muted">${m.ref}</td>
            </tr>
          `;
        }
      });
    } else if (record.type === "bmi") {
      const b = inputs as any;
      const metrics = [
        { name: "Weight", val: `${b.weight} kg`, ref: "Determined target: 18.5 - 24.9 BMI" },
        { name: "Height", val: `${b.height} cm`, ref: "—" },
        { name: "Age", val: b.age, ref: "—" },
        { name: "Assigned Sex", val: b.gender === "male" ? "Male" : "Female", ref: "—" },
        { name: "Waist Circumference", val: b.waist ? `${b.waist} cm` : undefined, ref: b.gender === "male" ? "< 101 cm target" : "< 88 cm target" },
        { name: "Hip Circumference", val: b.hip ? `${b.hip} cm` : undefined, ref: "—" }
      ];

      metrics.forEach(m => {
        if (m.val !== undefined && m.val !== null && m.val !== "") {
          rows += `
            <tr class="table-row">
              <td class="metric-name">${m.name}</td>
              <td class="metric-val font-mono">${m.val}</td>
              <td class="metric-ref text-muted">${m.ref}</td>
            </tr>
          `;
        }
      });
    } else if (record.type === "metabolic") {
      const m = inputs as any;
      const metrics = [
        { name: "Patient Assigned Sex", val: m.gender === "male" ? "Male" : "Female", ref: "—" },
        { name: "Patient Age", val: m.age, ref: "—" },
        { name: "Waist Circumference", val: m.waistCircumference ? `${m.waistCircumference} cm` : undefined, ref: m.gender === "female" ? "≤ 88 cm target" : "≤ 102 cm target" },
        { name: "Fasting Blood Glucose", val: m.fastingBloodGlucose ? `${m.fastingBloodGlucose} mg/dL` : undefined, ref: "< 100 mg/dL" },
        { name: "Serum Triglycerides", val: m.triglycerides ? `${m.triglycerides} mg/dL` : undefined, ref: "< 150 mg/dL" },
        { name: "HDL Cholesterol", val: m.hdlCholesterol ? `${m.hdlCholesterol} mg/dL` : undefined, ref: m.gender === "female" ? "≥ 50 mg/dL" : "≥ 40 mg/dL" },
        { name: "Blood Pressure (Systolic)", val: m.systolicBp ? `${m.systolicBp} mmHg` : undefined, ref: "< 130 mmHg" },
        { name: "Blood Pressure (Diastolic)", val: m.diastolicBp ? `${m.diastolicBp} mmHg` : undefined, ref: "< 85 mmHg" },
        { name: "On Hypertension Treatment", val: m.onHypertensionMeds !== undefined ? (m.onHypertensionMeds ? "Yes" : "No") : undefined, ref: "—" },
        { name: "Type 2 Diabetes Status", val: m.diabetes !== undefined ? (m.diabetes ? "History of Diabetes" : "No History") : undefined, ref: "—" },
        { name: "Urine Albumin-Creatinine Ratio (ACR)", val: m.urineAcr ? `${m.urineAcr} mg/g` : undefined, ref: "< 30 mg/g" }
      ];

      metrics.forEach(item => {
        if (item.val !== undefined && item.val !== null && item.val !== "") {
          rows += `
            <tr class="table-row">
              <td class="metric-name">${item.name}</td>
              <td class="metric-val font-mono">${item.val}</td>
              <td class="metric-ref text-muted">${item.ref}</td>
            </tr>
          `;
        }
      });
    }

    return `
      <section class="section">
        <h3 class="section-title">BIOLOGICAL RAW LAB VALUES</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th align="left">Diagnostic Panel Parameters</th>
              <th align="left">Patient Value</th>
              <th align="left">Standard Clinical Interval Reference</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>
    `;
  };

  const renderCalculatedIndexes = () => {
    if (!record.results) return "";
    const results = record.results;
    let rows = "";

    if (record.type === "lft") {
      const r = results as any;
      const indices = [
        { name: "NAFLD Score", val: `${r.nafldScore?.toFixed(1) || 0} / 9`, rsk: r.nafldRisk, note: r.nafldDescription || "Hepatic Fat Accumulation Index" },
        { name: "De Ritis Ratio (AST/ALT)", val: r.astAltRatio?.toFixed(2) || "N/A", rsk: "low", note: r.astAltInterpretation || "Liver cell injury differentiation" },
        { name: "FIB-4 Index", val: r.fib4Score?.toFixed(2) || "N/A", rsk: r.fib4Risk || "low", note: r.fib4Interpretation || "Hepatic Fibrosis triage score" },
        { name: "APRI Index (Platelet Ratio)", val: r.apriScore?.toFixed(2) || "N/A", rsk: r.apriRisk || "low", note: r.apriInterpretation || "Aspartate-to-Platelet Index" },
        { name: "BARD Score Index", val: `${r.bardScore || 0} / 4`, rsk: "low", note: r.bardRisk || "Non-alcoholic fatty liver fibrosis probability" },
        { name: "MELD Staging Index", val: r.meldScore !== undefined ? String(r.meldScore) : "N/A", rsk: "low", note: "Model for End-Stage Liver Disease" },
        { name: "Child-Pugh Classification", val: r.childPughClass || "N/A", rsk: "low", note: `Vascular congestion staging Class. Core Score: ${r.childPughScore || "N/A"}` },
        { name: "Metabolic Syndrome (NCEP ATP III)", val: r.ncepMetabolicSyndrome ? `${r.ncepMetabolicSyndrome.count}/5` : "N/A", rsk: "low", note: r.ncepMetabolicSyndrome ? r.ncepMetabolicSyndrome.conclusion : "Insufficient parameters provided" },
        { name: "Kidney risk (Urine ACR)", val: r.acrAssessment ? `${r.acrAssessment.value} mg/g` : "N/A", rsk: "low", note: r.acrAssessment ? `${r.acrAssessment.category}: ${r.acrAssessment.clinicalSignificance}` : "No ACR input provided" }
      ];

      indices.forEach(i => {
        if (i.val !== "N/A") {
          rows += `
            <div class="index-grid-item">
              <div class="index-title">${i.name}</div>
              <div class="index-value font-mono">${i.val}</div>
              <div class="index-interpretation">${i.note}</div>
            </div>
          `;
        }
      });
    } else if (record.type === "cbc") {
      const r = results as any;
      const indices = [
        { name: "Hemoglobin Evaluation", val: r.hemoglobinStatus || "Normal", note: r.anemiaType || "Oxygen capacity validation marker" },
        { name: "WBC Proliferation Stage", val: r.wbcStatus || "Normal", note: r.infectionRisk || "Immunological response cycle evaluation" },
        { name: "Platelet Concentration", val: r.plateletStatus || "Normal", note: "Hemostatic activity and vascular repair index" },
        { name: "Neutrophil-to-Lymphocyte Ratio", val: r.nlratio?.toFixed(2) || "N/A", note: r.nlratioInterpretation || "Systemic micro-inflammatory diagnostic index" }
      ];

      indices.forEach(i => {
        rows += `
          <div class="index-grid-item">
            <div class="index-title">${i.name}</div>
            <div class="index-value">${i.val}</div>
            <div class="index-interpretation">${i.note}</div>
          </div>
        `;
      });
    } else if (record.type === "bmi") {
      const r = results as any;
      const indices = [
        { name: "Body Mass Index (BMI)", val: `${r.bmi?.toFixed(1) || "N/A"} kg/m²`, note: `Category: ${r.category || "Normal"}` },
        { name: "Waist-to-Hip Ratio (WHR)", val: r.whr?.toFixed(2) || "N/A", note: r.whrInterpretation || "Standard abdominal fat distribution" },
        { name: "Metabolic Profiling", val: "Evaluation Zone", note: r.metabolicRisk || "Visceral adiposity tissue stress indicators" }
      ];

      indices.forEach(i => {
        if (i.val !== "N/A") {
          rows += `
            <div class="index-grid-item">
              <div class="index-title">${i.name}</div>
              <div class="index-value font-mono">${i.val}</div>
              <div class="index-interpretation">${i.note}</div>
            </div>
          `;
        }
      });
    } else if (record.type === "metabolic") {
      const r = results as any;
      const indices = [
        { name: "Metabolic Syndrome (NCEP ATP III)", val: r.ncepMetabolicSyndrome ? `${r.ncepMetabolicSyndrome.count} / 5 Criteria` : "N/A", note: r.ncepMetabolicSyndrome?.conclusion || "NCEP ATP III Criteria evaluation" },
        { name: "Urine Albumin-to-Creatinine Ratio (ACR)", val: r.acrAssessment ? `${r.acrAssessment.value} mg/g` : "N/A", note: r.acrAssessment ? `${r.acrAssessment.category}: ${r.acrAssessment.clinicalSignificance}` : "Kidney-renal risk marker" }
      ];

      indices.forEach(i => {
        if (i.val !== "N/A") {
          rows += `
            <div class="index-grid-item">
              <div class="index-title">${i.name}</div>
              <div class="index-value font-mono">${i.val}</div>
              <div class="index-interpretation">${i.note}</div>
            </div>
          `;
        }
      });
    }

    return `
      <section class="section">
        <h3 class="section-title font-sans">CALCULATED ADVANCED DIAGNOSTIC RISK SCORES</h3>
        <div class="index-grid">
          ${rows}
        </div>
      </section>
    `;
  };

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Hepatic Clinical Evaluation - ${patientName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
          
          * {
            box-sizing: border-box;
          }
          
          body {
            font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #1e293b;
            line-height: 1.5;
            padding: 40px;
            background-color: #ffffff;
            margin: 0;
            font-size: 13px;
          }

          @media print {
            body {
              padding: 0;
              font-size: 12px;
            }
            .no-print {
              display: none;
            }
            .page-break {
              page-break-before: always;
            }
          }

          .print-header-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #f8fafc;
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 24px;
            border: 1px solid #e2e8f0;
          }

          .print-btn {
            background-color: #2d5a37;
            color: white;
            border: none;
            padding: 8px 16px;
            font-size: 12px;
            font-weight: 700;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          }
          .print-btn:hover {
            background-color: #1b3d22;
          }

          .brand-logo {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .brand-logo img {
            width: 44px;
            height: 44px;
            border-radius: 8px;
            object-fit: cover;
          }
          .logo-text {
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 0.05em;
            color: #0f172a;
          }
          .brand-tagline {
            font-size: 10px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 700;
            margin-top: 1px;
            letter-spacing: 0.06em;
          }

          .doc-header {
            border-bottom: 3px double #cbd5e1;
            padding-bottom: 16px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }

          .clinic-info {
            text-align: right;
          }
          .clinic-name {
            font-weight: 800;
            font-size: 14px;
            color: #1e3a8a;
            margin: 0;
          }
          .clinic-sub {
            font-size: 11px;
            color: #64748b;
            margin: 2px 0 0 0;
          }

          .patient-card {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 24px;
          }

          .meta-item {
            display: flex;
            flex-direction: column;
          }
          .meta-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.04em;
            margin-bottom: 4px;
          }
          .meta-val {
            font-size: 13px;
            font-weight: 600;
            color: #0f172a;
          }

          .section {
            margin-bottom: 24px;
          }
          .section-title {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #475569;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
            margin: 0 0 12px 0;
          }

          .report-table {
            width: 100%;
            border-collapse: collapse;
          }
          .report-table th {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            padding: 8px 12px;
            border-bottom: 2px solid #e2e8f0;
            background-color: #f1f5f9;
          }
          .table-row td {
            padding: 8px 12px;
            border-bottom: 1px solid #f1f5f9;
          }
          .metric-name {
            font-weight: 600;
            color: #334155;
          }
          .metric-val {
            font-weight: 700;
            color: #0f172a;
          }
          .metric-ref {
            color: #64748b;
          }

          .index-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          .index-grid-item {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
            background-color: #fefefe;
          }
          .index-title {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .index-value {
            font-size: 16px;
            font-weight: 800;
            color: #1e3a8a;
          }
          .index-interpretation {
            font-size: 11px;
            color: #475569;
            margin-top: 2px;
            line-height: 1.4;
          }

          .insight-box {
            background-color: #1e293b;
            color: #f8fafc;
            border-radius: 10px;
            padding: 16px;
            margin-top: 24px;
          }
          .insight-title {
            font-family: inherit;
            color: #38bdf8;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin: 0 0 10px 0;
            display: flex;
            align-items: center;
            gap: 6px;
            border-bottom: 1px solid #334155;
            padding-bottom: 6px;
          }
          .insight-content {
            font-size: 12px;
            line-height: 1.6;
            white-space: pre-line;
          }

          .risk-badge {
            display: inline-flex;
            align-items: center;
            font-weight: 800;
            text-transform: uppercase;
            font-size: 10px;
            border: 1px solid;
            padding: 4px 10px;
            border-radius: 4px;
            letter-spacing: 0.05em;
          }

          .signatures-zone {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 50px;
            padding-top: 30px;
            border-top: 1px dashed #cbd5e1;
          }
          .sig-line {
            width: 200px;
            border-bottom: 1px solid #94a3b8;
            margin-bottom: 6px;
          }
          .sig-label {
            font-size: 10px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
          }

          .disclaimer {
            font-size: 9px;
            color: #94a3b8;
            text-align: justify;
            margin-top: 40px;
            line-height: 1.4;
            border-top: 1px solid #f1f5f9;
            padding-top: 10px;
          }
          
          .font-mono {
            font-family: "JetBrains Mono", monospace;
          }
          .text-muted {
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="print-header-bar no-print">
          <span style="font-weight:600; font-size:12px; color:#475569;">
            This report can be printed physical paper or exported as a high-density, vector-perfect clinical PDF file.
          </span>
          <button class="print-btn" onclick="window.print()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <path d="M6 14h12v8H6z"/>
            </svg>
            <span>Print or Export PDF</span>
          </button>
        </div>

        <div class="doc-header">
          <div>
            <div class="brand-logo">
              <img src="${finalLogoUrl}" alt="Logo" />
              <div class="logo-text">Chikitsa Sahayak</div>
            </div>
            <div class="brand-tagline">Clinical Decision-Support</div>
          </div>
        </div>

        <div class="patient-card">
          <div class="meta-item">
            <span class="meta-label">Patient Name</span>
            <span class="meta-val">${patientName}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Age</span>
            <span class="meta-val">${patientAge}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Sex / Gender</span>
            <span class="meta-val" style="text-transform: capitalize;">${patientGender}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Report Date</span>
            <span class="meta-val">${reportDate}</span>
          </div>
        </div>

        <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
          <h2 style="font-size: 15px; font-weight: 800; margin: 0; text-transform: uppercase; color: #0f172a; letter-spacing: 0.02em;">
            Diagnosis Report: ${record.title}
          </h2>
          <div>
            <span class="risk-badge" style="color: ${style.text}; background-color: ${style.bg}; border-color: ${style.border};">
              ${risk.toUpperCase()} CLINICAL RISK ZONE
            </span>
          </div>
        </div>

        ${renderInputMetrics()}

        ${renderCalculatedIndexes()}

        ${record.aiInsight ? `
          <div class="insight-box page-break">
            <h3 class="insight-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:4px;">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              Decision-Support AI Commentary & Clinical Interpretation
            </h3>
            <div class="insight-content">${record.aiInsight}</div>
          </div>
        ` : ""}

        <div class="disclaimer">
          <strong>Important Notice:</strong> This report is for decision-support purposes only and is <strong>not for medico-legal purposes</strong>. A competent medical professional should always investigate to confirm the diagnosis. The calculations, risk levels, and AI recommendations are formulated according to standard clinical screening indexes based on provided parameters, and do not constitute direct medical advice or a direct clinical prescription.
        </div>
        
        <script>
          // Auto trigger trigger printing once script has loaded
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
