import React from "react";
import { RiskLevel } from "../types";

interface ScoreGaugeProps {
  score: number;
  maxScore: number;
  label: string;
  riskLevel: RiskLevel;
}

export default function ScoreGauge({ score, maxScore, label, riskLevel }: ScoreGaugeProps) {
  const percentage = Math.min(100, Math.max(0, (score / maxScore) * 100));

  const config = {
    low: { bar: "bg-[#22c55e]", text: "text-emerald-600", dot: "bg-[#22c55e]", labelText: "Low Risk" },
    moderate: { bar: "bg-[#f59e0b]", text: "text-amber-500", dot: "bg-[#f59e0b]", labelText: "Moderate Risk" },
    high: { bar: "bg-[#f59e0b]", text: "text-orange-500", dot: "bg-[#f59e0b]", labelText: "High Risk" },
    critical: { bar: "bg-[#ef4444]", text: "text-red-500", dot: "bg-[#ef4444]", labelText: "Critical Risk" },
  };

  const style = config[riskLevel] || config.low;

  return (
    <div style={{ backgroundColor: "#ffffff" }} className="bento-card border-2 border-slate-300 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all duration-300">
      <div className="flex-1">
        <h4 style={{ color: "#000000" }} className="card-title font-mono font-black text-xs uppercase tracking-wider mb-1">{label}</h4>
        <div className="flex items-baseline gap-2">
          <div style={{ color: "#000000" }} className="score-big leading-none select-none tracking-tighter">
            {score.toFixed(1).endsWith(".0") ? score : score.toFixed(1)}
            <span style={{ color: "#000000" }} className="text-xl font-black font-sans tracking-normal ml-1">/ {maxScore}</span>
          </div>
        </div>
        <p style={{ color: "#000000" }} className="text-xs font-bold flex items-center gap-2 mt-2">
          <span>Clinical Bracket:</span>
          <span className="inline-flex items-center gap-1.5 font-black">
            <span className={`w-2.5 h-2.5 rounded-full inline-block ${style.dot}`} />
            <span className={style.text}>{style.labelText}</span>
          </span>
        </p>
      </div>

      <div className="w-full md:w-64 flex flex-col justify-end">
        <div style={{ color: "#000000" }} className="text-xs font-black uppercase tracking-wider mb-2 text-right">
          Trend Progress bar
        </div>
        <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-1000 ease-out ${style.bar}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div style={{ color: "#000000" }} className="flex justify-between text-xs font-mono mt-2 font-black select-none">
          <span>0.0</span>
          <span>{(maxScore / 2).toFixed(1)}</span>
          <span>{maxScore.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
