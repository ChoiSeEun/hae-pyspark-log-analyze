import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Bot, User, RefreshCw, AlertCircle } from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
}

interface ChatHelperProps {
  contextData: {
    errorSummary?: string;
    originalCode?: string;
    correctedCode?: string;
    explanation?: string;
    referenceTableId?: string;
  };
}

export default function ChatHelper({ contextData }: ChatHelperProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      sender: "bot",
      text: "분석된 PySpark 결과나 코드에 대해 추가로 궁금한 점이 있으신가요? \n예: '이 방법 말고 다른 Spark 함수는 없나요?', '데이터 형변환을 안전하게 처리하는 방법은?', '성능을 높이려면 어떻게 파티션을 나눌까요?' 등 편하게 질문해 주시면 성심껏 답변해 드리겠습니다! 😊"
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const userMessageText = inputText;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: userMessageText
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsSending(true);
    setErrorText("");

    try {
      const response = await fetch("/api/followup-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessageText,
          history: messages.map(m => ({ role: m.sender === "user" ? "user" : "model", text: m.text })),
          context: contextData
        })
      });

      if (!response.ok) {
        throw new Error("답변을 생성하는 도중 오류가 발생했습니다.");
      }

      const data = await response.json();
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: data.reply
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setErrorText(err.message || "서버와 연결할 수 없습니다.");
    } finally {
      setIsSending(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: "init",
        sender: "bot",
        text: "채팅 내용이 초기화되었습니다. 추가 분석 중인 PySpark 코드나 에러에 대해 자유롭게 또 질문해 주세요!"
      }
    ]);
    setErrorText("");
  };

  return (
    <div className="bg-[#161922] border border-[#2D313E] rounded-lg overflow-hidden flex flex-col h-[350px] shadow-sm">
      {/* Chat Header */}
      <div className="bg-[#11141D] border-b border-[#2D313E] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <MessageSquare className="h-4 w-4 text-blue-400" />
          <span className="font-display font-bold text-xs text-white">
            🤖 AI 대화식 추가 질의응답 (Troubleshooting Chat)
          </span>
        </div>
        <button
          type="button"
          onClick={handleClearChat}
          className="text-[9px] text-slate-300 hover:text-white transition flex items-center space-x-1 cursor-pointer bg-[#1A1D27] px-2.5 py-1 rounded border border-[#2D313E] font-bold uppercase"
        >
          <RefreshCw className="h-2.5 w-2.5" />
          <span>대화 청소</span>
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#11141D]">
        {messages.map((msg) => {
          const isBot = msg.sender === "bot";
          return (
            <div
              key={msg.id}
              className={`flex items-start space-x-2.5 ${isBot ? "" : "flex-row-reverse space-x-reverse"}`}
            >
              <div
                className={`w-7 h-7 rounded flex items-center justify-center text-xs shrink-0 border ${
                  isBot ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-[#1A1D27] text-white border-[#2D313E]"
                }`}
              >
                {isBot ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>

              <div
                className={`max-w-[85%] px-3 py-2 rounded text-xs leading-relaxed whitespace-pre-wrap select-text border ${
                  isBot
                    ? "bg-[#1A1D27] text-slate-200 border-[#2D313E] rounded-tl-none"
                    : "bg-blue-600 text-white border-blue-600 rounded-tr-none shadow-sm shadow-blue-500/10"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-start space-x-2.5">
            <div className="w-7 h-7 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs shrink-0 border border-blue-500/20">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-[#1A1D27] text-slate-400 border border-[#2D313E] px-3 py-2 rounded rounded-tl-none text-xs flex items-center space-x-2 shadow-xs">
              <span className="flex space-x-1">
                <span className="h-1 w-1 bg-slate-500 rounded-full animate-bounce"></span>
                <span className="h-1 w-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="h-1 w-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </span>
              <span>답변을 작성하고 있어요...</span>
            </div>
          </div>
        )}

        {errorText && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded flex items-center space-x-2 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{errorText}</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Form Input */}
      <form onSubmit={handleSendMessage} className="p-2.5 border-t border-[#2D313E] bg-[#161922] flex items-center space-x-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="질문할 내용을 입력해 주세요 (예: 이 방법의 성능 한계는?)"
          className="flex-1 text-xs border border-[#2D313E] bg-[#1A1D27] text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded cursor-pointer border border-blue-600 disabled:bg-[#1A1D27] disabled:border-[#2D313E] disabled:text-slate-600 transition"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

