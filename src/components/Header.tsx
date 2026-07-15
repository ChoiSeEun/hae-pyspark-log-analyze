import React from "react";
import { Terminal, ShieldAlert, Sparkles, HelpCircle } from "lucide-react";

interface HeaderProps {
  onOpenSchemaGuide: () => void;
  onOpenHistory: () => void;
  historyCount: number;
}

export default function Header({ onOpenSchemaGuide, onOpenHistory, historyCount }: HeaderProps) {
  return (
    <header className="border-b border-[#2D313E] bg-[#161922] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Branding & Title */}
        <div className="flex items-center space-x-3">
          <div className="w-3.5 h-3.5 bg-blue-500 rounded-xs rotate-45 animate-pulse shadow-md shadow-blue-500/20"></div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-display font-bold text-sm tracking-tight text-white flex items-center">
                PySpark <span className="text-blue-400 ml-1">에러 슈팅 어시스턴트</span>
              </h1>
              <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] uppercase font-bold border border-blue-500/50 text-blue-400 rounded">
                Phase 1
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-sans">
              데이터 스키마 기반 실시간 PySpark 코드 진단 & 해결 솔루션
            </p>
          </div>
        </div>

        {/* Action Controls & Info */}
        <div className="flex items-center space-x-3">
          {/* Status Indicators */}
          <div className="hidden md:flex items-center space-x-4 mr-2 border-r border-[#2D313E] pr-4">
            <div className="flex items-center space-x-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-tight">SCHEMA ENGINE: ONLINE</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-tight">CLUSTER API: CONNECTED</span>
            </div>
          </div>

          {/* Navigation/Toggle Buttons */}
          <button
            id="btn_header_schemas"
            onClick={onOpenSchemaGuide}
            className="inline-flex items-center px-3 py-1 rounded bg-[#1A1D27] border border-[#2D313E] text-xs font-medium text-slate-300 hover:text-white hover:bg-[#232735] hover:border-slate-500 transition duration-150 cursor-pointer"
          >
            📋 제공 스키마 도감
          </button>
          
          <button
            id="btn_header_history"
            onClick={onOpenHistory}
            className="relative inline-flex items-center px-3 py-1 rounded bg-[#1A1D27] border border-[#2D313E] text-xs font-medium text-slate-300 hover:text-white hover:bg-[#232735] hover:border-slate-500 transition duration-150 cursor-pointer"
          >
            🕒 히스토리 목록
            {historyCount > 0 && (
              <span className="ml-1.5 px-1 py-0.2 text-[9px] font-bold text-white bg-blue-600 rounded-full">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

