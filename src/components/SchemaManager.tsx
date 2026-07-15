import React, { useState } from "react";
import { TableSchema, TableColumn } from "../types";
import { BookOpen, Plus, Trash2, CheckCircle2, Shield, AlertCircle, Eye } from "lucide-react";

interface SchemaManagerProps {
  schemas: TableSchema[];
  onAddSchema: (newSchema: TableSchema) => void;
  selectedTableId: string;
  onSelectTable: (tableId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function SchemaManager({
  schemas,
  onAddSchema,
  selectedTableId,
  onSelectTable,
  isOpen,
  onClose
}: SchemaManagerProps) {
  const [activeTab, setActiveTab] = useState<"view" | "create">("view");
  
  // Custom schema form state
  const [customTableName, setCustomTableName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customColumns, setCustomColumns] = useState<TableColumn[]>([
    { name: "id", type: "string", description: "고유 인덱스 번호" },
    { name: "created_at", type: "timestamp", description: "데이터 생성 시각" }
  ]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleAddColumnRow = () => {
    setCustomColumns([...customColumns, { name: "", type: "string", description: "" }]);
  };

  const handleRemoveColumnRow = (index: number) => {
    if (customColumns.length <= 1) return;
    const updated = [...customColumns];
    updated.splice(index, 1);
    setCustomColumns(updated);
  };

  const handleColumnChange = (index: number, field: keyof TableColumn, value: string) => {
    const updated = [...customColumns];
    updated[index] = { ...updated[index], [field]: value };
    setCustomColumns(updated);
  };

  const handleRegisterSchema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTableName.trim()) {
      alert("테이블명을 입력해 주세요.");
      return;
    }

    // Validate column names
    const hasEmptyColName = customColumns.some(c => !c.name.trim());
    if (hasEmptyColName) {
      alert("모든 컬럼명을 채워주세요.");
      return;
    }

    setIsRegistering(true);
    setSuccessMessage("");

    try {
      const response = await fetch("/api/schemas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customTableName,
          description: customDescription,
          columns: customColumns
        })
      });

      if (!response.ok) {
        throw new Error("서버 스키마 생성에 실패했습니다.");
      }

      const registeredSchema: TableSchema = await response.json();
      onAddSchema(registeredSchema);
      onSelectTable(registeredSchema.id);
      
      setSuccessMessage(`🎉 테이블 '${customTableName}'의 스키마 명세가 성공적으로 등록되었습니다! 에러 진단 시 앵커 데이터로 사용됩니다.`);
      
