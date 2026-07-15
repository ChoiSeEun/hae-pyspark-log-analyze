import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { TableSchema, AnalysisRequest, AnalysisResponse } from "./src/types.js";

// Load environment variables
dotenv.config();

// Pre-seeded standard schemas representing internal vehicle telemetry & specs
const PREDEFINED_SCHEMAS: TableSchema[] = [
  {
    id: "vehicle_telemetry_raw",
    name: "vehicle_telemetry_raw (실시간 주행 센서 계측 데이터)",
    description: "커넥티드 카 수집 주행 센서, 배터리 충방전 및 모터/엔진 계측 원시 신호",
    columns: [
      { name: "vehicle_id", type: "string", description: "차량 고유 차대 번호 (VIN)" },
      { name: "model_name", type: "string", description: "차종 모델명 (예: IONIQ5, EV6, GV70, Sorento_HEV, Grandeur_ICE)" },
      { name: "timestamp", type: "timestamp", description: "센서 계측 수집 타임스탬프" },
      { name: "speed_kph", type: "double", description: "차량 현재 주행 속도 (km/h)" },
      { name: "engine_rpm", type: "integer", description: "엔진 회전수 (내연기관/HEV 전용, 순수 EV일 경우 미지원/NULL)" },
      { name: "ev_battery_soc", type: "double", description: "고전압 배터리 잔량 (%, EV/HEV 전용, 일반 가솔린/디젤 차량일 경우 미지원/NULL)" },
      { name: "gear_position", type: "string", description: "기어 선택단 위치 (P, R, N, D)" },
      { name: "steering_angle_deg", type: "double", description: "스티어링 휠 조향각 (Degree)" },
      { name: "fuel_level_percent", type: "double", description: "주유 연료 잔량 (%, ICE/HEV 전용, 순수 EV일 경우 미지원/NULL)" }
    ]
  },
  {
    id: "vehicle_spec_reference",
    name: "vehicle_spec_reference (차종 세그먼트/사양 마스터)",
    description: "차량 모델별 사양 정보, 연료 타입 및 ADAS 센서 탑재 여부 메타데이터",
    columns: [
      { name: "model_name", type: "string", description: "차종 모델명 (Unique Key)" },
      { name: "fuel_type", type: "string", description: "연료 시스템 타입 (EV: 순수 전기차, HEV: 하이브리드, ICE: 내연기관)" },
      { name: "max_battery_capacity_kwh", type: "double", description: "고전압 배터리 팩 최대 설계 용량 (kWh)" },
      { name: "adas_level", type: "integer", description: "ADAS 자율주행 기술 지원 레벨 (0~3)" },
      { name: "has_lidar", type: "boolean", description: "고정밀 라이다(LIDAR) 센서 탑재 여부" },
      { name: "wheel_drive_type", type: "string", description: "구동 방식 (AWD, FWD, RWD)" },
      { name: "release_year", type: "integer", description: "해당 모델 사양 출시 연도" }
    ]
  },
  {
    id: "vehicle_adas_events",
    name: "vehicle_adas_events (ADAS 능동 자율주행 로그)",
    description: "SCC(크루즈), LFA(차로 유지) 등 자율주행 모듈 작동 및 운전자 제어권 개입 이벤트",
    columns: [
      { name: "event_id", type: "string", description: "이벤트 트래킹 고유 ID" },
      { name: "vehicle_id", type: "string", description: "차량 고유 차대 번호 (VIN)" },
      { name: "timestamp", type: "timestamp", description: "이벤트 감지 일시" },
      { name: "adas_feature", type: "string", description: "자율주행 ADAS 세부 기능명 (SCC, LFA, FCA, BCW)" },
      { name: "steering_torque_nm", type: "double", description: "조향 제어 토크 크기 (Nm)" },
      { name: "is_driver_intervened", type: "boolean", description: "운전자 수동 제어권 개입(오버라이드) 여부" },
      { name: "lidar_raw_points", type: "integer", description: "라이다 감지 포인트 수 (라이다 미탑재 차량 조회시 에러 발생)" },
      { name: "radar_distance_m", type: "double", description: "전방 레이더 계측 선행차와의 거리 (m)" }
    ]
  },
  {
    id: "vehicle_diagnostic_codes",
    name: "vehicle_diagnostic_codes (차량 자가진단 및 DTC 이력)",
    description: "제어기(ECU) 고장 상태 및 진단 표준 고장 코드(DTC) 감지 데이터",
    columns: [
      { name: "dtc_id", type: "string", description: "고장 진단 식별 고유 ID" },
      { name: "vehicle_id", type: "string", description: "차량 고유 차대 번호 (VIN)" },
      { name: "dtc_code", type: "string", description: "표준 진단 고장 코드 (DTC, 예: P0300, C1202)" },
      { name: "ecu_identifier", type: "string", description: "감지 제어기 모듈명 (EMS, TCU, ABS, BMS, ADAS)" },
      { name: "is_active", type: "boolean", description: "현재 결함 진행형 여부 (Active/History)" },
      { name: "mil_on", type: "boolean", description: "계기판 MIL(Engine Warning Light) 점등 요청 여부" },
      { name: "occurred_timestamp", type: "timestamp", description: "진단 고장 코드 최초 발생 시점" }
    ]
  }
];

