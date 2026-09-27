"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowDown, Check, FileText, LoaderCircle, Paperclip, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Provider = "qwen" | "deepseek";
type Source = { citation: string; title?: string; doi?: string; abstract?: string; text?: string; fileName?: string; note?: string };
type Output = { stage: string; content: string; model: string; thinking: boolean; at: string };
const stages = [
  { id: "coordinate", name: "Coordinate", description: "Set the replication target, handoffs, and decisions.", deliverable: "Research brief & task map" },
  { id: "source-map", name: "Map sources", description: "Find the article, appendix, registration, data, and code.", deliverable: "Evidence ledger" },
  { id: "protocol", name: "Write protocol", description: "Reconstruct assignment, participant flow, outcomes, and analysis.", deliverable: "Protocol & analysis plan" },
  { id: "fidelity", name: "Check fidelity", description: "Compare the proposed setting with the original mechanism.", deliverable: "Fidelity assessment" },
  { id: "build", name: "Build instrument", description: "Specify screens, randomization, payoffs, and validation.", deliverable: "Instrument specification" },
  { id: "reproduce", name: "Reproduce", description: "Audit reported results using available data and code.", deliverable: "Reproduction report" },
  { id: "field-data", name: "Audit field data", description: "Check treatment delivery, missingness, and integrity.", deliverable: "Field audit checklist" },
  { id: "independent-review", name: "Independent review", description: "Challenge the analysis against the locked evidence.", deliverable: "Independent review" },
];
const errText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";

