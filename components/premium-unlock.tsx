"use client";

import { useState } from "react";

export function PremiumUnlock({ configured, unlocked, onUnlock, language = "en" }: {
  configured: boolean;
  unlocked: boolean;
  onUnlock: (code: string) => void;
  language?: "en" | "zh";
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const zh = language === "zh";
  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || checking) return;
    setChecking(true); setError("");
    try {
      const response = await fetch("/api/premium-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: code.trim() }) });
      const result = await response.json() as { unlocked?: boolean; error?: string };
      if (!response.ok || !result.unlocked) throw new Error(result.error || "The access code could not be verified.");
      onUnlock(code.trim());
      setCode("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The access code could not be verified."); }
    finally { setChecking(false); }
  }
  return <div className="premium-unlock">
    {unlocked ? <p role="status">{zh ? "高级模型已解锁，直到此页面关闭。" : "Premium models unlocked for this page."}</p>
      : !configured ? <p>{zh ? "服务器尚未设置高级模型访问码。" : "Premium access is not configured on the server yet."}</p>
        : <form onSubmit={(event) => void verify(event)}><label htmlFor="premium-access-code">{zh ? "高级模型访问码" : "Premium access code"}</label><div><input id="premium-access-code" type="password" autoComplete="off" value={code} maxLength={256} onChange={(event) => setCode(event.target.value)} placeholder={zh ? "输入访问码" : "Enter access code"} /><button type="submit" disabled={!code.trim() || checking}>{checking ? (zh ? "验证中…" : "Checking…") : (zh ? "解锁" : "Unlock")}</button></div>{error && <p role="alert">{error}</p>}</form>}
  </div>;
}
