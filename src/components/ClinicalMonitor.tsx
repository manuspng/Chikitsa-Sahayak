import React from "react";
import { Activity, ShieldAlert, HeartPulse, Scale, CheckCircle2, ChevronRight, FileText } from "lucide-react";
import { AnalysisRecord, RiskLevel } from "../types";

interface ClinicalMonitorProps {
  records: AnalysisRecord[];
  onSetTab: (tab: string) => void;
}

export default function ClinicalMonitor({ records, onSetTab }: ClinicalMonitorProps) {
  // Statistics
  const totalScans = records.length;
  const lftScans = records.filter(r => r.type === "lft").length;
  const cbcScans = records.filter(r => r.type === "cbc").length;
  const bmiScans = records.filter(r => r.type === "bmi").length;

  // Find most recent critical or high risk scanner if any
  const abnormalScans = records.filter(r => r.riskLevel === "critical" || r.riskLevel === "high");
  const latestAbnormal = abnormalScans.length > 0 ? abnormalScans[abnormalScans.length - 1] : null;

  // Risk distribution
  let lowCount = 0, modCount = 0, highCount = 0, critCount = 0;
  records.forEach(r => {
    if (r.riskLevel === "low") lowCount++;
    else if (r.riskLevel === "moderate") modCount++;
    else if (r.riskLevel === "high") highCount++;
    else if (r.riskLevel === "critical") critCount++;
  });

  const distributePercent = (count: number) => {
    if (totalScans === 0) return 0;
    return Math.round((count / totalScans) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Clinician Welcome Banner */}
      <div 
        className="relative overflow-hidden rounded-2xl border-2 border-slate-300 p-6 md:p-8 shadow-xs"
      >
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative space-y-3">
          <h2 className="font-serif text-[26px] md:text-[32px] font-bold tracking-tight leading-snug">
            Comprehensive Assessment of <span style={{ color: "#047857" }} className="italic font-black">Hepatic Function & Risk Factors</span>
          </h2>
          <p className="text-sm leading-relaxed text-justify font-sans max-w-4xl font-bold mt-2">
            Diagnose patient diagnostic data using validated clinical indexes—including 
            FIB-4, Fatty Liver Index (FLI), APRI, BARD, and NAFLD Fibrosis Score. Ingest reports via 
            Multimodal OCR or Live Camera capture, evaluate abnormalities instantly, and review clear evidence-based clinical guidance.
          </p>
        </div>
      </div>

      {/* Clinician Log Overview Section Header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <ChevronRight className="text-emerald-700" size={16} />
          <h3 className="text-xs font-black uppercase tracking-widest">Clinician Log Activity Overview</h3>
        </div>
      </div>

      {/* Overview Bento Stats - Light Backgrounds & High Contrast */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div 
          style={{ backgroundColor: "#f0fdf4" }}
          className="border-2 border-emerald-300 rounded-2xl py-3.5 px-4 flex flex-row items-center gap-3.5 shadow-xs"
        >
          <div className="p-2.5 bg-emerald-200 text-emerald-900 rounded-xl flex-shrink-0">
            <HeartPulse size={18} />
          </div>
          <div>
            <span className="text-xs uppercase font-black tracking-wider block leading-none">LFT Screenings</span>
            <span className="text-2xl font-black font-mono leading-none mt-1.5 block">{lftScans}</span>
          </div>
        </div>

        <div 
          style={{ backgroundColor: "#ecfeff" }}
          className="border-2 border-cyan-300 rounded-2xl py-3.5 px-4 flex flex-row items-center gap-3.5 shadow-xs"
        >
          <div className="p-2.5 bg-cyan-200 text-cyan-900 rounded-xl flex-shrink-0">
            <Activity size={18} />
          </div>
          <div>
            <span className="text-xs uppercase font-black tracking-wider block leading-none">CBC Screenings</span>
            <span className="text-2xl font-black font-mono leading-none mt-1.5 block">{cbcScans}</span>
          </div>
        </div>

        <div 
          style={{ backgroundColor: "#f5f3ff" }}
          className="border-2 border-violet-300 rounded-2xl py-3.5 px-4 flex flex-row items-center gap-3.5 shadow-xs"
        >
          <div className="p-2.5 bg-violet-200 text-violet-900 rounded-xl flex-shrink-0">
            <Scale size={18} />
          </div>
          <div>
            <span className="text-xs uppercase font-black tracking-wider block leading-none">BMI Screenings</span>
            <span className="text-2xl font-black font-mono leading-none mt-1.5 block">{bmiScans}</span>
          </div>
        </div>

        <div 
          style={{ backgroundColor: "#f8fafc" }}
          className="border-2 border-slate-300 rounded-2xl py-3.5 px-4 flex flex-row items-center gap-3.5 shadow-xs"
        >
          <div className="p-2.5 bg-slate-200 text-slate-900 rounded-xl flex-shrink-0">
            <FileText size={18} />
          </div>
          <div>
            <span className="text-xs uppercase font-black tracking-wider block leading-none">Total Evaluations</span>
            <span className="text-2xl font-black font-mono leading-none mt-1.5 block">{totalScans}</span>
          </div>
        </div>
      </div>

      {/* Alert Status or Healthy banner */}
      {latestAbnormal ? (
        <div 
          style={{ backgroundColor: "#fef2f2" }} 
          className="p-5 border-2 border-red-300 rounded-[20px] flex items-start gap-4 shadow-xs"
        >
          <div className="p-2.5 bg-red-200 text-red-900 rounded-xl mt-0.5">
            <ShieldAlert size={20} />
          </div>
          <div className="space-y-1">
            <h4 style={{ color: "#991b1b" }} className="text-sm font-black">Attention: Elevated Risk Parameters</h4>
            <p className="text-xs font-bold leading-relaxed max-w-2xl text-justify">
              An abnormal diagnostic risk bracket was flagged in the report: <span className="font-black text-black underline">"{latestAbnormal.title}"</span> ({latestAbnormal.riskLevel.toUpperCase()}). Please cross-examine with full hepatic assessments, clinical symptoms, and medical professionals.
            </p>
          </div>
        </div>
      ) : (
        <div 
          style={{ backgroundColor: "#f0fdf4" }} 
          className="p-5 border-2 border-emerald-300 rounded-[20px] flex items-start gap-4 shadow-xs"
        >
          <div className="p-2.5 bg-emerald-200 text-emerald-900 rounded-xl mt-0.5">
            <CheckCircle2 size={20} />
          </div>
          <div className="space-y-1">
            <h4 style={{ color: "#065f46" }} className="text-sm font-black">Biological Parameters Nominal</h4>
            <p className="text-xs font-bold leading-relaxed max-w-2xl text-justify">
              All monitored historical indexes represent low-bracket diagnostic risk. Monitor parameters routinely to track fatty deposit trends and general immunity statistics over time.
            </p>
          </div>
        </div>
      )}

      {/* Risk Distribution Chart & Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Previous Scan Risk Breakdown */}
        <div 
          className="bento-card md:col-span-7 flex flex-col justify-between border-2 border-slate-300"
        >
          <div>
            <h3 className="card-title font-mono font-black text-xs uppercase tracking-wider mb-2">Diagnostic Risk Breakdown</h3>
            <p className="text-xs mb-6 font-bold">Patient historical risk segmentation across {totalScans} previous evaluations.</p>
            
            {totalScans === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-center space-y-2">
                <span className="text-xs font-black uppercase tracking-wider block">No evaluations recorded</span>
                <p className="text-xs max-w-xs font-bold mt-1">Data will populate a risk distribution graph dynamically once screening results are saved.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Low Risk */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-black">Low Risk</span>
                    <span className="font-mono font-black">{lowCount} ({distributePercent(lowCount)}%)</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${distributePercent(lowCount)}%` }} />
                  </div>
                </div>

                {/* Moderate Risk */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-black">Moderate Risk</span>
                    <span className="font-mono font-black">{modCount} ({distributePercent(modCount)}%)</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${distributePercent(modCount)}%` }} />
                  </div>
                </div>

                {/* High Risk */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-black">High Risk</span>
                    <span className="font-mono font-black">{highCount} ({distributePercent(highCount)}%)</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${distributePercent(highCount)}%` }} />
                  </div>
                </div>

                {/* Critical Risk */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-black">Critical Risk</span>
                    <span className="font-mono font-black">{critCount} ({distributePercent(critCount)}%)</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-red-600 rounded-full" style={{ width: `${distributePercent(critCount)}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="border-t border-slate-300 mt-6 pt-4 text-xs font-bold leading-relaxed font-sans flex items-start gap-1">
            <span>Clinical validation markers utilized include: AASLD guidelines (2018), EASL indexes.</span>
          </div>
        </div>

        {/* Clinician Research Panel */}
        <div 
          className="bento-card md:col-span-5 flex flex-col justify-between border-2 border-slate-300"
        >
          <div>
            <h3 className="card-title font-mono font-black text-xs uppercase tracking-wider mb-2">Preventative Recommendations</h3>
            <p className="text-xs mb-4 font-bold text-justify">Standardized clinical guidelines for maintaining healthy metabolic liver balances.</p>

            <ul className="space-y-3">
              <li className="text-xs leading-relaxed flex items-start gap-2.5 font-bold">
                <span className="w-2 h-2 bg-emerald-700 rounded-full mt-1.5 flex-shrink-0" />
                <span className="text-justify font-bold">
                  <strong className="font-black">Dietary Balance:</strong> Limit added fructose and simple carbohydrates, as they directly elevate de novo lipogenesis in liver tissue.
                </span>
              </li>
              <li className="text-xs leading-relaxed flex items-start gap-2.5 font-bold">
                <span className="w-2 h-2 bg-emerald-700 rounded-full mt-1.5 flex-shrink-0" />
                <span className="text-justify font-bold">
                  <strong className="font-black">Aerobic Activity:</strong> 150 minutes of weekly aerobic exercise stimulates fatty acid beta-oxidation and decreases metabolic liver lipids.
                </span>
              </li>
              <li className="text-xs leading-relaxed flex items-start gap-2.5 font-bold">
                <span className="w-2 h-2 bg-emerald-700 rounded-full mt-1.5 flex-shrink-0" />
                <span className="text-justify font-bold">
                  <strong className="font-black">Vigilant Monitoring:</strong> Routine LFT screenings are highly recommended if risk factors like BMI &ge; 28, diabetes, or elevated ALT exist.
                </span>
              </li>
            </ul>
          </div>

          <div 
            style={{ backgroundColor: "#eef2ff" }} 
            className="mt-6 pt-4 border-t border-slate-300 p-4 rounded-xl border border-indigo-200"
          >
            <span style={{ color: "#1e1b4b" }} className="text-xs font-black block uppercase tracking-wider mb-1">Did you know?</span>
            <span className="text-xs leading-relaxed block text-justify font-bold">
              The AST/ALT Ratio (De Ritis ratio) can serve as a primary indicator to distinguish simple steatosis from potential alcoholic hepatitis or established vascular cirrhosis.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
