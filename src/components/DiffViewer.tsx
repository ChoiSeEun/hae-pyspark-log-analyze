import React, { useState } from "react";
import { FileCode, Check, Copy, ArrowRight, CornerDownRight } from "lucide-react";

interface DiffViewerProps {
  originalCode: string;
  correctedCode: string;
}

export default function DiffViewer({ originalCode, correctedCode }: DiffViewerProps) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"corrected" | "split">("split");

  const handleCopy = () => {
    navigator.clipboard.writeText(correctedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const originalLines = originalCode.trim() ? originalCode.split("\n") : [];
  const correctedLines = correctedCode.trim() ? correctedCode.split("\n") : [];

  return (
    <div className="bg-[#1A1D27] text-slate-100 rounded-lg overflow-hidden border border-[#2D313E] shadow-sm">
      {/* Header controls */}
      <div className="bg-[#161922] px-4 py-2.5 border-b border-[#2D313E] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileCode className="h-4 w-4 text-blue-400" />
          <span className="font-display font-bold text-[10px] tracking-wider uppercase text-slate-400">
            PySpark Code Sandbox
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* View toggle */}
          {originalCode.trim() && (
            <div className="flex bg-[#11141D] p-0.5 rounded border border-[#2D313E] mr-1">
              <button
                type="button"
                id="btn_diff_split"
                onClick={() => setViewMode("split")}
                className={`px-2.5 py-0.5 text-[9px] font-bold rounded transition cursor-pointer ${
                  viewMode === "split" ? "bg-[#1A1D27] text-blue-400" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                전후 대비 (Split)
              </button>
              <button
                type="button"
                id="btn_diff_corrected"
                onClick={() => setViewMode("corrected")}
                className={`px-2.5 py-0.5 text-[9px] font-bold rounded transition cursor-pointer ${
                  viewMode === "corrected" ? "bg-[#1A1D27] text-blue-400" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                교정 코드만 보기
              </button>
            </div>
          )}

          {/* Copy Button */}
          <button
            type="button"
            id="btn_diff_copy"
            onClick={handleCopy}
            className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] uppercase tracking-wider rounded cursor-pointer transition active:scale-95 shadow-sm shadow-blue-500/10"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                <span>복사 완료</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>코드 복사</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Area */}
      <div className="font-mono text-[11px] leading-relaxed overflow-x-auto">
        {viewMode === "split" && originalCode.trim() ? (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#2D313E]">
            {/* Original Error Code */}
            <div className="p-4 bg-[#1A1D27]">
              <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2 border-b border-red-500/20 pb-1.5 flex items-center justify-between">
                <span>기존 발생 코드 (Error Code)</span>
                <span className="px-1.5 py-0.2 bg-red-500/10 text-red-400 border border-red-500/30 rounded text-[8px]">MISMAPPED</span>
              </div>
              <pre className="max-h-[350px] overflow-y-auto whitespace-pre-wrap font-mono select-text text-red-300/80">
                {originalLines.map((line, idx) => {
                  const isModified = correctedLines[idx] !== line;
                  return (
                    <div
                      key={idx}
                      className={`px-1 rounded ${
                        isModified ? "bg-red-500/10 text-red-300 border-l-2 border-red-500 pl-1" : "text-slate-400"
                      }`}
                    >
                      <span className="inline-block w-4 text-slate-600 select-none text-right mr-3">{idx + 1}</span>
                      {line || " "}
                    </div>
                  );
                })}
              </pre>
            </div>

            {/* Corrected Clean Code */}
            <div className="p-4 bg-[#11141D]">
              <div className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-2 border-b border-green-500/20 pb-1.5 flex items-center justify-between">
                <span>추천 교정 코드 (Corrected Code)</span>
                <span className="px-1.5 py-0.2 bg-green-500/10 text-green-400 border border-green-500/30 rounded text-[8px]">REVISED</span>
              </div>
              <pre className="max-h-[350px] overflow-y-auto whitespace-pre-wrap font-mono select-text text-slate-100">
                {correctedLines.map((line, idx) => {
                  const isModified = originalLines[idx] !== line;
                  return (
                    <div
                      key={idx}
                      className={`px-1 rounded ${
                        isModified ? "bg-green-500/15 text-green-300 border-l-2 border-green-500 pl-1" : "text-slate-300"
                      }`}
                    >
                      <span className="inline-block w-4 text-slate-600 select-none text-right mr-3">{idx + 1}</span>
                      {line || " "}
                    </div>
                  );
                })}
              </pre>
            </div>
          </div>
        ) : (
          /* Full Screen Corrected Code */
          <div className="p-4 bg-[#1A1D27] select-text">
            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-3 border-b border-[#2D313E] pb-2 flex items-center space-x-1.5">
              <CornerDownRight className="h-3 w-3" />
              <span>완성본 소스코드 명세</span>
            </div>
            <pre className="max-h-[400px] overflow-y-auto whitespace-pre-wrap font-mono select-text bg-[#11141D] p-3 rounded border border-[#2D313E] text-blue-100">
              {correctedLines.map((line, idx) => (
                <div key={idx} className="hover:bg-[#232735] px-1 rounded">
                  <span className="inline-block w-6 text-slate-600 select-none text-right mr-4">{idx + 1}</span>
                  <span>{line || " "}</span>
                </div>
              ))}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

