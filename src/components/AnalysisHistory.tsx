import React, { useState } from "react";
import { Search, Trash2, Calendar, FileText, ChevronDown, ChevronUp, Printer } from "lucide-react";
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
      low: "bg-emerald-100 text-emerald-950 border-emerald-400 font-black",
      moderate: "bg-amber-100 text-amber-950 border-amber-400 font-black",
      high: "bg-orange-100 text-orange-950 border-orange-400 font-black",
      critical: "bg-red-100 text-red-950 border-red-400 font-black",
    };
    return (
      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border-2 uppercase tracking-wide ${colors[level]}`}>
        {level}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters workspace */}
      <div style={{ backgroundColor: "#ffffff" }} className="bento-card border-2 border-slate-300 flex flex-col md:flex-row gap-4 items-center justify-between p-5">
        <div className="relative w-full md:w-80">
          <span className="absolute left-3 top-2.5 text-slate-700">
            <Search size={16} />
          </span>
          <input 
            type="text" 
            placeholder="Search saved panels..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border-2 border-slate-300 rounded-xl pl-9 pr-4 py-1.5 text-sm text-slate-950 font-bold placeholder-slate-400 focus:outline-emerald-500"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto items-center flex-wrap">
          <span style={{ color: "#000000" }} className="text-xs font-black hidden sm:inline">Filter index:</span>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border-2 border-slate-300">
            {["all", "lft", "cbc", "bmi", "metabolic"].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-lg text-xs font-black uppercase transition-all tracking-wide cursor-pointer ${
                  filterType === t
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-700 hover:text-slate-950"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {records.length > 0 && (
            <button
              onClick={onClearAll}
              className="ml-auto md:ml-4 text-xs font-black text-red-600 hover:text-red-700 flex items-center gap-1 px-3 py-1 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer transition-all"
            >
              <Trash2 size={13} />
              <span>Reset Logs</span>
            </button>
          )}
        </div>
      </div>

      {/* List items */}
      {filteredRecords.length === 0 ? (
        <div style={{ backgroundColor: "#ffffff" }} className="bento-card border-2 border-slate-300 text-center space-y-3 p-12">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
            <FileText size={24} />
          </div>
          <div>
            <h3 style={{ color: "#000000" }} className="text-sm font-black">No Screening History</h3>
            <p style={{ color: "#000000" }} className="text-xs font-bold mt-1 max-w-sm mx-auto">
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
                style={{ backgroundColor: "#ffffff" }}
                className="bento-card border-2 border-slate-300 overflow-hidden transition-all duration-300 p-0 shadow-sm"
              >
                {/* Header item */}
                <div 
                  onClick={() => toggleExpand(r.id)}
                  className="p-4 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap cursor-pointer hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-100 border-2 border-slate-200">
                      <FileText size={18} className="text-slate-800" />
                    </div>
                    <div>
                      <h4 style={{ color: "#000000" }} className="text-sm font-black">{r.title}</h4>
                      <div style={{ color: "#000000" }} className="flex items-center gap-2 text-xs font-mono mt-0.5 font-bold">
                        <Calendar size={11} className="text-slate-800" />
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
                      className="p-1.5 rounded-lg text-slate-700 hover:text-red-600 hover:bg-red-50 cursor-pointer transition"
                    >
                      <Trash2 size={15} />
                    </button>

                    <div className="text-slate-800 font-bold">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Collapsible detailed view */}
                {isExpanded && (
                  <div className="p-5 border-t-2 border-slate-200 bg-slate-50 space-y-5">
                    {/* Input values checklist */}
                    <div>
                      <h5 style={{ color: "#000000" }} className="text-xs font-black tracking-wider uppercase mb-2">Ingested biological ranges</h5>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(r.inputs).map(([k, v]) => (
                          <div key={k} style={{ backgroundColor: "#ffffff" }} className="px-3 py-1 border-2 border-slate-300 rounded-lg text-xs flex items-center gap-1">
                            <span style={{ color: "#000000" }} className="font-bold">{k.toUpperCase()}:</span>
                            <span style={{ color: "#000000" }} className="font-black font-mono">
                              {typeof v === "boolean" ? (v ? "Yes" : "No") : v}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Score summary panel */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Calculated scores */}
                      <div style={{ backgroundColor: "#ffffff" }} className="p-4 border-2 border-slate-300 rounded-xl space-y-2">
                        <span style={{ color: "#4338ca" }} className="text-xs font-black uppercase block">Assessment Calculations</span>
                        <div className="space-y-1.5 pt-1">
                          {Object.entries(r.results)
                            .filter(([k]) => k !== "summary" && k !== "nafldDescription" && k !== "metabolicRisk" && k !== "overallStatus")
                            .slice(0, 6)
                            .map(([k, v]) => (
                              <div key={k} className="flex justify-between text-xs border-b border-dashed border-slate-200 last:border-0 pb-1 last:pb-0">
                                <span style={{ color: "#000000" }} className="font-bold capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                                <span style={{ color: "#000000" }} className="font-black font-mono">
                                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Diagnostic outcomes summary */}
                      <div style={{ backgroundColor: "#ffffff" }} className="p-4 border-2 border-slate-300 rounded-xl flex flex-col justify-between">
                        <div>
                          <span style={{ color: "#065f46" }} className="text-xs font-black uppercase block">Diagnostic Prognosis</span>
                          <p style={{ color: "#000000" }} className="text-xs mt-2 leading-relaxed font-bold">
                            {r.type === "lft" && (r.results as any).nafldDescription}
                            {r.type === "cbc" && (r.results as any).overallStatus}
                            {r.type === "bmi" && (r.results as any).metabolicRisk}
                            {r.type === "metabolic" && (r.results as any).summary}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePrint(r)}
                          className="mt-4 w-full py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Printer size={13} />
                          <span>Generate Lab Printout PDF</span>
                        </button>
                      </div>
                    </div>

                    {/* Gemini advice */}
                    {r.aiInsight && (
                      <div style={{ backgroundColor: "#ffffff" }} className="p-4 border-2 border-slate-300 rounded-xl space-y-2">
                        <span style={{ color: "#065f46" }} className="text-xs font-black tracking-wider uppercase block">Saved Clinical Diagnosis</span>
                        <p style={{ color: "#000000" }} className="text-xs leading-relaxed font-medium whitespace-pre-wrap max-h-48 overflow-y-auto pr-1">
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
