import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { TableSchema, AnalysisRequest, AnalysisResponse } from "./src/types.js";

// Load environment variables
dotenv.config();

// Pre-seeded standard schemas representing internal corporate tables
const PREDEFINED_SCHEMAS: TableSchema[] = [
  {
    id: "sales_transactions",
    name: "sales_transactions (매출 거래 내역)",
    description: "거래 일자별 고객 구매 상품, 수량, 단가 및 할인율 정보",
    columns: [
      { name: "transaction_id", type: "string", description: "고유 거래 고유 ID" },
      { name: "customer_id", type: "string", description: "고객 고유 번호" },
      { name: "product_id", type: "string", description: "상품 일련 번호" },
      { name: "quantity", type: "integer", description: "구매 수량" },
      { name: "unit_price", type: "double", description: "개당 상품 판매가" },
      { name: "discount", type: "double", description: "할인 적용율 (0.0 ~ 1.0)" },
      { name: "transaction_date", type: "timestamp", description: "거래 일시 및 시각" },
      { name: "payment_method", type: "string", description: "결제 수단 (예: CARD, CASH, PAY)" }
    ]
  },
  {
    id: "user_profiles",
    name: "user_profiles (사용자 프로필)",
    description: "가입 회원 정보, 나이, 국가 및 구독 모델 상태",
    columns: [
      { name: "user_id", type: "string", description: "사용자 고유 일련번호" },
      { name: "email", type: "string", description: "회원 이메일 주소" },
      { name: "signup_date", type: "date", description: "회원 가입 일자" },
      { name: "age", type: "integer", description: "회원 만 나이" },
      { name: "gender", type: "string", description: "성별 코드 (M, F, U)" },
      { name: "country", type: "string", description: "국적 정보 국가 코드" },
      { name: "subscription_type", type: "string", description: "구독 모델 등급 (FREE, BASIC, PREMIUM)" }
    ]
  },
  {
    id: "web_clickstream_logs",
    name: "web_clickstream_logs (웹 로그 데이터)",
    description: "사용자의 실시간 웹 페이지 방문 로그 및 이벤트 트래커",
    columns: [
      { name: "log_id", type: "string", description: "로그 개별 고유 ID" },
      { name: "session_id", type: "string", description: "세션 브라우저 ID" },
      { name: "user_id", type: "string", description: "로그인 사용자 고유 번호 (비로그인시 NULL)" },
      { name: "url_path", type: "string", description: "방문한 웹페이지 경로" },
      { name: "referrer_url", type: "string", description: "이전 유입 경로 URL" },
      { name: "ip_address", type: "string", description: "사용자 접속 IP 주소" },
      { name: "user_agent", type: "string", description: "사용 디바이스 및 브라우저 정보 문자열" },
      { name: "event_type", type: "string", description: "이벤트 속성 (click, view, hover, scroll)" },
      { name: "event_timestamp", type: "timestamp", description: "로그 발생 타임스탬프" }
    ]
  },
  {
    id: "inventory_stock",
    name: "inventory_stock (제품 재고 상태)",
    description: "창고별 상품 보유 및 유통 재고, 안전 재고율",
    columns: [
      { name: "product_id", type: "string", description: "상품 일련 번호" },
      { name: "warehouse_id", type: "string", description: "배송 거점 창고 식별 ID" },
      { name: "stock_quantity", type: "integer", description: "현재 창고 적재 실재고량" },
      { name: "safety_stock_level", type: "integer", description: "최소 유지 권장 안전 재고량" },
      { name: "last_updated_time", type: "timestamp", description: "재고 실사 기록 타임스탬프" }
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

      const systemInstruction = `당신은 세계 최고 권위의 PySpark 및 Big Data 엔지니어링 에러 슈팅 전문가입니다.
사용자가 제출한 'PySpark 코드'와 '실행 결과 에러 로그(Stack Trace)'를 분석하고, '지정된 데이터 스키마'를 대조하여 최적의 에러 분석 및 해결법을 도출하세요.

아래 규칙을 엄격하게 준수하여 결과를 정밀한 JSON 구조로 응답해야 합니다.
1. 'isInfrastructureError'는 무조건 false로 하세요. (이미 사전 필터에서 거름)
2. 'errorSummary'는 PySpark 에러의 핵심 원인을 친절하면서도 명확하게 요약한 '단 한 문장(한국어)'이어야 합니다.
3. 'correctedCode'는 주석과 교정된 구문이 들어간 완성도 높고 즉시 실행 가능한 PySpark 소스 코드 전체를 담아야 합니다. (마크다운 백틱 문자는 제외하고 순수 파이썬 문자열로 입력)
4. 'explanation'은 왜 에러가 났고 어떤 부분을 바꿨는지 구체적이고 일목요연한 교정 근거 목록을 마크다운 스타일(Bullet point)로 성실히 서술해야 합니다.
5. 'schemaAnalysis'는 지정된 테이블 스키마의 컬럼 정보와 실제 코드 간의 차이를 심층적으로 지적해야 합니다. (예: 컬럼명 오타 지적, 부적절한 데이터 타입 변환 시도 검증 등)
6. 반드시 한국어로 답변해 주세요.`;

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
              schemaAnalysis: { type: Type.STRING }
            },
            required: ["isInfrastructureError", "errorSummary", "correctedCode", "explanation", "schemaAnalysis"]
          }
        }
      });

      const parsedResponse = JSON.parse(response.text || "{}") as AnalysisResponse;
      parsedResponse.isInfrastructureError = false; // Ensure true/false is correct
      return res.json(parsedResponse);

    } catch (err: any) {
      console.error("Gemini API Error / Pre-check Fallback:", err);

      // Gemini API Key가 유효하지 않을 때도 최고의 사용성을 위해 규칙 기반 로컬 분석 엔진(Fallback Diagnostic Engine) 작동!
      let errorSummary = "PySpark 코드 실행 중 문법 또는 분석 에러가 발생했습니다.";
      let explanation = "💡 **로컬 폴백 분석 엔진 가이드:**\n현재 AI 분석 서버 API 연동이 제한되거나 Secrets 키 설정이 지연되고 있어, 정적 키워드 기반 디버깅 가이드를 안내해 드립니다.\n\n";
      let correctedCode = code || "# 에러 원인을 검토해 아래와 같이 구조를 확인하십시오.";
      let schemaAnalysis = "스키마 정합성은 AI 분석 연동 후 정밀하게 교정 가능합니다.";

      const logLower = errorLog.toLowerCase();
      const codeLower = (code || "").toLowerCase();

      if (logLower.includes("analysisexception") || logLower.includes("unresolved_column")) {
        errorSummary = "데이터프레임 내 존재하지 않는 컬럼을 참조하여 에러가 발생했습니다.";
        explanation += `- **원인**: 에러 로그에 ` + "`AnalysisException`" + ` 혹은 ` + "`UNRESOLVED_COLUMN`" + ` 패턴이 감지되었습니다. 코드에 작성한 컬럼 이름이 선택하신 테이블의 실제 스키마 명세와 일치하는지 확인해 보십시오.\n- **해결안**: 사용 중인 데이터셋의 스키마 명세에서 올바른 컬럼 이름 목록을 확인하고, 오탈자가 없는지 대조하여 수정해 주세요.`;
        if (activeSchema) {
          schemaAnalysis = `선택된 테이블 '${activeSchema.name}'의 컬럼 목록: [${activeSchema.columns.map(c => c.name).join(", ")}] 입니다. 코드 속 컬럼과 해당 목록을 직접 비교하여 일치시켜 보십시오.`;
        }
      } else if (logLower.includes("typeerror")) {
        errorSummary = "PySpark API 호출 과정에서 데이터 형식(Type) 오작동 또는 유효하지 않은 피연산자 연산이 발생했습니다.";
        explanation += `- **원인**: 컬럼 데이터 타입에 부합하지 않는 연산자를 사용했거나, 문자열 자료형과 수치형(Integer/Double)을 결합하려 했을 수 있습니다.\n- **해결안**: ` + "`withColumn`" + `이나 필터링 과정에서 문자열을 숫자로 형변환(` + "`cast('int')`" + ` 등)하고 계산하거나, Spark 내장 컬럼 전용 함수(` + "`col()`" + `)를 올바르게 감쌌는지 점검하십시오.`;
      } else if (logLower.includes("py4jjavaerror") || logLower.includes("illegalargumentexception")) {
        errorSummary = "JVM(Java Virtual Machine)과 PySpark 모듈 간 연동 API 혹은 부적합한 인자 전달 에러입니다.";
        explanation += `- **원인**: PySpark API 매개변수에 어긋나는 객체나 원시 데이터를 전달하였을 가능성이 큽니다.\n- **해결안**: 예: 정수가 필요한 곳에 문자열을 넣었거나, PySpark 내장 function을 호출할 때 괄호 짝이 누락되었는지 문법을 재차 검증해 보십시오.`;
      } else {
        explanation += `- **추천 디버깅 단계**:\n1. 에러 로그 후반부의 Exception 종류를 확인해 주세요.\n2. 누락된 PySpark 라이브러리 임포트(예: ` + "`from pyspark.sql.functions import *`" + `)가 없는지 검토해 보세요.\n3. DataFrame 변수명이 제대로 매핑되어 체이닝되고 있는지 검토하십시오.`;
      }

      return res.json({
        isInfrastructureError: false,
        message: err.message || "Gemini 분석 서비스 접근이 일시적으로 어렵습니다.",
        errorSummary,
        correctedCode,
        explanation,
        schemaAnalysis
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

      const systemInstruction = `당신은 최고 수준의 PySpark 엔지니어링 튜터 및 에러 해소 가이드입니다.
이전 단계에서 사용자가 겪은 오류 상황과 분석 명세를 인지한 상태에서, 사용자가 추가로 문의한 내용에 매우 전문적이고 명쾌하게 한국어로 답변하세요.

[이전 분석 명세 및 디버깅 결과 컨텍스트]
- 에러 요약: ${context?.errorSummary || "N/A"}
- 원래 코드: 
${context?.originalCode || "N/A"}
- AI 추천 교정 코드: 
${context?.correctedCode || "N/A"}
- 교정 설명글: 
${context?.explanation || "N/A"}
- 지정했던 테이블: ${context?.referenceTableId || "지정 안 됨"}

답변 요건:
1. 사용자가 원 코드의 성능, 대안 함수, 타입 변환 기법, Spark 동작 원리(Lazy Evaluation, Partitioning, Shuffle 등)를 질문할 것입니다. 이에 맞춰 깊이있고 신뢰성 높은 엔지니어링 관점에서 답변하세요.
2. 예제나 교정 코드 스니펫이 필요하면 마크다운 (\`\`\`python ... \`\`\`) 형식을 자유롭게 사용하여 전달하십시오.
3. 정중하고 친절한 존댓말 한글로 답변하세요.`;

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