// In-memory list for custom table schemas added by users
let customSchemas: TableSchema[] = [];

// Lazy-initialization helper for GoogleGenAI
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다. AI Studio 환경 설정의 'Secrets' 탭에서 올바른 API 키를 구성해 주세요.");
  }
  
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiClient;
}

// 1단계: 인프라/환경 에러 판단 사전 검증
function detectInfrastructureError(errorLog: string): string | null {
  const logLower = errorLog.toLowerCase();
  
  const infraPatterns = [
    { key: "outofmemoryerror", label: "OutOfMemoryError (메모리 부족)" },
    { key: "java heap space", label: "Java Heap Space Overflow (자바 힙 공간 부족)" },
    { key: "container killed", label: "Container Killed by YARN/K8s (컨테이너 강제 종료)" },
    { key: "connection refused", label: "Connection Refused (클러스터 노드 연결 거부)" },
    { key: "heartbeat missing", label: "Heartbeat Missing / Loss (하트비트 신호 유실)" },
    { key: "gc overhead limit exceeded", label: "GC Overhead Limit Exceeded (가비지 컬렉션 과부하)" },
    { key: "executor lost", label: "Executor Lost Failure (실행기 연결 끊김)" },
    { key: "killed by external signal", label: "Killed by OS / Resource Manager (외부 시그널 강제 종료)" }
  ];

  for (const pattern of infraPatterns) {
    if (logLower.includes(pattern.key)) {
      return pattern.label;
    }
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API 1: 전체 테이블 스키마 조회
  app.get("/api/schemas", (req, res) => {
    res.json([...PREDEFINED_SCHEMAS, ...customSchemas]);
  });

  // API 2: 커스텀 테이블 스키마 생성
  app.post("/api/schemas", (req, res) => {
    const { name, description, columns } = req.body;
    if (!name || !columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: "올바른 테이블 이름과 컬럼 배열 정보가 필요합니다." });
    }
    
    const newSchema: TableSchema = {
      id: "custom_" + Date.now(),
      name,
      description: description || "사용자 등록 테이블",
      columns
    };
    
    customSchemas.push(newSchema);
    res.status(201).json(newSchema);
  });

  // API 3: 에러 분석 및 수정 제안
  app.post("/api/analyze-error", async (req, res) => {
    const { errorLog, code, referenceTableId, customSchema } = req.body as AnalysisRequest;

    if (!errorLog) {
      return res.status(400).json({ error: "에러 로그(Stack Trace)는 필수 항목입니다." });
    }

    // 1단계: 인프라/환경 에러 여부 정적 진단
    const detectedInfra = detectInfrastructureError(errorLog);
    if (detectedInfra) {
      return res.json({
        isInfrastructureError: true,
        message: `[시스템 에러 감지 - ${detectedInfra}]\n해당 오류는 Spark 드라이버/익스큐터의 메모리 부족 또는 클러스터 리소스 유실로 판단됩니다.\nPySpark 코드 구문 교정만으로는 직접적인 해결이 불가하므로, 클러스터 스케일 업(리소스 조정)이나 인프라 시스템 담당자에게 문의해 주십시오.`,
        errorSummary: "클러스터 하드웨어 메모리 또는 인프라 리소스가 부족하여 작업이 강제 종료되었습니다.",
        correctedCode: code || "# 시스템 리소스 점검이 필요합니다.\n# 예: spark.executor.memory 설정 값 상향 및 가비지 컬렉션(GC) 튜닝 진행",
        explanation: `💡 **인프라 해결 가이드:**\n1. **드라이버/익스큐터 메모리 관리**: ` + "`spark.executor.memory`" + `와 ` + "`spark.driver.memory`" + ` 용량을 조정하십시오.\n2. **데이터 파티셔닝**: 대규모 데이터셋을 ` + "`repartition()`" + `하여 메모리 불균형(Data Skew)을 완화하십시오.\n3. **드라이버 컬렉트 금지**: 대용량 DataFrame에 ` + "`.collect()`" + `를 호출하는 대신, ` + "`.take()`" + ` 또는 데이터베이스 적재 방식을 권장합니다.`,
        schemaAnalysis: "인프라 차원의 메모리 에러이므로 제공 중인 테이블 스키마 정합성과는 무관합니다."
      } as AnalysisResponse);
    }

    // 2단계: 스키마 정보 취득
    let activeSchema: TableSchema | undefined;
    if (customSchema) {
      activeSchema = customSchema;
    } else if (referenceTableId) {
      activeSchema = [...PREDEFINED_SCHEMAS, ...customSchemas].find(s => s.id === referenceTableId);
    }

    // 스키마 설명 텍스트 포맷 구성
    let schemaContextStr = "참조 스키마 정보 없음 (기본 PySpark 문법 검증 진행)";
    if (activeSchema) {
      schemaContextStr = `테이블명: ${activeSchema.name} (${activeSchema.description || ""})\n컬럼 정의:\n` +
        activeSchema.columns.map(col => `- ${col.name} (타입: ${col.type}) - 설명: ${col.description || "없음"}`).join("\n");
    }

    // fallback 작동 검증 (API Key가 없거나 mock으로 돌려야 하는 경우 대응)
    try {
      const ai = getGenAI();

      const systemInstruction = `당신은 세계 최고 권위의 차량 커넥티드 데이터 및 PySpark 빅데이터 처리 관제 어시스턴트입니다.
이 시스템의 목적은 실제 에러를 리포팅한 '고객(차량 센서 분석 연구원/데이터 분석가)'에게 '고객 지원 관리자/시스템 관제 운영자(Admin)'가 정중하고 명확하게 이메일/티켓 답변을 작성해 발송하기 위한 지원 플랫폼입니다.

따라서 아래 규칙을 엄격히 적용하여 최적의 교정 조치와 고객 발송용 답변을 도출하십시오.

1. 'isInfrastructureError'는 무조건 false로 합니다. (사전 차단 필터 적용 완료)
2. 'errorSummary'는 관리자가 요약 정보를 빠르게 파악하도록 PySpark 에러의 핵심 원인을 명확하게 기술한 단 한 문장(한국어)이어야 합니다.
3. 'correctedCode'는 즉시 복사하여 주피터 노트북에 붙여넣어 실행할 수 있는 완벽한 교정본 PySpark 소스 코드 전체입니다. (마크다운 백틱 제외)
4. 'explanation'은 관리자가 에러 요인을 상세 검증하기 위한 상세 원인 및 조치 가이드 목록입니다. (Bullet point 형태)
5. 'schemaAnalysis'는 지정된 차량 도감 스키마와 제출된 코드 간의 부정합 요인을 지적합니다. 특별히 pure EV(전기차), 하이브리드, 내연기관 차종 간의 지원 센서/신호 불일치(예: 순수 전기차에 engine_rpm을 쿼리하거나, 라이다 미장착 차량에 lidar_raw_points를 조회하는 행위)에 관한 진단을 명쾌하게 다루어 주십시오.
6. 'customerReply'는 가장 핵심적인 결과물입니다. 고객(에러를 겪은 분석가)에게 바로 티켓/메일 본문으로 발송할 수 있도록 극진히 공손하고 전문적인 한국어 고객 지원 답변(티켓 양식)을 풍부하게 작성하십시오.
   답변의 구성은 다음과 같아야 합니다:
   - "안녕하세요, 차량 데이터 플랫폼 관제 지원팀입니다."로 시작하는 정중한 인사말.
   - 고객이 접수한 에러의 현상 요약 및 정확한 발생 원인 설명 (비기술 직군이 들어도 이해하기 쉽되 핵심은 명시).
   - "수정 제안 코드"를 포함하여 고객이 그대로 주피터 셀에 붙여넣어 해결할 수 있도록 코드 블록 형태로 깔끔히 기재.
   - 오타나 차종별 신호 부재 시 대체 가능한 컬럼 정보 및 우회(혹은 체크) 방안 설명.
   - 플랫폼 관제팀의 향후 조치 또는 추가 문의 유도 및 정중한 맺음말.

반드시 한국어로 정갈하고 세련되게 답변하십시오.`;

      const prompt = `[데이터 스키마 정보]
${schemaContextStr}

[사용자 PySpark 코드 스니펫]
${code || "# 코드가 제출되지 않았습니다. 에러 로그 분석에 집중해 주세요."}

[Jupyter Notebook 에러 로그 (Stack Trace)]
${errorLog}

위 컨텍스트를 종합해 테이블 스키마의 존재 여부와 형식을 철저히 점검하고 에러 분석 요약을 만드십시오.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isInfrastructureError: { type: Type.BOOLEAN },
              message: { type: Type.STRING },
              errorSummary: { type: Type.STRING },
              correctedCode: { type: Type.STRING },
              explanation: { type: Type.STRING },
              schemaAnalysis: { type: Type.STRING },
              customerReply: { type: Type.STRING }
            },
            required: ["isInfrastructureError", "errorSummary", "correctedCode", "explanation", "schemaAnalysis", "customerReply"]
          }
        }
      });

      const parsedResponse = JSON.parse(response.text || "{}") as AnalysisResponse;
      parsedResponse.isInfrastructureError = false; // Ensure true/false is correct
      return res.json(parsedResponse);

    } catch (err: any) {
      console.error("Gemini API Error / Pre-check Fallback:", err);

      // Gemini API Key가 유효하지 않을 때도 최고의 사용성을 위해 규칙 기반 로컬 분석 엔진(Fallback Diagnostic Engine) 작동!
      let errorSummary = "PySpark 차량 데이터 분석 도중 센서 스키마 불합치 에러가 감지되었습니다.";
      let explanation = "💡 **로컬 폴백 분석 엔진 가이드:**\n현재 AI 분석 서버 API 연동이 제한되거나 Secrets 키 설정이 지연되고 있어, 정적 키워드 기반 디버깅 가이드를 안내해 드립니다.\n\n";
      let correctedCode = code || "# 에러 원인을 검토해 아래와 같이 구조를 확인하십시오.";
      let schemaAnalysis = "스키마 정합성은 AI 분석 연동 후 정밀하게 교정 가능합니다.";

      const logLower = errorLog.toLowerCase();

      if (logLower.includes("analysisexception") || logLower.includes("unresolved_column")) {
        errorSummary = "데이터프레임 내 존재하지 않거나 선택된 차종(예: 순수 전기차)에 존재하지 않는 컬럼을 참조했습니다.";
        explanation += `- **원인**: 에러 로그에 \`AnalysisException\` 혹은 \`UNRESOLVED_COLUMN\` 패턴이 감지되었습니다. 차량 데이터셋 수집 사양 상 지원하지 않는 센서이거나 컬럼명에 오타가 존재하는지 확인이 필요합니다.\n- **해결안**: 선택하신 테이블 스키마 명세를 확인하여 사용 가능한 올바른 차량 데이터 컬럼만 사용하도록 필터링을 고치거나 예외 분기 처리를 해 주십시오.`;
        if (activeSchema) {
          schemaAnalysis = `선택된 테이블 '${activeSchema.name}'의 컬럼 목록: [${activeSchema.columns.map(c => c.name).join(", ")}] 입니다. 전기차 모델(IONIQ5, EV6) 분석 시에는 'engine_rpm' 대신 'ev_battery_soc'를, ADAS 이벤트 조회 시에는 'steering_torque_nm'을 바르게 선언했는지 대조해 보십시오.`;
        }
      } else if (logLower.includes("typeerror")) {
        errorSummary = "PySpark API 호출 과정에서 데이터 형식(Type) 오작동 또는 유효하지 않은 피연산자 연산이 발생했습니다.";
        explanation += `- **원인**: 차량 상태 계측 컬럼(속도, 조향각 등)에 문자열을 형변환 없이 합산하는 등의 부적절한 데이터 타입 충돌이 일어났습니다.\n- **해결안**: \`withColumn\`이나 필터링 과정에서 문자열을 숫자로 형변환(\`cast('double')\` 등)하고 계산하거나, Spark 내장 컬럼 전용 함수(\`col()\`)를 올바르게 감쌌는지 점검하십시오.`;
      } else if (logLower.includes("py4jjavaerror") || logLower.includes("illegalargumentexception")) {
        errorSummary = "JVM(Java Virtual Machine)과 PySpark 모듈 간 연동 API 혹은 부적합한 인자 전달 에러입니다.";
        explanation += `- **원인**: PySpark API 매개변수에 어긋나는 차량 식별자 객체나 잘못된 범위의 인자를 전달하였습니다.\n- **해결안**: 함수 인자의 자료형과 개수가 일치하는지 확인하십시오.`;
      } else {
        explanation += `- **추천 디버깅 단계**:\n1. 에러 로그 후반부의 Exception 종류를 확인해 주세요.\n2. 누락된 PySpark 라이브러리 임포트(예: \`from pyspark.sql.functions import col, agg\`)가 없는지 검토해 보세요.\n3. DataFrame 변수명이 제대로 매핑되어 체이닝되고 있는지 검토하십시오.`;
      }

      const customerReply = `안녕하세요, 차량 데이터 플랫폼 관제 지원팀입니다.

제출해 주신 주행 분석 PySpark 코드 실행 중 에러가 접수되어 신속히 분석한 조치 결과를 안내해 드립니다.

[오류 감지 및 발생 원인 분석]
현상: 데이터프레임 내 존재하지 않거나 선택된 특정 차종 사양(예: 순수 전기차)에 탑재되지 않은 센서 신호(컬럼)를 호출/연산하려다 'AnalysisException'이 유발되었습니다.
순수 전기차(IONIQ5, EV6) 분석 군에서 존재하지 않는 엔진 회전수('engine_rpm') 컬럼을 연산 시도했거나, ADAS 로그에서 'steering_torque_nm'의 오타가 없었는지 점검이 필요합니다.

[수정 제안 코드]
수정된 코드 예시안을 아래와 같이 공유해 드립니다. 주피터 노트북 셀의 해당 코드를 교체하여 실행해 보시기 바랍니다.
\`\`\`python
${correctedCode}
\`\`\`

[가이드 및 플랫폼 우회 제언]
각 차종별 연료 시스템 사양(EV, HEV, ICE) 정보에 맞춰 사전에 로딩할 컬럼의 존재 여부를 분기하시거나, 차종 스펙 정보 테이블('vehicle_spec_reference')과 Join을 통해 필터링한 후 센서 쿼리를 기동하는 안전한 분석 프로세스를 적극 권장합니다.

추가적인 의문 사항이나 데이터 오류 관련 기술 지원이 필요하시면 본 티켓 채널을 통해 언제든 관제 지원팀에 문의해 주십시오. 

신속한 차량 데이터 분석 환경 제공을 위해 항상 최선을 다하겠습니다. 감사합니다.

차량 데이터 플랫폼 관제 지원팀 배상`;

      return res.json({
        isInfrastructureError: false,
        message: err.message || "Gemini 분석 서비스 접근이 일시적으로 어렵습니다.",
        errorSummary,
        correctedCode,
        explanation,
        schemaAnalysis,
        customerReply
      } as AnalysisResponse);
    }
  });

  // API 4: 대화식 추가 질의응답 (Q&A Chatbot)
  app.post("/api/followup-chat", async (req, res) => {
    const { message, history, context } = req.body;
    if (!message) {
      return res.status(400).json({ error: "메시지 내용이 비어있습니다." });
    }

    try {
      const ai = getGenAI();

      const systemInstruction = `당신은 세계 최고 권위의 차량 커넥티드 데이터 및 PySpark 빅데이터 처리 관제 어시스턴트이자 챗봇 가이드입니다.
사용자가 입력창에 직접 PySpark 코드, 에러 로그(Stack Trace), 또는 질문을 전달하면 제공된 스키마 도감을 참조하여 전문적인 분석 및 해결책을 제시해 주십시오.

[차량 플랫폼 스키마 참조 도감]
1. 'vehicle_telemetry_raw' (실시간 주행 센서 계측 데이터)
   - vehicle_id (string): 차대 번호
   - model_name (string): 차종 모델명 (IONIQ5, EV6, GV70, Sorento_HEV, Grandeur_ICE)
   - timestamp (timestamp): 수집 타임스탬프
   - speed_kph (double): 주행 속도
   - engine_rpm (integer): 엔진 회전수 (내연기관/HEV 전용, 순수 EV인 IONIQ5/EV6에는 존재하지 않아 조회시 에러 유발)
   - ev_battery_soc (double): 고전압 배터리 잔량 (%, EV/HEV 전용, ICE인 Grandeur_ICE에는 존재하지 않아 에러 유발)
   - gear_position (string): 기어 단수 (P, R, N, D)
   - steering_angle_deg (double): 조향각
   - fuel_level_percent (double): 주유 연료 잔량 (%, ICE/HEV 전용, EV에는 존재하지 않아 에러 유발)

2. 'vehicle_spec_reference' (차종 세그먼트 사양 마스터)
   - model_name (string): 차종 모델명
   - fuel_type (string): 연료 타입 (EV: 순수전기, HEV: 하이브리드, ICE: 내연기관)
   - max_battery_capacity_kwh (double): 배터리 용량
   - adas_level (integer): ADAS 자율주행 레벨 (0~3)
   - has_lidar (boolean): 라이다 탑재 여부
   - wheel_drive_type (string): 구동 방식 (AWD, FWD, RWD)

3. 'vehicle_adas_events' (ADAS 능동 주행 로그)
   - event_id (string): 이벤트 ID
   - vehicle_id (string): 차대 번호
   - timestamp (timestamp): 이벤트 일시
   - adas_feature (string): 기능명 (SCC, LFA, FCA, BCW)
   - steering_torque_nm (double): 조향 제어 토크 (Nm)
   - is_driver_intervened (boolean): 운전자 개입 여부
   - lidar_raw_points (integer): 라이다 감지 포인트 수 (has_lidar가 False/라이다 미탑재 차량에 조회 시 오류 유발)
   - radar_distance_m (double): 전방 레이더 거리 (m)

4. 'vehicle_diagnostic_codes' (차량 고장 DTC 이력)
   - dtc_id (string): 식별 고유 ID
   - vehicle_id (string): 차대 번호
   - dtc_code (string): 표준 고장 코드 (예: P0300)
   - ecu_identifier (string): 제어기 모듈명 (EMS, TCU, ABS, BMS, ADAS)
   - is_active (boolean): 결함 활성 여부

--------------------------------------------------

[답변 작성 시 엄격한 규칙 규칙]:
1. 사용자의 입력 메시지가 PySpark '에러 로그(Stack Trace)', '동작 불능 코드', 혹은 '에러 원인을 분석해 달라는 요청'에 해당할 경우:
   - 1) 에러가 왜 났는지 핵심 원인을 PySpark 엔지니어 및 차량 센서 도메인 지식에 기반하여 친절하게 한국어로 먼저 설명하세요.
   - 2) 해결 가능한 '수정 제안 코드' 예시도 포함해 주세요 (마크다운 파이썬 코드블록 사용).
   - 3) 그리고 관리자가 이 에러를 보고한 '고객(차량 분석 연구원/사용자)'에게 티켓이나 메일 본문으로 즉시 복사하여 회신할 수 있는 극진히 정중한 [고객 전송용 답변 템플릿]을 반드시 '[CUSTOMER_REPLY]'와 '[/CUSTOMER_REPLY]' 태그로 감싸서 응답의 마지막 부분에 포함해 주십시오.
   - [CUSTOMER_REPLY] 안의 텍스트 구성:
     - "안녕하세요, 차량 데이터 플랫폼 관제 지원팀입니다."로 반드시 정중히 격조 높게 시작.
     - 사용자가 겪은 오류 요약 및 스키마 불합치 등의 정확한 발생 원인 설명.
     - 수정 제안 코드를 포함하여, 복사-붙여넣기로 해결 가능한 코드를 깔끔히 기재.
     - 우회하거나 체크해 볼 수 있는 팁 및 추가 기술 지원 안내.
     - "차량 데이터 플랫폼 관제 지원팀 배상"으로 반드시 정중히 마무리.

2. 사용자의 입력이 단순 질문이나 이론적 문의인 경우:
   - 정중하고 친절한 존댓말 한글로 일반적인 답변을 제공하되, 원한다면 언제든 에러 로그나 코드를 전달받아 이메일 답변 템플릿을 생성해 줄 수 있다고 안내하세요.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `질문내용: ${message}`,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      return res.json({ reply: response.text });
    } catch (err: any) {
      console.error("Follow-up chatbot error:", err);
      // Fallback rule-based answering
      const msgLower = message.toLowerCase();
      let fallbackReply = `[로컬 챗봇 엔진 답변] AI 분석 서비스가 현재 원활하지 않습니다.\n\n제출하신 질문: "${message}"\n\n`;
      if (msgLower.includes("대안") || msgLower.includes("함수") || msgLower.includes("다른 방법")) {
        fallbackReply += `💡 **PySpark 대안 함수 관련 팁:**\n- 컬럼 값 형변환 시에는 \`df.withColumn("col", col("col").cast("int"))\` 외에도 SQL 구문을 빌려 \`df.selectExpr("cast(col as int) as col")\`를 사용할 수 있습니다.\n- GroupBy 후 집계(aggregation) 시에는 \`df.groupBy().agg(sum("col1"), avg("col2"))\` 처럼 \`.agg()\` 메소드를 사용해 한 번에 여러 연산을 분산 수행하는 것을 가장 권장합니다.`;
      } else if (msgLower.includes("성능") || msgLower.includes("튜닝") || msgLower.includes("파티션") || msgLower.includes("속도")) {
        fallbackReply += `⚡ **성능 최적화(Performance Tuning) 핵심 가이드:**\n1. **Data Skew(데이터 치우침)**: 특정 파티션에 부하가 쏠리면 전체 속도가 저하됩니다. \`repartition("컬럼명")\` 또는 Salt 컬럼을 추가해 균등 분할하십시오.\n2. **Broadcast Join**: 한쪽 테이블이 작을 때(\`100MB 이하\`) \`broadcast(small_df)\`를 쓰면 Shuffle 네트워크 병목을 완벽히 제거합니다.\n3. **Caching**: 반복 재사용되는 중간 DataFrame은 \`.cache()\` 또는 \`.persist()\`를 사용해 메모리에 동결 저장하십시오.`;
      } else {
        fallbackReply += `🔧 **로컬 디버깅 추가 팁:**\n- PySpark 문법 에러의 90% 이상은 라이브러리 임포트 오작동(\`pyspark.sql.functions\` 패키지의 빌트인 함수 충돌) 또는 괄호 누락, 분산 컬럼 지칭 연산자 누락(\`col("name")\` 대신 순수 문자열 전달)에서 발생합니다.\n- 더 자세한 분석을 원하신다면 에러 로그를 확인한 후 상단의 '분석하기'를 눌러 분석을 재가동해 주시기 바랍니다.`;
      }
      return res.json({ reply: fallbackReply });
    }
  });

  // Serve static client assets in development and production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
