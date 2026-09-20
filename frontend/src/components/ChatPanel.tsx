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
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center transition-all"
        title="Chat with SAGE"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-full max-w-sm h-[520px] max-h-[70vh] glass-card flex flex-col overflow-hidden shadow-2xl">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="font-bold text-white text-sm">Chat with SAGE</h3>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <p className="text-xs text-gray-500 text-center mt-6">
                Ask SAGE about your revenue, categories, growth trends, or flagged anomalies.
              </p>
            )}

            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-indigo-500/20 border border-indigo-500/20 text-white"
                      : "bg-white/5 border border-white/10 text-gray-200"
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
                <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-400 animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 pb-2 text-[11px] text-rose-400">{error}</div>
          )}

          <form onSubmit={handleSend} className="p-3 border-t border-white/5 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your data..."
              maxLength={2000}
              className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="p-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white transition-all"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
