import React from "react";

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  minNormal: number;
  maxNormal: number;
  description?: string;
}

export default function MetricCard({
  label,
  value,
  unit,
  minNormal,
  maxNormal,
  description,
}: MetricCardProps) {
  // Determine if value is low, normal, or high
  const isLow = value < minNormal;
  const isHigh = value > maxNormal;
  const isNormal = !isLow && !isHigh;

  let badgeColor = "bg-[#22c55e]/10 border-[#22c55e]/20 text-emerald-600";
  let badgeLabel = "Normal";

  if (isLow) {
    badgeColor = "bg-[#f59e0b]/10 border-[#f59e0b]/20 text-amber-600";
    badgeLabel = "Low";
  } else if (isHigh) {
    badgeColor = "bg-[#ef4444]/10 border-[#ef4444]/20 text-red-600";
    badgeLabel = "High";
  }

  // Calculate position percentage for indicator bar
  const spanNormal = maxNormal - minNormal;
  const lowerBoundary = minNormal - spanNormal * 0.5;
  const upperBoundary = maxNormal + spanNormal * 0.5;
  const range = upperBoundary - lowerBoundary;

  const percentage = range > 0 
    ? Math.min(95, Math.max(5, ((value - lowerBoundary) / range) * 100))
    : 50;

  // Render scale boundaries
  const normalLeft = range > 0 ? ((minNormal - lowerBoundary) / range) * 100 : 25;
  const normalWidth = range > 0 ? ((maxNormal - minNormal) / range) * 100 : 50;

  return (
    <div className="p-6 bg-white dark:bg-slate-800 rounded-[20px] border border-slate-250 dark:border-slate-700/65 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="card-title block mb-1">
            {label}
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-black font-mono tracking-tight text-slate-800 dark:text-slate-100">
              {value}
            </span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-300 font-sans">{unit}</span>
          </div>
        </div>
        <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border tracking-wide uppercase ${badgeColor}`}>
          {badgeLabel}
        </span>
      </div>

      <div className="mt-5">
        {/* Progress bar */}
        <div className="relative h-2 w-full bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
          {/* Normal range highlight zone */}
          <div 
            className="absolute h-full bg-[#22c55e]/15"
            style={{ left: `${normalLeft}%`, width: `${normalWidth}%` }}
          />
          {/* Pinpoint indicator point */}
          <div 
            className={`absolute top-0 w-2 h-2 rounded-full -ml-1 border border-white shadow-sm transition-all duration-500 ${
              isNormal ? "bg-[#22c55e]" : isLow ? "bg-[#f59e0b]" : "bg-[#ef4444]"
            }`}
            style={{ left: `${percentage}%` }}
          />
        </div>

        {/* Labels */}
        <div className="flex justify-between items-center text-[9px] text-[#64748b] dark:text-[#94a3b8] font-mono mt-2 font-bold">
          <span>Ref Min: {minNormal}</span>
          <span className="text-emerald-500 font-semibold uppercase tracking-wider text-[8px]">Normal limits</span>
          <span>Ref Max: {maxNormal}</span>
        </div>
      </div>

      {description && (
        <span className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight mt-3 block font-semibold">
          {description}
        </span>
      )}
    </div>
  );
}
