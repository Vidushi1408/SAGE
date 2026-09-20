"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import api, { ChatMessage, errorMessage } from "../../../lib/api";
import InsightChart from "../../../components/InsightChart";
import { PageHeader } from "../../../components/ui";
import { useWorkspace } from "../../../components/workspace/WorkspaceProvider";

const SUGGESTIONS = [
  "What's my total revenue?",
  "Which category sells the most?",
  "Are there any anomalies?",
  "How did last week go?",
  "Show me the monthly trend"
];

export default function AskPage() {
  const { hasData } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getChatHistory().then(res => setMessages(res.history)).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    setError("");
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    setSending(true);
    try {
      const reply = await api.sendChatMessage(question);
      setMessages(prev => [...prev, reply]);
    } catch (err) {
      setError(errorMessage(err) || "Failed to get a response.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Ask SAGE" subtitle="Ask questions about your numbers in plain English. Answers come straight from your analysed data." />

      <div className="glass-card flex flex-col h-[calc(100vh-15rem)] min-h-[26rem] overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400"><Sparkles className="w-6 h-6" /></div>
              <div>
                <h2 className="text-sm font-bold text-white">What would you like to know?</h2>
                <p className="text-xs text-gray-500 mt-1">{hasData ? "Try one of these to get started." : "Add your data first so SAGE has something to answer from."}</p>
              </div>
              {hasData && (
                <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)} className="px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-indigo-500/10 hover:border-indigo-500/30 text-xs text-gray-300 transition-all">{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-indigo-500/20 border border-indigo-500/20 text-white" : "bg-white/5 border border-white/10 text-gray-200"}`}>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.chart && <div className="mt-3 -mx-1"><InsightChart insight={m.chart} idx={idx} /></div>}
              </div>
            </div>
          ))}
          {sending && <div className="flex justify-start"><div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-gray-400 animate-pulse">Thinking...</div></div>}
        </div>

        {error && <div role="alert" className="px-6 pb-2 text-xs text-rose-400">{error}</div>}

        <form onSubmit={e => { e.preventDefault(); send(input); }} className="p-4 border-t border-white/5 flex items-center gap-3">
          <label htmlFor="ask-input" className="sr-only">Your question</label>
          <input
            id="ask-input" type="text" value={input} onChange={e => setInput(e.target.value)} maxLength={2000}
            placeholder="Ask about your revenue, categories, trends, anomalies..."
            className="flex-1 px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
          />
          <button type="submit" disabled={sending || !input.trim()} aria-label="Send" className="p-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white transition-all">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
