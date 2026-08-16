import React from "react";
import { AlertTriangle, CheckCircle2, ArrowRight, HelpCircle } from "lucide-react";
import { PlausibilityIssue } from "../utils/plausibilityCheck";

interface DecimalWarningBannerProps {
  issues: PlausibilityIssue[];
  onApplyFix?: (fieldKey: string, value: number) => void;
  onDismiss?: () => void;
}

export default function DecimalWarningBanner({ issues, onApplyFix, onDismiss }: DecimalWarningBannerProps) {
  if (!issues || issues.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50/90 dark:bg-amber-950/40 p-4 sm:p-5 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h4 className="text-sm font-black text-amber-950 dark:text-amber-200 tracking-wide uppercase font-mono flex items-center gap-1.5">
              <span>Potential Missing Decimal Point / Low Scan Quality Alert</span>
              <span className="bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {issues.length} {issues.length === 1 ? "flagged value" : "flagged values"}
              </span>
            </h4>
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mt-0.5">
              OCR scans from camera photos often omit decimal points. Please inspect these values against your printed report:
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 pt-1">
        {issues.map((issue) => (
          <div
            key={issue.fieldKey}
            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-amber-300 dark:border-amber-700/60 shadow-xs flex-wrap sm:flex-nowrap"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono uppercase">
                  {issue.parameterName}:
                </span>
                <span className="text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800 font-mono">
                  Current: {issue.currentValue} {issue.unit}
                </span>
                {issue.suggestedValue !== undefined && (
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 font-mono flex items-center gap-1">
                    <ArrowRight size={12} />
                    Likely: {issue.suggestedValue} {issue.unit}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {issue.reason}
              </p>
            </div>

            {issue.suggestedValue !== undefined && onApplyFix && (
              <button
                type="button"
                onClick={() => onApplyFix(issue.fieldKey, issue.suggestedValue!)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black tracking-wide shrink-0 transition-colors cursor-pointer shadow-xs flex items-center gap-1"
              >
                <CheckCircle2 size={13} />
                <span>Fix to {issue.suggestedValue}</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
