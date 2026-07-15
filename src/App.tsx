import React, { useState, useEffect } from "react";
import { 
  Terminal, 
  HelpCircle, 
  CheckCircle, 
  AlertTriangle, 
  ArrowRight, 
  BookOpen, 
  History, 
  Trash2, 
  RefreshCw, 
  FileText, 
  Compass,
  AlertCircle,
  Database,
  Sparkles,
  Layers,
  Check
} from "lucide-react";
import Header from "./components/Header";
import SampleLoader from "./components/SampleLoader";
import SchemaManager from "./components/SchemaManager";
import DiffViewer from "./components/DiffViewer";
import ChatHelper, { ChatMessage } from "./components/ChatHelper";
import { TableSchema, AnalysisResponse, HistoryItem } from "./types";

export default function App() {
  // Input form states
  const [errorLog, setErrorLog] = useState("");
  const [code, setCode] = useState("");
  const [selectedTableId, setSelectedTableId] = useState("");
  
  // API and App configuration states
  const [schemas, setSchemas] = useState<TableSchema[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingStep, setAnalyzingStep] = useState(0);
  const [apiError, setApiError] = useState("");
  
  // Active analysis results
  const [results, setResults] = useState<AnalysisResponse | null>(null);

  // Lifted ChatMessages state for the primary chatbot interface
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      sender: "bot",
      text: "차량 커넥티드 데이터 플랫폼 관제 지원 챗봇입니다! 🚗💨\n\n왼쪽 입력란에 에러 로그와 코드를 입력해 분석을 가동하시거나, 이 채팅창에 에러 로그를 직접 붙여넣고 해결책을 물어보세요.\n\n에러가 발생하면 원인을 즉시 파악하고, 고객에게 곧장 전송할 수 있는 **[공손한 티켓 답변 템플릿]**을 정성껏 마련해 드립니다!"
    }
  ]);
  
  // Modals and sidebars visibility
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // Persisted local troubleshooting histories
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const [copied, setCopied] = useState(false);

  const handleCopyReply = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Fetch corporate schemas on mount
  useEffect(() => {
    fetchSchemas();
    // Load local history
    try {
      const saved = localStorage.getItem("pyspark_err_history");
      if (saved) {
        setHistoryItems(JSON.parse(saved));
      }
    } catch (e) {
      console.error("로컬 히스토리 로드 에러:", e);
    }
  }, []);

  const fetchSchemas = async () => {
    try {
      const response = await fetch("/api/schemas");
      if (response.ok) {
        const data = await response.json();
        setSchemas(data);
        if (data.length > 0 && !selectedTableId) {
          // Default selection
          setSelectedTableId(data[0].id);
        }
      }
    } catch (err) {
      console.error("데이터 스키마 패치 에러:", err);
    }
  };

  // Rotating analyzing loader text scheduler
  useEffect(() => {
    let interval: any;
    if (isAnalyzing) {
      interval = setInterval(() => {
        setAnalyzingStep((prev) => (prev + 1) % 3);
      }, 2500);
    } else {
      setAnalyzingStep(0);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const handleSelectSample = (sampleCode: string, sampleError: string, sampleTableId: string) => {
    setCode(sampleCode);
    setErrorLog(sampleError);
    setSelectedTableId(sampleTableId);
    setApiError("");
    // Close sidebar on small screen if loaded
    setIsHistoryOpen(false);
  };

  const handleAddSchema = (newSchema: TableSchema) => {
    setSchemas((prev) => [...prev, newSchema]);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!errorLog.trim()) {
      alert("Jupyter Notebook 에러 로그를 반드시 입력해 주세요.");
      return;
    }

    setIsAnalyzing(true);
    setApiError("");
    setResults(null);

    try {
      const response = await fetch("/api/analyze-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errorLog,
          code,
          referenceTableId: selectedTableId
        })
      });

      if (!response.ok) {
        throw new Error("서버 에러가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }

      const data: AnalysisResponse = await response.json();
      setResults(data);

      // Inject the analysis request & response directly into the chatbot stream!
      const userMessageText = `[폼 분석 요청] 다음 PySpark 에러의 원인과 조치를 검증해 주세요.\n\n* 테이블: ${selectedTable ? selectedTable.name : "미지정"}\n* 에러 로그: ${errorLog.slice(0, 180)}...\n* 분석할 코드:\n\`\`\`python\n${code || "# 코드 없이 에러 분석"}\n\`\`\``;
      
      const botMessageText = `### 🔍 에러 정밀 분석 완료\n\n**요약**: ${data.errorSummary}\n\n**원인 및 해결 제언**:\n${data.explanation}\n\n**교정 코드**:\n\`\`\`python\n${data.correctedCode}\n\`\`\`\n\n[CUSTOMER_REPLY]\n${data.customerReply || ""}\n[/CUSTOMER_REPLY]`;

      setChatMessages((prev) => [
        ...prev,
        {
          id: `user-anal-${Date.now()}`,
          sender: "user",
          text: userMessageText
        },
        {
          id: `bot-anal-${Date.now() + 1}`,
          sender: "bot",
          text: botMessageText
        }
      ]);

      // Save into durable history
      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        errorLog,
        code,
        referenceTableId: selectedTableId,
        response: data
      };

      const updatedHistory = [newHistoryItem, ...historyItems].slice(0, 30); // limit to last 30
      setHistoryItems(updatedHistory);
      localStorage.setItem("pyspark_err_history", JSON.stringify(updatedHistory));

    } catch (err: any) {
      setApiError(err.message || "오류가 발생하여 코드를 분석할 수 없습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLoadHistoryItem = (item: HistoryItem) => {
    setCode(item.code);
    setErrorLog(item.errorLog);
    setSelectedTableId(item.referenceTableId);
    setResults(item.response);
    setApiError("");
    setIsHistoryOpen(false);

    // Sync loaded history directly into the chatbot stream
    const sTable = schemas.find(s => s.id === item.referenceTableId);
    const userMessageText = `[히스토리 복원] 다음 사건의 이전 분석 기록을 가져옵니다:\n\n* 대상 테이블: ${sTable ? sTable.name : "미지정"}\n* 에러 요약: ${item.response.errorSummary}`;
    const botMessageText = `### 🔍 복원된 에러 분석 기록\n\n**에러 요약**: ${item.response.errorSummary}\n\n**원인 및 해결안**:\n${item.response.explanation}\n\n**교정 코드**:\n\`\`\`python\n${item.response.correctedCode}\n\`\`\`\n\n[CUSTOMER_REPLY]\n${item.response.customerReply || ""}\n[/CUSTOMER_REPLY]`;

    setChatMessages((prev) => [
      ...prev,
      {
        id: `user-hist-${Date.now()}`,
        sender: "user",
        text: userMessageText
      },
      {
        id: `bot-hist-${Date.now() + 1}`,
        sender: "bot",
        text: botMessageText
      }
    ]);
  };

  const handleClearHistory = () => {
    if (window.confirm("모든 히스토리를 삭제하시겠습니까?")) {
      setHistoryItems([]);
      localStorage.removeItem("pyspark_err_history");
    }
  };

  const handleResetForm = () => {
    setCode("");
    setErrorLog("");
    setResults(null);
    setApiError("");
  };

  const selectedTable = schemas.find(s => s.id === selectedTableId);

  // Split string based on bullet-points or numbers to make beautiful React-rendered bullet items
  const renderFormattedRemediation = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    return (
      <ul className="space-y-3">
        {lines.map((line, lIdx) => {
          const cleanLine = line.replace(/^(\s*-\s*|\s*\*\s*|\s*\d+\.\s*)/, "").trim();
          const isHeader = line.startsWith("💡") || line.startsWith("⚡") || line.startsWith("**");
          
          if (isHeader) {
            return (
              <h4 key={lIdx} className="font-display font-bold text-xs text-white mt-4 flex items-center space-x-1.5 first:mt-0">
                <span>{cleanLine.replace(/\*\*/g, "")}</span>
              </h4>
            );
          }

          return (
            <li key={lIdx} className="flex items-start text-xs text-slate-300 leading-relaxed pl-1">
              <span className="text-blue-400 mr-2 shrink-0 mt-1">✔</span>
              <span className="font-sans select-text">
                {/* Apply light styling for code words inside backticks */}
                {cleanLine.split(/`([^`]+)`/g).map((part, pIdx) => {
                  const isCode = pIdx % 2 === 1;
                  return isCode ? (
                    <code key={pIdx} className="px-1.5 py-0.5 rounded bg-[#11141D] font-mono text-[10.5px] font-semibold text-rose-400 border border-[#2D313E]">
                      {part}
                    </code>
                  ) : (
                    <span key={pIdx}>{part.replace(/\*\*/g, "")}</span>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="min-h-screen bg-[#0F1117] flex flex-col font-sans text-slate-200 bg-grid-pattern">
      {/* 1. Header Component */}
      <Header 
        onOpenSchemaGuide={() => setIsSchemaModalOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(!isHistoryOpen)}
        historyCount={historyItems.length}
      />

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col lg:flex-row gap-6 relative">
        
        {/* 2. Slide-out Durable History Sidebar */}
        {isHistoryOpen && (
          <aside className="lg:w-80 shrink-0 bg-[#161922] border border-[#2D313E] rounded-lg p-4 shadow-sm flex flex-col max-h-[85vh] sticky top-16 z-10 animate-in slide-in-from-right-5 duration-200">
            <div className="flex items-center justify-between border-b border-[#2D313E] pb-2.5 mb-3">
              <div className="flex items-center space-x-2">
                <History className="h-4 w-4 text-blue-400" />
                <h3 className="font-display font-bold text-xs text-white uppercase tracking-wider">자가 진단 히스토리</h3>
              </div>
              {historyItems.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-slate-400 hover:text-red-400 transition cursor-pointer"
                  title="히스토리 전체 지우기"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {historyItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-500">
                <Compass className="h-7 w-7 mb-2 stroke-1 text-slate-600" />
                <span className="text-xs">저장된 디버깅 기록이 없습니다.</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {historyItems.map((item) => {
                  const sTable = schemas.find(s => s.id === item.referenceTableId);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleLoadHistoryItem(item)}
                      className="w-full text-left p-2.5 rounded border border-[#2D313E] hover:border-blue-500 hover:bg-[#1A1D27] bg-[#11141D] transition cursor-pointer flex flex-col text-xs"
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-mono font-semibold text-slate-300 text-[9px] bg-[#161922] border border-[#2D313E] px-1.5 py-0.2 rounded">
                          {item.response.isInfrastructureError ? "인프라 오류" : "코드 에러"}
                        </span>
                        <span className="text-[9px] text-slate-500">{item.timestamp}</span>
                      </div>
                      <p className="font-semibold text-slate-200 line-clamp-1 mb-1">{item.response.errorSummary || "PySpark 디버깅 케이스"}</p>
                      <p className="text-[9px] text-slate-400 truncate">
                        참조 데이터: {sTable ? sTable.name : "미지정"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>
        )}

        {/* 3. Main Split Workspace (Forms and Solutions) */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6">
          
          {/* Left Panel: Inputs (Error trace & PySpark source code) */}
          <div className="flex-1 lg:max-w-[48%] flex flex-col space-y-5">
            
            {/* Instruction Banner */}
            <div className="bg-blue-950/20 border border-blue-500/30 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="h-4.5 w-4.5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-display font-semibold text-xs text-blue-400 uppercase tracking-wider">코드 수준 에러 & 스키마 앵커 집중전략</h4>
                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                  Jupyter 콘솔에 출력된 에러 로그(Stack Trace) 전체와 에러가 발생한 PySpark 코드를 입력하십시오. 테이블을 연동하면 정확한 스키마 정합성 대조를 진행합니다.
                </p>
              </div>
            </div>

            {/* Error Shooting Request Form */}
            <form onSubmit={handleAnalyze} className="bg-[#161922] border border-[#2D313E] rounded-lg p-5 shadow-sm space-y-4 flex flex-col">
              <div className="flex items-center justify-between border-b border-[#2D313E] pb-2.5">
                <div className="flex items-center space-x-2">
                  <Terminal className="h-4 w-4 text-slate-400" />
                  <span className="font-display font-bold text-xs uppercase tracking-wider text-white">디버깅 명세 입력</span>
                </div>
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="text-xs text-slate-400 hover:text-white transition cursor-pointer"
                >
                  입력 초기화
                </button>
              </div>

              {/* Reference Table Selection Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>1. 참조 데이터셋 선택 (선택 권장)</span>
                  <button
                    type="button"
                    onClick={() => setIsSchemaModalOpen(true)}
                    className="text-[10px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                  >
                    새 스키마 추가 등록하기
                  </button>
                </label>
                <div className="relative">
                  <select
                    id="select_reference_table"
                    value={selectedTableId}
                    onChange={(e) => setSelectedTableId(e.target.value)}
                    className="w-full text-xs border border-[#2D313E] rounded bg-[#1A1D27] text-white px-3 py-2 cursor-pointer focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- 테이블 스키마 연동 안함 (범용 문법 분석) --</option>
                    {schemas.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedTable && (
                  <div className="mt-2 p-2.5 bg-[#11141D] rounded border border-[#2D313E] text-[11px] text-slate-300 flex items-center justify-between">
                    <span className="truncate">📋 {selectedTable.description}</span>
                    <button
                      type="button"
                      onClick={() => setIsSchemaModalOpen(true)}
                      className="text-blue-400 hover:underline font-semibold shrink-0 ml-2"
                    >
                      상세 컬럼 정보 보기
                    </button>
                  </div>
                )}
              </div>

              {/* Error Log TextArea (Required) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  2. Jupyter Notebook 에러 로그 / Stack Trace <span className="text-red-400">*필수</span>
                </label>
                <textarea
                  id="textarea_error_log"
                  required
                  placeholder="예: org.apache.spark.sql.AnalysisException 또는 Python Traceback 등 콘솔창에 나타난 에러 전문을 붙여넣으세요."
                  value={errorLog}
                  onChange={(e) => setErrorLog(e.target.value)}
                  rows={5}
                  className="w-full text-xs font-mono border border-[#2D313E] bg-[#1A1D27] text-white rounded p-3 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 select-text"
                />
              </div>

              {/* Code TextArea (Recommended) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>3. 에러 발생 PySpark 코드 스니펫 <span className="text-slate-500 font-normal">(권장)</span></span>
                  {!code.trim() && (
                    <span className="text-[9px] text-blue-400 font-medium">※ 코드가 비어있으면 에러 로그 기반으로 유추 분석합니다.</span>
                  )}
                </label>
                <textarea
                  id="textarea_pyspark_code"
                  placeholder="예: df.groupBy('invalid_column').sum('quantity')"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  rows={6}
                  className="w-full text-xs font-mono border border-[#2D313E] bg-[#1A1D27] text-white rounded p-3 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 select-text"
                />
              </div>

              {/* Action Submit Button */}
              <button
                type="submit"
                id="btn_analyze_submit"
                disabled={isAnalyzing || !errorLog.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded font-display font-bold text-xs uppercase tracking-wider transition shadow-md shadow-blue-500/10 disabled:bg-[#1A1D27] disabled:text-slate-600 disabled:shadow-none cursor-pointer flex items-center justify-center space-x-2 active:scale-99"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>진단 분석 가동 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>에러 원인 분석 & 해결책 생성</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Presets component */}
            <SampleLoader 
              onSelectSample={handleSelectSample} 
              activeTableId={selectedTableId}
            />

          </div>

          {/* Right Panel: Resolution Outputs */}
          <div className="flex-1 flex flex-col space-y-5">
            
            {/* Always Prominent AI Chatbot at the very top of the right panel */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between pl-1">
                <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                  <HelpCircle className="h-4 w-4 text-blue-400" />
                  <span>실시간 PySpark 디버깅 & 센서 분석 챗봇</span>
                </span>
                <span className="text-[9px] bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono uppercase font-bold tracking-wide">
                  Always Active
                </span>
              </div>
              <ChatHelper 
                messages={chatMessages}
                setMessages={setChatMessages}
                contextData={{
                  errorSummary: results?.errorSummary || "대기 중",
                  originalCode: code,
                  correctedCode: results?.correctedCode || "",
                  explanation: results?.explanation || "",
                  referenceTableId: selectedTableId
                }}
              />
            </div>

            {/* Separator / Title for Analysis Section */}
            <div className="border-t border-[#2D313E] pt-3">
              <span className="text-[10px] font-bold text-slate-400 pl-1 block uppercase tracking-wider">
                정량 분석 진단 결과 및 발송 피드백
              </span>
            </div>

            {/* Loading Overlay State */}
            {isAnalyzing ? (
              <div className="bg-[#161922] border border-[#2D313E] rounded-lg p-8 shadow-sm flex flex-col items-center justify-center text-center h-full min-h-[350px]">
                <div className="relative flex items-center justify-center mb-6">
                  <div className="h-14 w-14 rounded-full border-4 border-blue-900/40 border-t-blue-500 animate-spin"></div>
                  <Terminal className="h-5 w-5 text-blue-400 absolute" />
                </div>
                
                <h3 className="font-display font-bold text-xs text-white uppercase tracking-wider mb-2">
                  에러 및 스키마 연동 정량 진단 중
                </h3>
                
                {/* Dynamically scheduled steps */}
                <div className="max-w-md">
                  <p className="text-xs font-bold text-blue-400 animate-pulse min-h-[20px]">
                    {analyzingStep === 0 && "🔍 PySpark 구문 오류 및 라이브러리 연동 스택 트레이스 파싱 중..."}
                    {analyzingStep === 1 && "📋 선택된 데이터셋 메타데이터 스키마 대조 분석 중..."}
                    {analyzingStep === 2 && "✨ Gemini AI 기반 에러 심층 수정본 및 조치 대안 구성 중..."}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                    본 시스템은 소스 코드에 누락된 패키지 참조, 데이터프레임 타입 변동성 및 컬럼 매핑 정합성을 종합 검정합니다. 잠시만 기다려 주십시오.
                  </p>
                </div>
              </div>
            ) : results ? (
              /* Success / Remedy Outputs */
              <div className="space-y-5 animate-in fade-in duration-200">
                
                {/* 0. 최종 고객 답변 템플릿 (Admin 최우선 순위 결과물) */}
                <div className="bg-[#11141D] border-2 border-blue-500/40 rounded-lg p-5 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                  <div className="flex items-center justify-between border-b border-[#2D313E] pb-3 mb-4">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="h-4.5 w-4.5 text-blue-400" />
                      <span className="font-display font-bold text-xs text-white uppercase tracking-wider">
                        💌 최종 고객 발송용 답변 템플릿 (Support Response Template)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyReply(results.customerReply || "")}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-3 py-1.5 rounded transition flex items-center space-x-1 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-300" />
                          <span className="text-emerald-300">복사 완료</span>
                        </>
                      ) : (
                        <>
                          <Layers className="h-3 w-3" />
                          <span>전체 복사</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="bg-[#161922] border border-[#2D313E] rounded p-4 font-sans text-xs text-slate-200 leading-relaxed whitespace-pre-wrap select-text max-h-[350px] overflow-y-auto">
                    {results.customerReply || "답변 템플릿을 생성하지 못했습니다."}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2.5 font-mono text-right">
                    * 이 텍스트를 복사하여 고객 문의(Ticket) 답변 양식에 붙여넣어 즉시 사용할 수 있습니다.
                  </p>
                </div>

                {/* Status Flag Banner */}
                {results.isInfrastructureError ? (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start space-x-3">
                    <AlertTriangle className="h-4.5 w-4.5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-display font-bold text-xs text-red-400 uppercase tracking-wider">클러스터 인프라 / 시스템 장애 진단</h4>
                      <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                        감지 결과, PySpark 구문 코드의 실수가 아닌 Spark 클러스터 분산 엔진의 자원 임계 초과 문제로 판단됩니다. 아래 제시되는 인프라 개선 방향을 검토하십시오.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-start space-x-3">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-display font-bold text-xs text-emerald-400 uppercase tracking-wider">코드 수준 / 스키마 정합성 에러 매치 성공</h4>
                      <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                        코드 명세 및 데이터 스키마 대조 분석이 완결되었습니다. 교정된 구문 소스코드와 원인 해결 목록을 바로 확인해 보세요.
                      </p>
                    </div>
                  </div>
                )}

                {/* 1. Core Error Summary (One-Sentence) */}
                <div className="bg-[#161922] border border-[#2D313E] rounded-lg p-5 shadow-sm space-y-2">
                  <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">주요 에러 원인 요약 (Summary)</span>
                  <p id="txt_remedy_summary" className="font-display font-bold text-sm text-white leading-snug">
                    {results.errorSummary}
                  </p>
                </div>

                {/* 2. Code comparison Sandbox (DiffViewer) */}
                <div className="space-y-2.5">
                  <span className="text-xs font-semibold text-slate-300 pl-1">코드 교정 가이드 및 패치 결과</span>
                  <DiffViewer originalCode={code} correctedCode={results.correctedCode || ""} />
                </div>

                {/* 3. Schema Alignment Diagnostics */}
                {selectedTableId && (
                  <div className="bg-[#161922] border border-[#2D313E] rounded-lg p-5 shadow-sm space-y-3">
                    <div className="flex items-center space-x-2 border-b border-[#2D313E] pb-2">
                      <Database className="h-4.5 w-4.5 text-slate-400" />
                      <span className="font-display font-bold text-xs text-white uppercase tracking-wider">제공 스키마 대조 상세 분석 결과</span>
                    </div>
                    <div className="text-xs text-slate-300 bg-[#11141D] rounded p-3 border border-[#2D313E] font-sans leading-relaxed whitespace-pre-wrap select-text">
                      {results.schemaAnalysis || "선택된 테이블과 스키마 컬럼 간에 중대한 미스매치는 발견되지 않았거나 문법적 조치가 적용되었습니다."}
                    </div>
                  </div>
                )}

                {/* 4. Remediation Explanation Bulletpoints */}
                <div className="bg-[#161922] border border-[#2D313E] rounded-lg p-5 shadow-sm space-y-3">
                  <div className="flex items-center space-x-2 border-b border-[#2D313E] pb-2">
                    <FileText className="h-4.5 w-4.5 text-slate-400" />
                    <span className="font-display font-bold text-xs text-white uppercase tracking-wider">상세 원인 규명 및 조치 방법</span>
                  </div>
                  <div className="space-y-2">
                    {renderFormattedRemediation(results.explanation || "")}
                  </div>
                </div>

              </div>
            ) : (
              /* Empty Standby State Card */
              <div className="bg-[#161922] border border-[#2D313E] rounded-lg p-8 shadow-sm flex flex-col items-center justify-center text-center min-h-[250px]">
                <div className="h-12 w-12 bg-[#1A1D27] text-blue-400 rounded-lg flex items-center justify-center mb-4 border border-[#2D313E] shadow-sm">
                  <Terminal className="h-5 w-5 stroke-1.5" />
                </div>
                <h3 className="font-display font-bold text-xs uppercase tracking-wider text-white">
                  실시간 원인 교정 대기 중
                </h3>
                <p className="text-[11px] text-slate-400 mt-2 max-w-sm leading-relaxed">
                  아직 원격 정량 분석이 수행되지 않았습니다. 왼쪽 창에서 에러 코드와 스펙을 로딩한 후 <strong>[에러 원인 분석 & 해결책 생성]</strong> 버튼을 클릭하십시오. 관리자 전용 답변 템플릿과 정밀 기술진단 데이터가 이곳에 표시됩니다.
                </p>
                
                <div className="grid grid-cols-2 gap-4 max-w-md w-full mt-6 border-t border-[#2D313E] pt-5">
                  <div className="text-left bg-[#11141D] p-3 rounded border border-[#2D313E]">
                    <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">1단계 정적 진단</span>
                    <p className="text-[10px] text-slate-400 mt-1 leading-snug">인프라 OOM 및 환경 기인성 결함 즉각 식별 피드백</p>
                  </div>
                  <div className="text-left bg-[#11141D] p-3 rounded border border-[#2D313E]">
                    <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">2단계 앵커 매치</span>
                    <p className="text-[10px] text-slate-400 mt-1 leading-snug">사전 등록된 실제 차량 센서 스키마 대조를 통한 완벽 디버깅</p>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* 4. Active Schema Manager Modal Panel */}
      <SchemaManager
        schemas={schemas}
        onAddSchema={handleAddSchema}
        selectedTableId={selectedTableId}
        onSelectTable={setSelectedTableId}
        isOpen={isSchemaModalOpen}
        onClose={() => setIsSchemaModalOpen(false)}
      />

      {/* Professional subtle footer */}
      <footer className="border-t border-[#2D313E] bg-[#11141D] py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-[10px] text-slate-500 font-mono">
          © 2026 PySpark Error Shooting Assistant (가칭) · Secure Server-side Proxy Architecture · Active AI Sandbox
        </div>
      </footer>
    </div>
  );
}