      // Reset form
      setCustomTableName("");
      setCustomDescription("");
      setCustomColumns([
        { name: "id", type: "string", description: "고유 식별값" },
        { name: "created_at", type: "timestamp", description: "시간 정보" }
      ]);
      setActiveTab("view");
    } catch (err: any) {
      alert(err.message || "오류가 발생했습니다.");
    } finally {
      setIsRegistering(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-[#11141D] rounded-lg shadow-2xl border border-[#2D313E] max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-[#2D313E] flex items-center justify-between bg-[#161922]">
          <div className="flex items-center space-x-2">
            <BookOpen className="h-4.5 w-4.5 text-blue-400" />
            <h2 className="text-sm font-display font-bold text-white tracking-wide uppercase">
              데이터 스키마 명세 관리 도구 (Schema Inventory)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#232735] transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[#2D313E] bg-[#161922]/50 px-5">
          <button
            id="tab_schema_view"
            onClick={() => { setActiveTab("view"); setSuccessMessage(""); }}
            className={`py-3 px-4 font-sans font-semibold text-xs border-b-2 -mb-px transition cursor-pointer ${
              activeTab === "view"
                ? "border-blue-500 text-blue-400 bg-[#1A1D27]/30"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            📖 적재형 스키마 도감 보기
          </button>
          <button
            id="tab_schema_create"
            onClick={() => { setActiveTab("create"); setSuccessMessage(""); }}
            className={`py-3 px-4 font-sans font-semibold text-xs border-b-2 -mb-px transition cursor-pointer ${
              activeTab === "create"
                ? "border-blue-500 text-blue-400 bg-[#1A1D27]/30"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            ➕ 신규 데이터셋 스키마 등록
          </button>
        </div>

        {/* Success Alert Banner */}
        {successMessage && (
          <div className="mx-5 mt-4 p-4 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start space-x-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Box */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "view" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 h-full">
              {/* Tables Left Sidebar */}
              <div className="md:col-span-1 border-r border-[#2D313E] pr-4 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">테이블 목록 ({schemas.length})</p>
                <div className="space-y-1 max-h-[45vh] overflow-y-auto pr-1">
                  {schemas.map((s) => {
                    const isSelected = selectedTableId === s.id;
                    const isCustom = s.id.toString().startsWith("custom_");
                    return (
                      <button
                        key={s.id}
                        onClick={() => { onSelectTable(s.id); setSuccessMessage(""); }}
                        className={`w-full text-left px-3 py-2.5 rounded transition cursor-pointer flex flex-col border ${
                          isSelected
                            ? "bg-[#1A1D27] border-blue-500/50 text-blue-400"
                            : "hover:bg-[#1A1D27]/60 text-slate-300 border-transparent"
                        }`}
                      >
                        <span className="font-medium text-xs truncate flex items-center justify-between w-full">
                          {s.id}
                          {isCustom && (
                            <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[8px] rounded">Custom</span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate">{s.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Columns Table Right Panel */}
              <div className="md:col-span-2 flex flex-col">
                {(() => {
                  const currentSchema = schemas.find(s => s.id === selectedTableId) || schemas[0];
                  if (!currentSchema) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                        <AlertCircle className="h-8 w-8 mb-2 text-slate-600" />
                        <span className="text-xs">조회할 스키마가 존재하지 않습니다.</span>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-display font-bold text-sm text-white">{currentSchema.name}</span>
                          <span className="text-[10px] bg-[#1A1D27] text-slate-300 font-mono px-2 py-0.5 rounded border border-[#2D313E]">Table ID: {currentSchema.id}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{currentSchema.description}</p>
                      </div>

                      <div className="border border-[#2D313E] rounded overflow-hidden">
                        <table className="min-w-full divide-y divide-[#2D313E] text-xs">
                          <thead className="bg-[#161922]">
                            <tr>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-300">컬럼명</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-300">데이터 타입</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-300">비고/설명</th>
                            </tr>
                          </thead>
                          <tbody className="bg-[#1A1D27] divide-y divide-[#2D313E] text-slate-300">
                            {currentSchema.columns.map((col, cIdx) => (
                              <tr key={cIdx} className="hover:bg-[#232735]">
                                <td className="px-4 py-2.5 font-mono font-medium text-white">{col.name}</td>
                                <td className="px-4 py-2.5">
                                  <span className="inline-flex px-1.5 py-0.5 rounded bg-[#11141D] border border-[#2D313E] text-slate-300 font-mono text-[10px]">
                                    {col.type}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-400">{col.description || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="p-3.5 bg-blue-900/10 rounded border border-blue-500/30 text-xs text-slate-300 leading-relaxed flex items-start space-x-2">
                        <Shield className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                        <span>
                          이 테이블이 <strong>'참조 테이블'</strong>로 체크된 상태에서 PySpark 분석을 실행하면, AI 모델이 해당 컬럼 및 명세를 확인하여 오탈자가 있거나 부적절한 가공 함수를 썼을 때 완벽하게 캐치하여 알려줍니다.
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <form onSubmit={handleRegisterSchema} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">테이블명 (영어/숫자 권장, 예: my_pyspark_table)</label>
                  <input
                    type="text"
                    required
                    placeholder="테이블명을 입력하세요"
                    value={customTableName}
                    onChange={(e) => setCustomTableName(e.target.value)}
                    className="w-full text-xs border border-[#2D313E] bg-[#1A1D27] text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">테이블 설명 (한글 지원, 예: 마케팅 성과분석 테이블)</label>
                  <input
                    type="text"
                    placeholder="테이블 설명을 입력하세요"
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    className="w-full text-xs border border-[#2D313E] bg-[#1A1D27] text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 border-b border-[#2D313E] pb-2">
                  <span className="text-xs font-semibold text-slate-300">컬럼 구조 구성 ({customColumns.length})</span>
                  <button
                    type="button"
                    onClick={handleAddColumnRow}
                    className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium cursor-pointer transition"
                  >
                    <Plus className="h-3 w-3" />
                    <span>컬럼 추가</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                  {customColumns.map((col, idx) => (
                    <div key={idx} className="flex items-center space-x-2 bg-[#1A1D27] p-2 rounded border border-[#2D313E]">
                      <input
                        type="text"
                        required
                        placeholder="컬럼명 (예: age)"
                        value={col.name}
                        onChange={(e) => handleColumnChange(idx, "name", e.target.value)}
                        className="flex-1 text-xs border border-[#2D313E] bg-[#11141D] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                      />
                      <select
                        value={col.type}
                        onChange={(e) => handleColumnChange(idx, "type", e.target.value)}
                        className="w-32 text-xs border border-[#2D313E] bg-[#11141D] text-white rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                      >
                        <option value="string">string</option>
                        <option value="integer">integer</option>
                        <option value="double">double</option>
                        <option value="timestamp">timestamp</option>
                        <option value="date">date</option>
                        <option value="boolean">boolean</option>
                        <option value="binary">binary</option>
                      </select>
                      <input
                        type="text"
                        placeholder="설명 (예: 고객의 현재 만 나이)"
                        value={col.description || ""}
                        onChange={(e) => handleColumnChange(idx, "description", e.target.value)}
                        className="flex-1 text-xs border border-[#2D313E] bg-[#11141D] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveColumnRow(idx)}
                        disabled={customColumns.length <= 1}
                        className="text-slate-400 hover:text-red-400 p-1 rounded disabled:opacity-40 transition cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2 border-t border-[#2D313E] pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab("view")}
                  className="px-4 py-1.5 bg-[#1A1D27] border border-[#2D313E] text-slate-300 rounded text-xs font-medium hover:bg-[#232735] hover:text-white cursor-pointer transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isRegistering}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium disabled:bg-gray-700 cursor-pointer transition flex items-center space-x-1"
                >
                  {isRegistering ? "등록 중..." : "새 테이블 스키마 등록 완료"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

