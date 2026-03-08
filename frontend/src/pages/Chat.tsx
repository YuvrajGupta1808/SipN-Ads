import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Home,
  Image,
  Link2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Send,
  Trash2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type Message = { role: "user" | "assistant"; content: string };
type ChatSession = { id: string; title: string; messages: Message[] };

const Chat = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([
    {
      id: "1",
      title: "Summer Campaign Ideas",
      messages: [
        {
          role: "assistant",
          content:
            "Welcome to Sip N'ads! 🎬\n\nI can help you create scroll-stopping video ad concepts for TikTok, Instagram & YouTube.\n\nTell me about your brand, product, or campaign idea to get started.",
        },
      ],
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState("1");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId)!;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession.messages, isLoading]);

  const createNewChat = () => {
    const id = Date.now().toString();
    const newSession: ChatSession = {
      id,
      title: "New Chat",
      messages: [
        {
          role: "assistant",
          content:
            "Welcome! Tell me about your brand, product, or campaign idea and I'll generate ad concepts for TikTok, Instagram & YouTube.",
        },
      ],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(id);
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      if (remaining.length > 0) setActiveSessionId(remaining[0].id);
      else createNewChat();
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { role: "user", content: input.trim() };

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              title: s.title === "New Chat" ? input.trim().slice(0, 30) : s.title,
              messages: [...s.messages, userMsg],
            }
          : s
      )
    );
    setInput("");
    setIsLoading(true);

    setTimeout(() => {
      const responses = [
        "Great idea! Here's a concept:\n\n**15s TikTok/Reel Format:**\n1. Close-up pour shot of the drink\n2. Transition to lifestyle scenes with upbeat music\n3. End with your logo and CTA\n\nThis format typically drives 2-3x more engagement than static posts.",
        "For YouTube, I'd suggest a **30s format:**\n\n- **0-3s:** Hook with a bold statement\n- **3-15s:** Show the product in action\n- **15-25s:** Include social proof\n- **25-30s:** Strong CTA\n\nWant me to refine any part of this?",
        "**Instagram Carousel Concept:**\n\n📌 Slide 1 — Bold headline\n📸 Slide 2 — Product beauty shot\n✅ Slide 3 — Key benefits\n💬 Slide 4 — Customer testimonial\n🔗 Slide 5 — CTA with link\n\nShall I generate visuals for any of these slides?",
      ];
      const aiMsg: Message = {
        role: "assistant",
        content: responses[Math.floor(Math.random() * responses.length)],
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? { ...s, messages: [...s.messages, aiMsg] }
            : s
        )
      );
      setIsLoading(false);
    }, 1200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const SidebarContent = () => (
    <div className="h-full flex flex-col" style={{ background: "#fefefe" }}>
      {/* Sidebar header */}
      <div className="px-4 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 cursor-pointer group" onClick={() => navigate("/")}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}
          >
            <Link2 className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-[14px] font-bold leading-tight group-hover:opacity-70 transition-opacity" style={{ color: "#1a1a1a" }}>
              Sip N'ads
            </span>
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="p-1.5 rounded-lg transition-all hover:bg-[#f5f3f0] active:scale-95"
          style={{ color: "#ccc" }}
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* New chat button */}
      <div className="px-3 pt-2 pb-1 shrink-0">
        <button
          onClick={createNewChat}
          className="w-full flex items-center justify-center gap-2 font-body font-semibold text-[13px] py-2.5 px-4 rounded-xl transition-all hover:shadow-md active:scale-[0.98]"
          style={{ background: "#1a1a1a", color: "#fff" }}
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Label */}
      <div className="px-5 pt-4 pb-1.5">
        <span className="text-[10px] font-body font-semibold uppercase tracking-[0.12em]" style={{ color: "#ccc" }}>
          Recent
        </span>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-0.5">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="group flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all hover:bg-[#f8f5f2]"
            style={{
              background: session.id === activeSessionId ? "#f8f5f2" : "transparent",
              color: session.id === activeSessionId ? "#1a1a1a" : "#999",
            }}
            onClick={() => setActiveSessionId(session.id)}
          >
            <MessageSquare
              className="w-3.5 h-3.5 shrink-0"
              style={{
                color: session.id === activeSessionId ? "#f97316" : "currentColor",
                opacity: session.id === activeSessionId ? 1 : 0.5,
              }}
            />
            <span className="text-[13px] font-body truncate flex-1">{session.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteSession(session.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-all hover:text-red-400 active:scale-90"
              style={{ color: "#ccc" }}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div className="px-3 py-2.5 shrink-0">
        <button
          onClick={() => navigate("/")}
          className="w-full flex items-center gap-2 font-body text-[13px] py-2 px-3 rounded-xl transition-all hover:bg-[#f8f5f2] active:scale-[0.98]"
          style={{ color: "#aaa" }}
        >
          <Home className="w-3.5 h-3.5" />
          Home
        </button>
      </div>
    </div>
  );

  const ChatArea = () => (
    <div className="h-full flex flex-col min-w-0" style={{ background: "#faf9f7" }}>
      {/* Header */}
      <header className="h-[52px] flex items-center px-5 gap-3 shrink-0" style={{ background: "#fefefe" }}>
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg transition-all hover:bg-[#f5f3f0] active:scale-95 mr-1"
            style={{ color: "#bbb" }}
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <h2 className="font-body text-[13px] font-semibold truncate" style={{ color: "#1a1a1a" }}>
            {activeSession.title}
          </h2>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-[min(1120px,96vw)] mx-auto px-4 sm:px-6 py-8 space-y-5">
          {activeSession.messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
            >
              {msg.role === "assistant" && (
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 mr-2.5 shadow-sm"
                  style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}
                >
                  <Link2 className="w-3 h-3 text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 font-body text-[13.5px] leading-[1.75] whitespace-pre-line ${
                  msg.role === "user"
                    ? "rounded-[18px] rounded-br-md"
                    : "rounded-[18px] rounded-bl-md"
                }`}
                style={
                  msg.role === "user"
                    ? {
                        background: "linear-gradient(135deg, #fb923c, #ea580c)",
                        color: "#fff",
                        boxShadow: "0 2px 8px rgba(249,115,22,0.2)",
                      }
                    : {
                        background: "#fff",
                        color: "#3a3a3a",
                        border: "1px solid #f0ece8",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                      }
                }
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start animate-fade-in">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 mr-2.5 shadow-sm"
                style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}
              >
                <Link2 className="w-3 h-3 text-white" />
              </div>
              <div
                className="rounded-[18px] rounded-bl-md px-5 py-4"
                style={{ background: "#fff", border: "1px solid #f0ece8" }}
              >
                <div className="flex gap-1.5 items-center">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: "#f97316", opacity: 0.6, animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="px-4 sm:px-6 pb-4 pt-2 shrink-0">
        <div className="w-full max-w-[min(1120px,96vw)] mx-auto">
          <div
            className="flex items-end gap-1.5 rounded-2xl p-2"
            style={{
              background: "#fff",
              border: "1px solid #eee",
              boxShadow: "0 1px 12px rgba(0,0,0,0.04)",
            }}
          >
            <div className="flex gap-0 pb-0.5">
              <button className="p-2 rounded-lg transition-all hover:bg-[#fff7ed] active:scale-95" style={{ color: "#d4d4d4" }} title="Attach image">
                <Image className="w-[17px] h-[17px]" />
              </button>
              <button className="p-2 rounded-lg transition-all hover:bg-[#fff7ed] active:scale-95" style={{ color: "#d4d4d4" }} title="Attach file">
                <Paperclip className="w-[17px] h-[17px]" />
              </button>
            </div>

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your brand or ad idea..."
              rows={1}
              className="flex-1 resize-none bg-transparent font-body text-[13.5px] focus:outline-none py-2 px-1.5 max-h-32"
              style={{ color: "#222", caretColor: "#f97316" }}
            />

            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-xl transition-all disabled:opacity-25 active:scale-95 mb-0.5"
              style={{
                background: input.trim()
                  ? "linear-gradient(135deg, #fb923c, #ea580c)"
                  : "#eee",
                color: "#fff",
                boxShadow: input.trim() ? "0 2px 8px rgba(249,115,22,0.25)" : "none",
              }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center font-body text-[10px] mt-2" style={{ color: "#d4d4d4" }}>
            Sip N'ads AI • Ad concept generation
          </p>
        </div>
      </div>
    </div>
  );

  if (!sidebarOpen) {
    return (
      <div className="h-screen" style={{ background: "#faf9f7" }}>
        <ChatArea />
      </div>
    );
  }

  return (
    <div className="h-screen">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
          <SidebarContent />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={80}>
          <ChatArea />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default Chat;
