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
    title: "특정 차종 센서 신호 부재 오류",
    badge: "AnalysisException",
    badgeColor: "bg-red-500/10 text-red-400 border-red-500/30",
    tableId: "vehicle_telemetry_raw",
    icon: <Database className="h-4 w-4" />,
    description: "순수 전기차(IONIQ5, EV6) 등의 주행 이력을 필터링하면서 해당 차종에 존재하지 않는 'engine_rpm' 신호를 조회/가공하려다 스키마 정합성이 어긋난 에러",
    code: `df = spark.read.table("vehicle_telemetry_raw")

# 순수 전기차(Pure EV) 주행 데이터 추출 필터
ev_df = df.filter("model_name IN ('IONIQ5', 'EV6')")

# 전기차에는 존재하지 않는 'engine_rpm' 컬럼을 평균내려고 시도하여 예외 발생
ev_summary = ev_df.groupBy("model_name") \\
                   .agg({"engine_rpm": "avg", "ev_battery_soc": "avg"})

ev_summary.show()`,
    errorLog: `org.apache.spark.sql.AnalysisException: [UNRESOLVED_COLUMN.WITH_SUGGESTION] A column or function parameter with name \`engine_rpm\` cannot be resolved for selected Electric Vehicle models or the underlying table structure. Did you mean one of the following? [\`ev_battery_soc\`, \`speed_kph\`, \`gear_position\`, \`steering_angle_deg\`]`
  },
  {
    title: "ADAS 센서 신호명 오타",
    badge: "AnalysisException",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    tableId: "vehicle_adas_events",
    icon: <FileCode className="h-4 w-4" />,
    description: "ADAS 주행 이벤트 테이블에서 조향 토크 컬럼명 'steering_torque_nm'을 'st_torque_nm'으로 잘못 입력하여 발생한 스키마 분석 예외",
    code: `df = spark.read.table("vehicle_adas_events")

# 조향 토크(steering_torque_nm) 컬럼명을 'st_torque_nm'으로 오타 발생
torque_stats = df.groupBy("adas_feature") \\
                 .min("st_torque_nm") \\
                 .withColumnRenamed("min(st_torque_nm)", "min_torque")

torque_stats.show()`,
    errorLog: `org.apache.spark.sql.AnalysisException: [UNRESOLVED_COLUMN.WITH_SUGGESTION] A column or function parameter with name \`st_torque_nm\` cannot be resolved. Did you mean one of the following? [\`steering_torque_nm\`, \`vehicle_id\`, \`timestamp\`, \`adas_feature\`]`
  },
  {
    title: "블랙박스 이미지 로그 OOM",
    badge: "OutOfMemory",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    tableId: "vehicle_telemetry_raw",
    icon: <Cpu className="h-4 w-4" />,
    description: "차량별 테라바이트급 고해상도 수집 이벤트를 분산 처리하지 않고 드라이버 단일 메모리로 무리하게 collect()를 감행하여 자바 힙 공간이 부족해 터진 인프라성 에러",
    code: `# 수천만 대 차량의 실시간 정밀 센서 원시 시퀀스 전체를 로드
raw_telemetry = spark.read.table("vehicle_telemetry_raw")

# 분산 집계 또는 필터링 없이 100GB가 넘는 로우 데이터를 한 번에 로컬 메모리로 덤프 호출
local_data = raw_telemetry.collect()`,
    errorLog: `java.lang.OutOfMemoryError: Java heap space
  at java.util.Arrays.copyOf(Arrays.java:3332)
  at org.apache.spark.serializer.KryoSerializerInstance.serialize(KryoSerializer.scala:180)
  at org.apache.spark.executor.Executor$TaskRunner.run(Executor.scala:412)
WARN TaskSetManager: Lost task 0.0 in stage 1.0 (TID 5, vehicle-cluster-executor-2): java.lang.OutOfMemoryError: Java heap space`
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

