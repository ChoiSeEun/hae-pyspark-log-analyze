import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Bot, User, RefreshCw, AlertCircle, Copy, Check, Mail } from "lucide-react";

export interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
}

interface ChatHelperProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  contextData: {
    errorSummary?: string;
    originalCode?: string;
    correctedCode?: string;
    explanation?: string;
    referenceTableId?: string;
  };
}

export default function ChatHelper({ messages, setMessages, contextData }: ChatHelperProps) {
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
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
        text: "차량 커넥티드 데이터 플랫폼 관제 지원 챗봇입니다! 🚗💨\n\n왼쪽 입력란에 에러 로그와 코드를 입력해 분석을 가동하시거나, 이 채팅창에 에러 로그를 직접 붙여넣고 해결책을 물어보세요.\n\n에러가 발생하면 원인을 즉시 파악하고, 고객에게 곧장 전송할 수 있는 **[공손한 티켓 답변 템플릿]**을 정성껏 마련해 드립니다!"
      }
    ]);
    setErrorText("");
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderMessageText = (msg: ChatMessage) => {
    const text = msg.text;
    const isBot = msg.sender === "bot";

    if (!isBot) {
      return <div className="text-white whitespace-pre-wrap">{text}</div>;
    }

    // Try parsing CUSTOMER_REPLY tag
    const replyRegex = /\[CUSTOMER_REPLY\]([\s\S]*?)\[\/CUSTOMER_REPLY\]/;
    const match = text.match(replyRegex);

    if (match) {
      const customerReply = match[1].trim();
      const cleanBody = text.replace(replyRegex, "").trim();

      return (
        <div className="space-y-3">
          {cleanBody && <div className="text-slate-200 whitespace-pre-wrap">{cleanBody}</div>}
          
          {/* Enhanced Customer Reply Widget */}
          <div className="bg-[#11141D] border-2 border-blue-500/40 rounded-lg p-3.5 mt-2 shadow-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
            <div className="flex items-center justify-between border-b border-[#2D313E] pb-2 mb-2.5">
              <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider flex items-center space-x-1.5">
                <Mail className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span>💌 고객 즉시 발송용 답변 템플릿</span>
              </span>
              <button
                type="button"
                onClick={() => handleCopy(customerReply, msg.id)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-2.5 py-1 rounded transition flex items-center space-x-1 cursor-pointer shrink-0"
              >
                {copiedId === msg.id ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-300" />
                    <span className="text-emerald-300">복사 완료</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>전체 복사</span>
                  </>
                )}
              </button>
            </div>
            <div className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap font-sans bg-[#161922] p-3 rounded border border-[#2D313E] max-h-[180px] overflow-y-auto select-text">
              {customerReply}
            </div>
            <div className="text-[9px] text-slate-500 mt-2 text-right">
              * 이 내용을 복사하여 티켓(메일) 답변에 그대로 활용해 주세요.
            </div>
          </div>
        </div>
      );
    }

    return <div className="text-slate-200 whitespace-pre-wrap">{text}</div>;
  };

  return (
    <div className="bg-[#161922] border border-[#2D313E] rounded-lg overflow-hidden flex flex-col h-[520px] shadow-lg relative">
      {/* Chat Header */}
      <div className="bg-[#11141D] border-b border-[#2D313E] px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <MessageSquare className="h-4.5 w-4.5 text-blue-400" />
          <span className="font-display font-bold text-xs text-white uppercase tracking-wider">
            차량 플랫폼 관제 지원 실시간 챗봇
          </span>
        </div>
        <button
          type="button"
          onClick={handleClearChat}
          className="text-[9px] text-slate-400 hover:text-white transition flex items-center space-x-1 cursor-pointer bg-[#1A1D27] px-2.5 py-1.5 rounded border border-[#2D313E] font-bold uppercase"
        >
          <RefreshCw className="h-2.5 w-2.5" />
          <span>대화 초기화</span>
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#11141D] scrollbar-thin">
        {messages.map((msg) => {
          const isBot = msg.sender === "bot";
          return (
            <div
              key={msg.id}
              className={`flex items-start space-x-2.5 ${isBot ? "" : "flex-row-reverse space-x-reverse"}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0 border ${
                  isBot ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                }`}
              >
                {isBot ? <Bot className="h-4.5 w-4.5" /> : <User className="h-4.5 w-4.5" />}
              </div>

              <div
                className={`max-w-[85%] px-3.5 py-2.5 rounded-lg text-xs leading-relaxed border shadow-sm ${
                  isBot
                    ? "bg-[#161922] text-slate-200 border-[#2D313E] rounded-tl-none"
                    : "bg-blue-600 text-white border-blue-500 rounded-tr-none shadow-blue-500/10"
                }`}
              >
                {renderMessageText(msg)}
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-start space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs shrink-0 border border-blue-500/20 animate-pulse">
              <Bot className="h-4.5 w-4.5" />
            </div>
            <div className="bg-[#161922] text-slate-400 border border-[#2D313E] px-3.5 py-2.5 rounded-lg rounded-tl-none text-xs flex items-center space-x-2 shadow-xs">
              <span className="flex space-x-1">
                <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </span>
              <span>답변 및 전송 답변 템플릿을 생성 중입니다...</span>
            </div>
          </div>
        )}

        {errorText && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center space-x-2 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{errorText}</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Form Input */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-[#2D313E] bg-[#161922] flex items-center space-x-2 shrink-0">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="에러 로그를 직접 붙여넣거나 질문을 입력해 보세요."
          className="flex-1 text-xs border border-[#2D313E] bg-[#1A1D27] text-white rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-blue-500 transition placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-lg cursor-pointer border border-blue-600 disabled:bg-[#1A1D27] disabled:border-[#2D313E] disabled:text-slate-600 transition shrink-0"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
