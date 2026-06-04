import React, { useState } from "react";
import { Search, Trash2, Calendar, FileText, ChevronDown, ChevronUp, Printer, CheckCircle, AlertTriangle } from "lucide-react";
import { AnalysisRecord, RiskLevel } from "../types";
import { printClinicalReport } from "../utils/printHelper";

interface AnalysisHistoryProps {
  records: AnalysisRecord[];
  onDeleteRecord: (id: string) => void;
  onClearAll: () => void;
}

export default function AnalysisHistory({ records, onDeleteRecord, onClearAll }: AnalysisHistoryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handlePrint = (record: AnalysisRecord) => {
    printClinicalReport(record);
  };

  const filteredRecords = records.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" ? true : r.type === filterType;
    return matchesSearch && matchesType;
  });

  const getRiskBadge = (level: RiskLevel) => {
    const colors = {
      low: "bg-emerald-50 text-emerald-600 border-emerald-500/10",
      moderate: "bg-amber-50 text-amber-600 border-amber-500/10",
      high: "bg-orange-50 text-orange-600 border-orange-500/10",
      critical: "bg-red-50 text-red-600 border-red-500/11",
    };
    return (
      <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wide ${colors[level]}`}>
        {level}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters workspace */}
      <div className="bento-card dark:bg-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between p-5">
        <div className="relative w-full md:w-80">
          <span className="absolute left-3 top-2.5 text-slate-400">
            <Search size={16} />
          </span>
          <input 
            type="text"
            placeholder="Search saved panels..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700/60 rounded-xl pl-9 pr-4 py-1.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-emerald-500"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto items-center flex-wrap">
          <span className="text-xs text-slate-400 hidden sm:inline">Filter index:</span>
          <div className="flex gap-1 bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-100 dark:border-slate-700/50">
            {["all", "lft", "cbc", "bmi"].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all tracking-wide cursor-pointer ${
                  filterType === t
                    ? "bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {records.length > 0 && (
            <button
              onClick={onClearAll}
              className="ml-auto md:ml-4 text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1 px-3 py-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg cursor-pointer transition-all"
            >
              <Trash2 size={13} />
              <span>Reset Logs</span>
            </button>
          )}
        </div>
      </div>

      {/* List items */}
      {filteredRecords.length === 0 ? (
        <div className="bento-card dark:bg-slate-800 text-center space-y-3 p-12">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-700 text-slate-400 dark:text-slate-300 flex items-center justify-center">
            <FileText size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">No Screening History</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              You haven't saved any diagnostic screening logs yet. Perform calculations inside panels and save them to view reports.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRecords.map(r => {
            const isExpanded = expandedId === r.id;
            return (
              <div 
                key={r.id}
                className="bento-card dark:bg-slate-800 overflow-hidden transition-all duration-300 p-0"
              >
                {/* Header item */}
                <div 
                  onClick={() => toggleExpand(r.id)}
                  className="p-4 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <FileText size={18} className="text-slate-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{r.title}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-300 font-mono mt-0.5 font-semibold">
                        <Calendar size={10} className="text-slate-500 dark:text-slate-300" />
                        <span>{new Date(r.date).toLocaleString()}</span>
                        <span>•</span>
                        <span className="uppercase">{r.type} PANEL</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-auto sm:ml-0">
                    {getRiskBadge(r.riskLevel)}
                    
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteRecord(r.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer transition"
                    >
                      <Trash2 size={14} />
                    </button>

                    <div className="text-slate-500 dark:text-slate-300">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* Collapsible detailed view */}
                {isExpanded && (
                  <div className="p-5 border-t border-slate-50 dark:border-slate-700/30 bg-slate-50/30 dark:bg-slate-800/20 space-y-5">
                    {/* Input values checklist */}
                    <div>
                      <h5 className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-300 uppercase mb-2">Ingested biological ranges</h5>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(r.inputs).map(([k, v]) => (
                          <div key={k} className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 rounded-lg text-xs flex items-center gap-1">
                            <span className="text-slate-500 dark:text-[#94a3b8] font-medium">{k.toUpperCase()}:</span>
                            <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
                              {typeof v === "boolean" ? (v ? "Yes" : "No") : v}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Score summary panel */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Calculated scores */}
                      <div className="p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/40 rounded-xl space-y-2">
                        <span className="text-[10px] font-bold text-indigo-500 uppercase">Assessment Calculations</span>
                        <div className="space-y-1.5 pt-1">
                          {Object.entries(r.results)
                            .filter(([k]) => k !== "summary" && k !== "nafldDescription" && k !== "metabolicRisk" && k !== "overallStatus")
                            .slice(0, 6)
                            .map(([k, v]) => (
                              <div key={k} className="flex justify-between text-xs border-b border-dashed border-slate-50 last:border-0 pb-1 last:pb-0">
                                <span className="text-slate-500 font-medium capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                                <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Diagnostic outcomes summary */}
                      <div className="p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/40 rounded-xl flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-emerald-500 uppercase">Diagnostic Prognosis</span>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                            {r.type === "lft" && (r.results as any).nafldDescription}
                            {r.type === "cbc" && (r.results as any).overallStatus}
                            {r.type === "bmi" && (r.results as any).metabolicRisk}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePrint(r)}
                          className="mt-4 w-full py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Printer size={13} />
                          <span>Generate Lab Printout PDF</span>
                        </button>
                      </div>
                    </div>

                    {/* Gemini advice */}
                    {r.aiInsight && (
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-white space-y-2">
                        <span className="text-[10px] text-emerald-400 font-bold tracking-wider uppercase">Saved Gemini Diagnosis</span>
                        <p className="text-xs text-slate-300 leading-relaxed font-normal whitespace-pre-wrap max-h-48 overflow-y-auto pr-1">
                          {r.aiInsight}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
