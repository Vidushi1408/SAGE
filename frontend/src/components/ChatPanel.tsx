"use client";

import React, { useState, useEffect, useRef } from "react";
import api, { ChatMessage, errorMessage } from "../lib/api";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import InsightChart from "./InsightChart";

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loadedHistory, setLoadedHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !loadedHistory) {
      api.getChatHistory()
        .then((res) => setMessages(res.history))
        .catch(() => {})
        .finally(() => setLoadedHistory(true));
    }
  }, [open, loadedHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);

    try {
      const reply = await api.sendChatMessage(text);
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      setError(errorMessage(err) || "Failed to get a response.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-[#9c6b3f] hover:bg-[#7f5631] text-white shadow-lg flex items-center justify-center transition-colors"
        title="Chat with SAGE"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-full max-w-sm h-[520px] max-h-[70vh] glass-card flex flex-col overflow-hidden shadow-xl">
          <div className="px-4 py-3 border-b border-[#efe8d8] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#9c6b3f]" />
            <h3 className="font-bold text-[#3d3335] text-sm">Chat with SAGE</h3>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <p className="text-xs text-[#8a7d78] text-center mt-6">
                Ask SAGE about your revenue, categories, growth trends, or flagged anomalies.
              </p>
            )}

            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-[#9c6b3f] text-white"
                      : "bg-[#efe8d8] border border-[#e6ddc9] text-[#4a3f41]"
                  }`}
                >
                  <p>{m.content}</p>
                  {m.chart && (
                    <div className="mt-2 -mx-1">
                      <InsightChart insight={m.chart} idx={idx} />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-[#efe8d8] border border-[#e6ddc9] rounded-xl px-3 py-2 text-xs text-[#8a7d78] animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 pb-2 text-[11px] text-rose-600">{error}</div>
          )}

          <form onSubmit={handleSend} className="p-3 border-t border-[#efe8d8] flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your data..."
              maxLength={2000}
              className="flex-1 px-3 py-2 rounded-lg bg-white border border-[#d9cdb8] text-[#3d3335] text-xs focus:outline-none focus:border-[#b9855a] transition-all"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="p-2 rounded-lg bg-[#9c6b3f] hover:bg-[#7f5631] disabled:bg-[#cca87c] text-white transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