export default function Home() {
  const [citation, setCitation] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [provider, setProvider] = useState<Provider>("qwen");
  const [model, setModel] = useState("qwen3.7-plus");
  const [thinking, setThinking] = useState(true);
  const [qwenRegion, setQwenRegion] = useState("singapore");
  const [configured, setConfigured] = useState({ qwen: false, deepseek: false });
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [busyStage, setBusyStage] = useState("");
  const [loadingSource, setLoadingSource] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const showMessage = (text: string, error = false) => { setMessage(text); setIsError(error); };
  useEffect(() => { fetch("/api/config").then((response) => response.json() as Promise<{ qwen?: boolean; deepseek?: boolean }>).then((data) => setConfigured({ qwen: !!data.qwen, deepseek: !!data.deepseek })).catch(() => {}); }, []);
  function changeProvider(value: Provider) { setProvider(value); setModel(value === "qwen" ? "qwen3.7-plus" : "deepseek-v4-flash"); }

  async function resolvePaper() {
    if (!citation.trim()) return showMessage("Enter a paper title, citation, or DOI.", true);
    setLoadingSource(true); showMessage("");
    try {
      const response = await fetch("/api/source", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ citation: citation.trim() }) });
      const data = await response.json() as { source: Source; error?: string };
      if (!response.ok) throw new Error(data.error || "Paper lookup failed.");
      setSource(data.source); setOutputs([]); showMessage(data.source.note || "Paper details found. Add full text for a stronger reconstruction.");
    } catch (error) { showMessage(errText(error), true); } finally { setLoadingSource(false); }
  }
  async function loadFile(file?: File) {
    if (!file) return;
    setLoadingSource(true); showMessage("");
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Choose a file smaller than 20 MB.");
      let text = "";
      if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const parts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i); const content = await page.getTextContent();
          parts.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
        }
        text = parts.join("\n\n");
      } else if (/\.(txt|md)$/i.test(file.name) || file.type.startsWith("text/")) text = await file.text();
      else throw new Error("Upload a PDF, TXT, or Markdown file.");
      if (text.trim().length < 200) throw new Error("Could not extract enough readable text. Try a text-based PDF or TXT file.");
      const clipped = text.slice(0, 90000);
      setSource((current) => ({ citation: current?.citation || file.name, title: current?.title || file.name.replace(/\.[^.]+$/, ""), doi: current?.doi, abstract: current?.abstract, text: clipped, fileName: file.name, note: text.length > clipped.length ? "The paper is longer than the 90,000-character input limit. Check details against the full file." : "Full text extracted." }));
      setOutputs([]); showMessage(text.length > clipped.length ? "File loaded; the first 90,000 characters will be used." : "File loaded and ready.");
    } catch (error) { showMessage(errText(error), true); } finally { setLoadingSource(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function callStage(index: number, prior: Output[]): Promise<Output[]> {
    const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: stages[index].id, source, previous: prior, provider, model, thinking, qwenRegion }) });
    const data = await response.json() as { content: string; model: string; error?: string };
    if (!response.ok) throw new Error(data.error || "Model call failed.");
    const updated = [...prior.filter((item) => item.stage !== stages[index].id), { stage: stages[index].id, content: data.content, model: data.model, thinking, at: new Date().toISOString() }];
    setOutputs(updated);
    return updated;
  }
  async function run(index: number) {
    if (!source) return showMessage("Add a source paper first.", true);
    if (!configured[provider]) return showMessage(`Set ${provider === "qwen" ? "QWEN_API_KEY" : "DEEPSEEK_API_KEY"} in the server environment first.`, true);
    setBusyStage(stages[index].id); showMessage("");
    try { await callStage(index, outputs); showMessage(`${stages[index].name} finished. Review its handoff below.`); }
    catch (error) { showMessage(errText(error), true); }
    finally { setBusyStage(""); }
  }
  async function runAll() {
    if (!source) return showMessage("Add a source paper first.", true);
    if (!configured[provider]) return showMessage(`Set ${provider === "qwen" ? "QWEN_API_KEY" : "DEEPSEEK_API_KEY"} in the server environment first.`, true);
    let current = outputs;
    showMessage("");
    try {
      for (let i = 0; i < stages.length; i++) {
        if (current.some((item) => item.stage === stages[i].id)) continue;
        setBusyStage(stages[i].id);
        current = await callStage(i, current);
      }
      showMessage("All eight roles finished. Review the handoffs and missing evidence.");
    } catch (error) { showMessage(errText(error), true); }
    finally { setBusyStage(""); }
  }
  function exportNotes() {
    const heading = `# Replication notes\n\nPaper: ${source?.title || source?.citation}\nDOI: ${source?.doi || "Not supplied"}\n\n`;
    const body = stages.map((stage) => { const item = outputs.find((result) => result.stage === stage.id); return item ? `## ${stage.name}\n\nModel: ${item.model}; thinking: ${item.thinking ? "on" : "off"}\n\n${item.content}\n\n` : ""; }).join("");
    const url = URL.createObjectURL(new Blob([heading + body], { type: "text/markdown" }));
    const link = document.createElement("a"); link.href = url; link.download = "replication-notes.md"; link.click(); URL.revokeObjectURL(url);
  }

  useEffect(() => {
    type WebTool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown };
    const context = (document as Document & { modelContext?: { registerTool: (tool: WebTool, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: WebTool) => { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} };
    register({ name: "set_paper_citation", title: "Set paper citation", description: "Put a paper title, citation, or DOI in the visible paper field before lookup.", inputSchema: { type: "object", properties: { citation: { type: "string", minLength: 1, maxLength: 500 } }, required: ["citation"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { const value = (input as { citation?: unknown })?.citation; if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error("Provide a citation or DOI up to 500 characters."); flushSync(() => setCitation(value.trim())); return { citation: value.trim() }; } });
    register({ name: "set_model_mode", title: "Set model mode", description: "Select Qwen or DeepSeek and thinking or non-thinking mode in the visible controls.", inputSchema: { type: "object", properties: { provider: { type: "string", enum: ["qwen", "deepseek"] }, thinking: { type: "boolean" } }, required: ["provider", "thinking"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { const value = input as { provider?: unknown; thinking?: unknown }; if ((value.provider !== "qwen" && value.provider !== "deepseek") || typeof value.thinking !== "boolean") throw new Error("Choose a supported provider and thinking mode."); flushSync(() => { changeProvider(value.provider as Provider); setThinking(value.thinking as boolean); }); return { provider: value.provider, thinking: value.thinking }; } });
    return () => lifecycle.abort();
  }, []);

  return <main className="studio"><div className="content">
    <div className="heading"><h1>Experiment replication</h1><div className="heading-actions"><Button variant="outline" disabled={!outputs.length} onClick={exportNotes}>Export notes</Button><Button disabled={!source || !!busyStage || !configured[provider]} onClick={runAll}>{busyStage ? <><LoaderCircle className="spin" size={16} /> Running</> : <><Play size={16} /> Run all 8</>}</Button></div></div>
    <div className="setup"><section className="panel"><div className="panel-title"><FileText size={20} /><h2>Paper</h2></div><label htmlFor="citation">TITLE, CITATION, OR DOI</label><div className="input-row"><Input id="citation" value={citation} onChange={(event) => setCitation(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") resolvePaper(); }} placeholder="Enter DOI or paper title" /><Button disabled={loadingSource} onClick={resolvePaper}>{loadingSource ? <LoaderCircle className="spin" /> : "Find"}</Button></div><div className="upload"><span>or add full text</span><input id="file" ref={fileRef} className="sr-only" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => loadFile(event.target.files?.[0])} /><Button variant="outline" disabled={loadingSource} onClick={() => fileRef.current?.click()}><Paperclip size={16} /> Upload PDF / text</Button></div>{source && <div className="source-found"><strong>{source.title || source.citation}</strong><small>{source.doi ? `DOI ${source.doi} · ` : ""}{source.text ? "Full text" : source.abstract ? "Abstract only" : "Citation only"}</small></div>}</section>
      <section className="panel"><div className="panel-title"><h2>Model</h2></div><div className="model-grid"><div><label htmlFor="provider">PROVIDER</label><NativeSelect id="provider" className="wide-select" value={provider} onChange={(event) => changeProvider(event.target.value as Provider)}><NativeSelectOption value="qwen">Qwen</NativeSelectOption><NativeSelectOption value="deepseek">DeepSeek</NativeSelectOption></NativeSelect></div><div><label htmlFor="model">MODEL</label><NativeSelect id="model" className="wide-select" value={model} onChange={(event) => setModel(event.target.value)}>{provider === "qwen" ? <><NativeSelectOption value="qwen3.7-plus">Qwen 3.7 Plus</NativeSelectOption><NativeSelectOption value="qwen3.7-flash">Qwen 3.7 Flash</NativeSelectOption></> : <><NativeSelectOption value="deepseek-v4-flash">DeepSeek V4 Flash</NativeSelectOption><NativeSelectOption value="deepseek-v4-pro">DeepSeek V4 Pro</NativeSelectOption></>}</NativeSelect></div><div><label htmlFor="mode">MODE</label><NativeSelect id="mode" className="wide-select" value={thinking ? "thinking" : "plain"} onChange={(event) => setThinking(event.target.value === "thinking")}><NativeSelectOption value="thinking">Thinking</NativeSelectOption><NativeSelectOption value="plain">Non-thinking</NativeSelectOption></NativeSelect></div></div>{provider === "qwen" && <div className="extra-row"><label htmlFor="region">QWEN REGION</label><NativeSelect id="region" className="wide-select" value={qwenRegion} onChange={(event) => setQwenRegion(event.target.value)}><NativeSelectOption value="singapore">Singapore</NativeSelectOption><NativeSelectOption value="beijing">Beijing</NativeSelectOption><NativeSelectOption value="virginia">Virginia</NativeSelectOption></NativeSelect></div>}<p className={`key-status ${configured[provider] ? "ready" : ""}`}>{configured[provider] ? <><Check size={16} /> API key configured</> : `Set ${provider === "qwen" ? "QWEN_API_KEY" : "DEEPSEEK_API_KEY"} in the server environment to run roles.`}</p></section></div>
    {message && <div className={`message ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}>{message}</div>}
    <div className="flow-line"><span>{outputs.length} OF 8 COMPLETE</span><ArrowDown size={17} /></div>
    <div className="role-list">{stages.map((stage, index) => { const item = outputs.find((result) => result.stage === stage.id); const running = busyStage === stage.id; return <section className="role" key={stage.id} id={stage.id}><div className="role-head"><span className={`role-number ${item ? "complete" : ""}`}>{item ? <Check size={17} /> : String(index + 1).padStart(2, "0")}</span><div className="role-info"><h2>{stage.name}</h2><p>{stage.description}</p></div><Button variant={item ? "outline" : "default"} disabled={!source || !!busyStage || !configured[provider]} onClick={() => run(index)}>{running ? <><LoaderCircle className="spin" size={16} /> Running</> : item ? <><RotateCcw size={16} /> Rerun</> : <><Play size={16} /> Run</>}</Button></div>{item ? <div className="role-output"><div className="output-meta">{stage.deliverable} · {item.model} · {item.thinking ? "Thinking" : "Non-thinking"}</div><pre>{item.content}</pre></div> : <div className="role-empty">{stage.deliverable}</div>}</section>; })}</div>
    <p className="footnote">Model outputs are research drafts. A DOI record may not contain the full paper, and empirical results require data and code.</p>
  </div></main>;
}
