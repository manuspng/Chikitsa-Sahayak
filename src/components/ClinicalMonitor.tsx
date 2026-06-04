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
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 text-white p-6 md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 -ml-16 -mb-16 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <HeartPulse size={12} />
            <span>Clinical Decision Support active</span>
          </div>
          <h2 className="text-[23px] text-justify font-extrabold tracking-tight w-full md:w-[661px] max-w-full">
            Comprehensive Assessment of <span className="text-emerald-400">Hepatic Function & Risk Factors</span>
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed text-justify w-full md:w-[1067px] max-w-full">
            Diagnose diagnostic data using validated clinical indexes—including 
            FIB-4, APRI, BARD, MELD, and Child-Pugh class. Ingest reports via 
            Gemini Multimodal OCR, evaluate abnormalities instantly, and request secure expert interpretations.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={() => onSetTab("lft")}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm transition-all duration-300 flex items-center gap-1 shadow-lg shadow-emerald-500/10 cursor-pointer"
            >
              <span>Analyze LFT Report</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Clinician Log Overview Section Header */}
      <div className="space-y-1.5 pt-2">
        <div className="flex items-center gap-2">
          <ChevronRight className="text-emerald-500 animate-pulse" size={14} />
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">Clinician Log Activity Overview</h3>
        </div>
      </div>

      {/* Overview Bento Stats - Made Smaller and more Compact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl py-3 px-4 flex flex-row items-center gap-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="p-2 bg-[#2563eb]/10 text-[#2563eb] rounded-xl flex-shrink-0">
            <HeartPulse size={16} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 block leading-none">LFT Screenings</span>
            <span className="text-lg font-extrabold font-mono text-[#1e293b] dark:text-slate-100 leading-none mt-1 block">{lftScans}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl py-3 px-4 flex flex-row items-center gap-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="p-2 bg-cyan-500/10 text-cyan-600 rounded-xl flex-shrink-0">
            <Activity size={16} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 block leading-none">CBC Screenings</span>
            <span className="text-lg font-extrabold font-mono text-[#1e293b] dark:text-slate-100 leading-none mt-1 block">{cbcScans}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl py-3 px-4 flex flex-row items-center gap-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="p-2 bg-violet-500/10 text-violet-600 rounded-xl flex-shrink-0">
            <Scale size={16} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 block leading-none">BMI Screenings</span>
            <span className="text-lg font-extrabold font-mono text-[#1e293b] dark:text-slate-100 leading-none mt-1 block">{bmiScans}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl py-3 px-4 flex flex-row items-center gap-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl flex-shrink-0">
            <FileText size={16} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 block leading-none">Total Evaluations</span>
            <span className="text-lg font-extrabold font-mono text-[#1e293b] dark:text-slate-100 leading-none mt-1 block">{totalScans}</span>
          </div>
        </div>
      </div>

      {/* Alert Status or Healthy banner */}
      {latestAbnormal ? (
        <div className="p-5 bg-red-500/5 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-[20px] flex items-start gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="p-2.5 bg-red-500/10 text-red-600 rounded-xl mt-0.5">
            <ShieldAlert size={18} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-red-700 dark:text-red-400">Attention: Elevated Risk Parameters</h4>
            <p className="text-xs text-slate-500 leading-relaxed max-w-2xl text-justify">
              An abnormal diagnostic risk bracket was flagged in the report: <span className="font-semibold text-slate-800 dark:text-slate-200">"{latestAbnormal.title}"</span> ({latestAbnormal.riskLevel.toUpperCase()}). Please cross-examine with full hepatic assessments, clinical symptoms, and medical professionals.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-5 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-[20px] flex items-start gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-xl mt-0.5">
            <CheckCircle2 size={18} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Biological Parameters Nominal</h4>
            <p className="text-xs text-slate-500 leading-relaxed max-w-2xl text-justify">
              All monitored historical indexes represent low-bracket diagnostic risk. Monitor parameters routinely to track fatty deposit trends and general immunity statistics over time.
            </p>
          </div>
        </div>
      )}

      {/* Risk Distribution Chart & Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Previous Scan Risk Breakdown */}
        <div className="bento-card dark:bg-slate-800 md:col-span-7 flex flex-col justify-between">
          <div>
            <h3 className="card-title">Diagnostic Risk Breakdown</h3>
            <p className="text-xs text-slate-400 mb-6 font-medium">Patient historical risk segmentation across {totalScans} previous evaluations.</p>
            
            {totalScans === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-center space-y-2">
                <span className="text-xs text-slate-300 dark:text-slate-600 font-semibold uppercase tracking-wider">No evaluations recorded</span>
                <p className="text-xs text-slate-400 max-w-xs">Data will populate a risk distribution graph dynamically once screening results are saved.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Low Risk */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Low Risk</span>
                    <span className="font-mono text-slate-400">{lowCount} ({distributePercent(lowCount)}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${distributePercent(lowCount)}%` }} />
                  </div>
                </div>

                {/* Moderate Risk */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Moderate Risk</span>
                    <span className="font-mono text-slate-400">{modCount} ({distributePercent(modCount)}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${distributePercent(modCount)}%` }} />
                  </div>
                </div>

                {/* High Risk */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">High Risk</span>
                    <span className="font-mono text-slate-400">{highCount} ({distributePercent(highCount)}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${distributePercent(highCount)}%` }} />
                  </div>
                </div>

                {/* Critical Risk */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Critical Risk</span>
                    <span className="font-mono text-slate-400">{critCount} ({distributePercent(critCount)}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${distributePercent(critCount)}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="border-t border-slate-100 dark:border-slate-700/50 mt-6 pt-4 text-[11px] text-slate-400 leading-relaxed font-sans flex items-start gap-1">
            <span>Clinical validation markers utilized include: AASLD guidelines (2018), EASL indexes.</span>
          </div>
        </div>

        {/* Clinician Research Panel */}
        <div className="bento-card dark:bg-slate-800 md:col-span-5 flex flex-col justify-between">
          <div>
            <h3 className="card-title">Preventative Recommendations</h3>
            <p className="text-xs text-slate-400 mb-4 font-medium">Standardized clinical guidelines for maintaining healthy metabolic liver balances.</p>

            <ul className="space-y-3">
              <li className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0" />
                <span>
                  <strong>Dietary Balance:</strong> Limit added fructose and simple carbohydrates, as they directly elevate de novo lipogenesis in liver tissue.
                </span>
              </li>
              <li className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0" />
                <span>
                  <strong>Aerobic Activity:</strong> 150 minutes of weekly aerobic exercise stimulates fatty acid beta-oxidation and decreases metabolic liver lipids.
                </span>
              </li>
              <li className="text-xs text-slate-600 dark:text-[#64748b] dark:text-slate-300 leading-relaxed flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0" />
                <span>
                  <strong>Vigilant Monitoring:</strong> Routine LFT screenings are highly recommended if risk factors like BMI &ge; 28, diabetes, or elevated ALT exist.
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-700/10 p-3 rounded-xl">
            <span className="text-[10px] text-indigo-500 font-bold block uppercase tracking-wide mb-1">Did you know?</span>
            <span className="text-xs text-slate-500 leading-tight block">
              The AST/ALT Ratio (De Ritis ratio) can serve as a primary indicator to distinguish simple steatosis from potential alcoholic hepatitis or established vascular cirrhosis.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
