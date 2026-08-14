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
    <div style={{ backgroundColor: "#ffffff" }} className="p-6 rounded-[20px] border-2 border-slate-300 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span style={{ color: "#000000" }} className="card-title font-mono font-black text-xs block mb-1 uppercase tracking-wider">
            {label}
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span style={{ color: "#000000" }} className="text-3xl font-black font-mono tracking-tight">
              {value}
            </span>
            <span style={{ color: "#000000" }} className="text-xs font-bold font-sans">{unit}</span>
          </div>
        </div>
        <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border tracking-wide uppercase ${badgeColor}`}>
          {badgeLabel}
        </span>
      </div>

      <div className="mt-5">
        {/* Progress bar */}
        <div className="relative h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
          {/* Normal range highlight zone */}
          <div 
            className="absolute h-full bg-[#22c55e]/25"
            style={{ left: `${normalLeft}%`, width: `${normalWidth}%` }}
          />
          {/* Pinpoint indicator point */}
          <div 
            className={`absolute top-0 w-2.5 h-2.5 rounded-full -ml-1 border border-white shadow-sm transition-all duration-500 ${
              isNormal ? "bg-[#22c55e]" : isLow ? "bg-[#f59e0b]" : "bg-[#ef4444]"
            }`}
            style={{ left: `${percentage}%` }}
          />
        </div>

        {/* Labels */}
        <div style={{ color: "#000000" }} className="flex justify-between items-center text-xs font-mono mt-2 font-black">
          <span>Ref Min: {minNormal}</span>
          <span className="text-emerald-800 font-black uppercase tracking-wider text-[9px]">Normal limits</span>
          <span>Ref Max: {maxNormal}</span>
        </div>
      </div>

      {description && (
        <span style={{ color: "#000000" }} className="text-xs leading-relaxed mt-3 block font-bold">
          {description}
        </span>
      )}
    </div>
  );
}
