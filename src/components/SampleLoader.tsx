import React from "react";
import { TableSchema } from "../types";
import { AlertCircle, Database, FileCode, Cpu, HelpCircle } from "lucide-react";

interface SampleCase {
  title: string;
  badge: string;
  badgeColor: string;
  tableId: string;
  icon: React.ReactNode;
  description: string;
  code: string;
  errorLog: string;
}

const SAMPLE_CASES: SampleCase[] = [
  {
    title: "컬럼명 오타 & 스키마 불일치",
    badge: "AnalysisException",
    badgeColor: "bg-red-500/10 text-red-400 border-red-500/30",
    tableId: "sales_transactions",
    icon: <Database className="h-4 w-4" />,
    description: "테이블에 없는 'tracs_date' 컬럼을 groupBy로 참조하려다 스키마 파싱에 실패한 에러",
    code: `df = spark.read.table("sales_transactions")

# 'transaction_date'를 'tracs_date'로 오타 입력함
daily_sales = df.groupBy("tracs_date") \\
                .sum("quantity") \\
                .withColumnRenamed("sum(quantity)", "total_qty")

daily_sales.show(5)`,
    errorLog: `org.apache.spark.sql.AnalysisException: [UNRESOLVED_COLUMN.WITH_SUGGESTION] A column or function parameter with name \`tracs_date\` cannot be resolved. Did you mean one of the following? [\`transaction_date\`, \`transaction_id\`, \`payment_method\`]`
  },
  {
    title: "잘못된 데이터 형식 연산 시도",
    badge: "TypeError",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    tableId: "user_profiles",
    icon: <FileCode className="h-4 w-4" />,
    description: "정수형 age 컬럼에 형변환 없이 문자열 '1'을 더하다가 Python 인터프리터 수준에서 발생한 에러",
    code: `from pyspark.sql.functions import col

df = spark.read.table("user_profiles")

# age(정수형) 컬럼에 문자열 "1"을 더하여 발생한 연산 오류
# (PySpark Column 연산에서는 cast가 동반되거나 정수를 더해야 함)
df_filtered = df.withColumn("next_age", col("age") + "1")
df_filtered.select("user_id", "age", "next_age").show(5)`,
    errorLog: `TypeError: Unsupported operand type(s) for +: 'Column' and 'str'
at pyspark.sql.column.Column.__add__(column.py:115)
at <stdin> in <module> line 6`
  },
  {
    title: "클러스터 리소스 / 메모리 한계 초과",
    badge: "Infrastructure",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    tableId: "sales_transactions",
    icon: <Cpu className="h-4 w-4" />,
    description: "드라이버 메모리 리밋을 고려하지 않고 거대 대용량 테이블에 collect()를 호출해 YARN/GC가 강제 종료한 에러",
    code: `# 수억 건의 데이터셋을 싱글 노드 드라이버 메모리로 전부 덤프 시도
df = spark.read.table("sales_transactions")

# 분산 저장이 권장되는 상황에서 드라이버 수집 강행
huge_result = df.collect()`,
    errorLog: `java.lang.OutOfMemoryError: Java heap space
  at java.util.Arrays.copyOf(Arrays.java:3332)
  at java.io.ByteArrayOutputStream.write(ByteArrayOutputStream.java:123)
  at org.apache.spark.util.Utils$.writeByteBuffer(Utils.scala:212)
  at org.apache.spark.serializer.KryoSerializerInstance.serialize(KryoSerializer.scala:180)
  at org.apache.spark.executor.Executor$TaskRunner.run(Executor.scala:412)
  at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.stats:1149)
  at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:624)
  at java.lang.Thread.run(Thread.java:748)
WARN TaskSetManager: Lost task 0.0 in stage 3.0 (TID 12, cluster-executor-1): java.lang.OutOfMemoryError: Java heap space`
  }
];

interface SampleLoaderProps {
  onSelectSample: (code: string, errorLog: string, tableId: string) => void;
  activeTableId: string;
}

export default function SampleLoader({ onSelectSample, activeTableId }: SampleLoaderProps) {
  return (
    <div className="bg-[#161922] rounded-lg border border-[#2D313E] p-5 shadow-sm">
      <div className="flex items-center space-x-2 mb-3">
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
        <h3 className="font-display font-semibold text-xs uppercase tracking-wider text-slate-300">
          원클릭 에러 템플릿 로드 (데모/테스트용)
        </h3>
      </div>
      <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
        고객들이 자주 겪는 전형적인 PySpark 오류 케이스를 로드해 즉각 어시스턴트의 진단 정확도와 스키마 대조 동작을 시험해보세요.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SAMPLE_CASES.map((item, idx) => {
          const isSelected = activeTableId === item.tableId;
          return (
            <button
              key={idx}
              type="button"
              id={`btn_sample_case_${idx}`}
              onClick={() => onSelectSample(item.code, item.errorLog, item.tableId)}
              className="flex flex-col text-left p-3.5 rounded bg-[#1A1D27] border border-[#2D313E] hover:bg-[#232735] hover:border-blue-500/50 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500/30 group"
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="p-1.5 rounded bg-[#11141D] border border-[#2D313E] text-slate-400 group-hover:text-blue-400">
                  {item.icon}
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${item.badgeColor}`}>
                  {item.badge}
                </span>
              </div>
              <h4 className="font-sans font-semibold text-xs text-white group-hover:text-blue-400">
                {item.title}
              </h4>
              <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

