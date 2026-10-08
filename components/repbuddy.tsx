"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Plus, Search, Send } from "lucide-react";
import { loadWorkspace, saveWorkspace } from "@/lib/browser-store";
import type { Language } from "@/lib/ui-language";

export type RepBuddyContext = {
  study: string;
  sources: string[];
  guide: { title: string; explanation: string; source: string }[];
  measures: { id: string; label: string; kind: string; ai: string; published: string; difference: string; observations: string; note: string; source: string }[];
  limitations: string[];
  personas: number;
  trials: number;
};

type Provider = "qwen" | "deepseek";
type Message = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; updatedAt: number; messages: Message[] };

export function RepBuddy({ context, workspaceKey, language, models, connected }: {
  context: RepBuddyContext;
  workspaceKey: string;
  language: Language;
  models: Record<Provider, { thinking: string; nonThinking: string }>;
  connected: boolean;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState<Provider>("qwen");
  const [thinking, setThinking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const zh = language === "zh";
  const storageKey = `repbuddy:history:${workspaceKey}`;
  const active = conversations.find((item) => item.id === activeId);
  const filtered = useMemo(() => conversations.filter((item) => `${item.title} ${item.messages.map((message) => message.content).join(" ")}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt), [conversations, search]);
  const modelReady = connected && !!models[provider][thinking ? "thinking" : "nonThinking"];

  useEffect(() => {
    let cancelled = false;
    requestRef.current?.abort();
    queueMicrotask(() => { if (!cancelled) { setConversations([]); setActiveId(null); setLoadedKey(""); setError(""); setSending(false); } });
    void loadWorkspace<Conversation[]>(storageKey).then((saved) => {
      if (cancelled) return;
      const valid = Array.isArray(saved) ? saved.filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages)) : [];
      setConversations(valid);
      setActiveId(valid[0]?.id || null);
      setLoadedKey(storageKey);
    }).catch(() => { if (!cancelled) setLoadedKey(storageKey); });
    return () => { cancelled = true; requestRef.current?.abort(); };
  }, [storageKey]);
  useEffect(() => { if (loadedKey === storageKey) void saveWorkspace(storageKey, conversations).catch(() => {}); }, [conversations, loadedKey, storageKey]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [active?.messages.length, sending]);

  function newChat() { setActiveId(null); setQuery(""); setError(""); }
  async function send() {
    const question = query.trim();
    if (!question || sending || loadedKey !== storageKey) return;
    if (!modelReady) { setError(zh ? "所选模型尚未在服务器上配置。" : "The selected model is not configured on the server."); return; }
    const id = activeId || crypto.randomUUID();
    const prior = active?.messages || [];
    const messages: Message[] = [...prior, { role: "user", content: question }];
    const title = active?.title || question.slice(0, 70);
    setConversations((current) => [{ id, title, updatedAt: Date.now(), messages }, ...current.filter((item) => item.id !== id)]);
    setActiveId(id); setQuery(""); setError(""); setSending(true);
    const controller = new AbortController(); requestRef.current = controller;
    try {
      const response = await fetch("/api/repbuddy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, thinking, messages: messages.slice(-10), context, language }), signal: controller.signal });
      const data = await response.json() as { content?: string; error?: string };
      if (!response.ok || !data.content) throw new Error(data.error || "RepBuddy could not answer right now.");
      setConversations((current) => current.map((item) => item.id === id ? { ...item, updatedAt: Date.now(), messages: [...messages, { role: "assistant", content: data.content! }] } : item));
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "RepBuddy could not answer right now.");
    } finally { if (requestRef.current === controller) requestRef.current = null; setSending(false); }
  }

  return <section className="repbuddy" aria-label="RepBuddy">
    <header className="repbuddy-header"><div><h1>RepBuddy</h1><p>{zh ? "询问当前研究与实验结果" : "Explore your study and experiment results"}</p></div></header>
    <div className="repbuddy-layout">
      <aside className="repbuddy-history" aria-label={zh ? "聊天记录" : "Chat history"}>
        <div className="repbuddy-history-heading"><strong>{zh ? "聊天记录" : "Chat history"}</strong><button type="button" onClick={newChat}><Plus size={16} /> {zh ? "新对话" : "New chat"}</button></div>
        <label className="repbuddy-search"><Search size={16} /><input aria-label={zh ? "搜索对话" : "Search conversations"} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={zh ? "搜索对话" : "Search conversations"} /></label>
        <div className="repbuddy-history-list">{filtered.map((item) => <button type="button" key={item.id} className={item.id === activeId ? "active" : ""} onClick={() => { setActiveId(item.id); setError(""); }}><span>{item.title}</span><small>{new Date(item.updatedAt).toLocaleString(zh ? "zh-CN" : undefined)}</small></button>)}</div>
      </aside>
      <div className="repbuddy-main">
        <div className="repbuddy-controls"><div><label htmlFor="repbuddy-model">{zh ? "模型" : "Model"}</label><select id="repbuddy-model" value={provider} onChange={(event) => setProvider(event.target.value as Provider)}><option value="qwen">Qwen</option><option value="deepseek">DeepSeek</option></select></div><div><label htmlFor="repbuddy-mode">{zh ? "模式" : "Mode"}</label><select id="repbuddy-mode" value={thinking ? "thinking" : "plain"} onChange={(event) => setThinking(event.target.value === "thinking")}><option value="plain">{zh ? "普通" : "Standard"}</option><option value="thinking">{zh ? "思考" : "Thinking"}</option></select></div></div>
        <div className="repbuddy-messages" aria-live="polite">{active?.messages.map((message, index) => <article className={`repbuddy-message ${message.role}`} key={`${active.id}-${index}`}><span>{message.role === "assistant" ? "RepBuddy" : zh ? "你" : "You"}</span><div>{message.content}</div></article>)}{sending && <div className="repbuddy-pending"><LoaderCircle size={16} className="spin" /> {zh ? "正在整理回答…" : "Preparing an answer…"}</div>}<div ref={endRef} /></div>
        <form className="repbuddy-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><div className="repbuddy-input-row"><textarea aria-label={zh ? "向 RepBuddy 提问" : "Message RepBuddy"} placeholder="Insert your question here..." value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} /><button type="submit" disabled={!query.trim() || sending || loadedKey !== storageKey} aria-label={zh ? "发送消息" : "Send message"}><Send size={17} /><span>{zh ? "发送" : "Send"}</span></button></div>{error && <p role="alert" className="repbuddy-error">{error}</p>}</form>
      </div>
    </div>
  </section>;
}
