"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, FileText, LoaderCircle, Paperclip, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { auditProtocol, experimentProgress, generatePersonas, nextTask, parseProtocol, randomSeed, renderPrompt, results, reviewFindingKind, sourceQuoteMatches, sourceQuotePage, type Evidence, type ExperimentProtocol, type Persona, type SourceFile, type Trial } from "@/lib/experiment";
import { clearTrials, loadTrials, loadWorkspace, saveTrial, saveWorkspace } from "@/lib/browser-store";
import { personaCell, personaColumns, personasToCsv } from "@/lib/persona-export";
import { pdfPageText } from "@/lib/pdf-text";
import { brownAppendix, withBrownPublishedResults } from "@/lib/brown-annuity";
import { sourceExhibits } from "@/lib/source-exhibits";
import { buildPdf } from "@/lib/pdf-report";
import { agreementSummary, aiReportBlocks, aiResultTables, comparisonReportBlocks, comparisonRows, executiveSummary } from "@/lib/results-presentation";
import { displayAudit, displayBusy, displayReading, displayStatus, studyLabel, ui, type Language } from "@/lib/ui-language";

type Provider = "qwen" | "deepseek";
type StudyGuide = { headline: string; sections: { title: string; explanation: string; evidence: Evidence }[] };
type CorrectionDraft = { detail: string; source: string; quote: string };
type Stream = "main" | "extra";
type StreamProgress = { completed: number; total: number; detail: string; running: boolean; done: boolean; error: string };
type Synthesis = { summary: string; detail: string[] };
type RepairReport = { mode: string; retrievalWarning?: string; before: number; after: number; note: string; validationDetail?: string; protocol?: ExperimentProtocol | null; findings: { issue: string; status: string; explanation: string; source: string | null; quote: string | null; citationVerified: boolean }[]; passages: { source: string; page: number | null; excerpt: string }[] };
type ApiResponse = { error?: string; note?: string; protocol?: ExperimentProtocol; planIssues?: string[]; nodes?: ExperimentProtocol["nodes"]; analysisRules?: ExperimentProtocol["analysisRules"]; benchmarks?: ExperimentProtocol["benchmarks"]; guide?: StudyGuide; choice?: string; raw?: string; model?: string; repair?: RepairReport; retrievalMode?: string; retrievalWarning?: string; summary?: string; detail?: string[] };
type ExtractionCheckpoint = { signature: string; notes: string; protocol: ExperimentProtocol; questionGroups: string[][]; nodeGroupsDone: number; outcomeGroupsDone: number; summaryDone: boolean; retrievalMode: string; lastNodeError?: string };
const isChineseGuide = (guide: StudyGuide | null) => {
  const chineseExplanation = (value: string) => {
    const han = value.match(/[㐀-鿿]/gu)?.length || 0;
    const latin = value.match(/[a-z]/giu)?.length || 0;
    return han >= 8 && han * 2 >= latin;
  };
  return !!guide && /[㐀-鿿]/u.test(guide.headline) && guide.sections.every(({ title, explanation }) => /[㐀-鿿]/u.test(title) && chineseExplanation(explanation));
};
const sectionNames = ["Source materials", "Read the study", "Protocol & evidence", "AI personas", "Experiment run", "Experiment results", "Results comparison"];
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";
const idleStream = (): StreamProgress => ({ completed: 0, total: 0, detail: "", running: false, done: false, error: "" });
function sourceSignature(sources: SourceFile[], provider: Provider, thinking: boolean) {
  let hash = 2166136261;
  for (const source of sources) for (const character of `${source.name}\0${source.text}\0`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${provider}:${thinking}:${sources.length}:${hash >>> 0}`;
}
async function api(body: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch("/api/experiment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(210000) });
  const data = await response.json().catch(() => ({ error: `The server ended this request (${response.status}).` })) as ApiResponse & { detail?: string };
  if (!response.ok) throw Object.assign(new Error([data.error || "The model request failed.", data.detail].filter(Boolean).join(" ")), { status: response.status });
  return data;
}
function download(name: string, value: string | Blob, type = "application/json") {
  const url = URL.createObjectURL(value instanceof Blob ? value : new Blob([value], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileStem = (title: string) => (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "experiment").slice(0, 60);
async function readSource(file: File, onProgress: (fraction: number, detail: string) => void): Promise<SourceFile> {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} is over the 20 MB limit.`);
  let text = "";
  if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    onProgress(0, `Opening ${file.name}`);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const parts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      parts.push(`[Page ${pageNumber}]\n${pdfPageText(content.items)}`);
      onProgress(pageNumber / pdf.numPages, `${file.name}: page ${pageNumber} of ${pdf.numPages}`);
    }
    text = parts.join("\n\n");
    await pdf.destroy();
  } else if (/\.(txt|md)$/i.test(file.name)) { text = await file.text(); onProgress(1, `${file.name} ready`); }
  else throw new Error(`Use PDF, TXT, or Markdown files (${file.name}).`);
  if (text.trim().length < 200) throw new Error(`${file.name} has too little readable text.`);
  return { name: file.name, text };
}

function ProgressBar({ label, completed, total, detail, active = false }: { label: string; completed: number; total: number; detail: string; active?: boolean }) {
  const percent = total ? Math.round(completed / total * 100) : 0;
  return <div className="progress-block" aria-busy={active}>
    <div className="progress-heading"><strong>{active && <LoaderCircle className="spin" size={14} aria-hidden="true" />}{label}</strong><span>{percent}%</span></div>
    <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
    <p>{detail}</p>
  </div>;
}

function ValuationCdf({ title, series }: { title: string; series: { label: string; color: string; values: number[]; publishedMedian?: number }[] }) {
  const available = series.map((item) => ({ ...item, values: item.values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b) }));
  const aiValues = available.flatMap((item) => item.values);
  if (!aiValues.length) return <div className="paper-figure"><h3>{title}</h3><p className="inline-note">No completed AI valuations are available for this figure yet.</p></div>;
  const all = available.flatMap((item) => [...item.values, ...(item.publishedMedian ? [item.publishedMedian] : [])]);
  const min = Math.max(1, Math.min(...all));
  const max = Math.max(...all, min * 1.01);
  const left = 54, right = 730, top = 20, bottom = 260;
  const x = (value: number) => left + (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min)) * (right - left);
  const y = (fraction: number) => bottom - fraction * (bottom - top);
  const tickValues = [min, Math.sqrt(min * max), max];
  return <div className="paper-figure"><h3>{title}</h3><p className="paper-table-caption">Solid curves show completed AI valuation midpoints; dashed lines show the medians printed in the paper. The full published curves were not digitized.</p>
    <svg viewBox="0 0 780 310" role="img" aria-label={`${title}: cumulative distribution of synthetic AI valuations`}>
      {[0, .25, .5, .75, 1].map((fraction) => <g key={fraction}><line x1={left} x2={right} y1={y(fraction)} y2={y(fraction)} stroke="#e1e1e1" /><text x={left - 9} y={y(fraction) + 4} textAnchor="end" fontSize="11">{Math.round(fraction * 100)}%</text></g>)}
      {tickValues.map((value, index) => <text key={index} x={x(value)} y={bottom + 19} textAnchor="middle" fontSize="11">${Math.round(value).toLocaleString()}</text>)}
      {available.map((item) => item.publishedMedian ? <line key={`${item.label}-published`} x1={x(item.publishedMedian)} x2={x(item.publishedMedian)} y1={top} y2={bottom} stroke={item.color} strokeWidth="1.5" strokeDasharray="5 4" /> : null)}
      {available.map((item) => item.values.length ? <path key={item.label} d={`M ${left} ${bottom} ${item.values.map((value, index) => `L ${x(value)} ${y(index / item.values.length)} L ${x(value)} ${y((index + 1) / item.values.length)}`).join(" ")} L ${right} ${top}`} fill="none" stroke={item.color} strokeWidth="2.5" /> : null)}
      <text x={(left + right) / 2} y="303" textAnchor="middle" fontSize="12">Valuation midpoint (log scale)</text>
    </svg>
    <div className="figure-legend">{available.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label} AI (n={item.values.length}){item.publishedMedian ? ` · published median $${item.publishedMedian.toLocaleString()}` : ""}</span>)}</div>
  </div>;
}

function CorrectionCard({ issue, level, index, draft, sources, language, onChange }: { issue: string; level: string; index: number; draft?: CorrectionDraft; sources: SourceFile[]; language: Language; onChange: (patch: Partial<CorrectionDraft>) => void }) {
  const source = draft?.source || sources[0]?.name || "";
  const quote = draft?.quote || "";
  const quoteValid = useMemo(() => quote.trim() ? sourceQuoteMatches({ source, quote }, sources) : null, [quote, source, sources]);
  const pathError = level === "Run blocker" && /entry question|choice route|routes into another condition|routing loop|repeats a condition|earlier wave after a later wave|distinct choices|required decisions|choices per decision/i.test(issue);
  const runnerLimit = level === "Runner limitation";
  const needsReextract = issue.startsWith("This older extraction has no full-study coverage check.");
  return <details className="correction-card">
    <summary className="correction-head"><span className="correction-index">{String(index + 1).padStart(2, "0")}</span><span className="correction-title"><span className="correction-level">{ui(language, level)}</span><strong>{displayAudit(language, issue)}</strong></span><span className="correction-chevron" aria-hidden="true">⌄</span></summary>
    <div className="correction-fields">
      {pathError && <p className="correction-hint">{ui(language, "This is a problem in the extracted question map. First compare it with the paper or questionnaire; it may be an AI extraction mistake.")}</p>}
      {runnerLimit || needsReextract ? <p className="correction-hint">{ui(language, needsReextract ? "Re-extract the uploaded paper to check every study stage before running." : "This result is reported by the study, but Reprise cannot calculate it yet. No paper correction is needed.")}</p> : <>
        <div><label htmlFor={`correction-detail-${index}`}>{ui(language, "Corrected detail")}</label><textarea id={`correction-detail-${index}`} value={draft?.detail || ""} onChange={(event) => onChange({ detail: event.target.value })} placeholder={ui(language, "Write the correct rule, amount, question wording, or assignment here.")} rows={3} /></div>
        <div className="correction-evidence"><div><label htmlFor={`correction-source-${index}`}>{ui(language, "Source file")}</label><select id={`correction-source-${index}`} value={source} onChange={(event) => onChange({ source: event.target.value })}>{sources.map((file) => <option value={file.name} key={file.name}>{file.name}</option>)}</select></div><div><label htmlFor={`correction-quote-${index}`}>{ui(language, "Exact supporting quote")}</label><textarea id={`correction-quote-${index}`} value={quote} onChange={(event) => onChange({ quote: event.target.value })} placeholder={ui(language, "Paste a short phrase from the uploaded paper or appendix.")} rows={2} /></div></div>
        {quoteValid !== null && <p className={`quote-check ${quoteValid ? "found" : "missing"}`}>{ui(language, quoteValid ? "Quote found in the uploaded source" : "Quote not found in the selected source")}</p>}
      </>}
    </div>
  </details>;
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const t = useCallback((english: string) => ui(language, english), [language]);
  const languageReady = useRef(false);
  useEffect(() => {
    queueMicrotask(() => {
      try { if (window.localStorage.getItem("reprise-language") === "zh") setLanguage("zh"); } catch { /* Language remains selectable if storage is unavailable. */ }
      languageReady.current = true;
    });
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    if (languageReady.current) { try { window.localStorage.setItem("reprise-language", language); } catch { /* Keep the in-page selection. */ } }
  }, [language]);
  const [loaded, setLoaded] = useState(false);
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [mainSourceName, setMainSourceName] = useState("");
  // Notes are kept per stream so the paper and its appendix can be read at the
  // same time without one overwriting the other's progress.
  const [mainNotes, setMainNotes] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [studyGuide, setStudyGuide] = useState<StudyGuide | null>(null);
  const [chineseStudyGuide, setChineseStudyGuide] = useState<StudyGuide | null>(null);
  const [translatingGuide, setTranslatingGuide] = useState(false);
  const attemptedGuideTranslation = useRef("");
  const [protocolJson, setProtocolJson] = useState("");
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, CorrectionDraft>>({});
  const [repairReport, setRepairReport] = useState<RepairReport | null>(null);
  const [activeSection, setActiveSection] = useState(0);
  const [studyRead, setStudyRead] = useState(false);
  const [protocolReviewed, setProtocolReviewed] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaPage, setPersonaPage] = useState(0);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [provider, setProvider] = useState<Provider>("qwen");
  const [thinking, setThinking] = useState(false);
  const [count, setCount] = useState(20);
  const [honorWaveGap, setHonorWaveGap] = useState(false);
  const [busy, setBusy] = useState("");
  const [streams, setStreams] = useState<Record<Stream, StreamProgress>>({ main: idleStream(), extra: idleStream() });
  const [compiling, setCompiling] = useState(false);
  const [extractionReady, setExtractionReady] = useState(false);
  const [readingProgress, setReadingProgress] = useState<{ completed: number; total: number; detail: string } | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<{ completed: number; total: number } | null>(null);
  const [extractionSearchMode, setExtractionSearchMode] = useState("");
  const [extractionFailure, setExtractionFailure] = useState("");
  const [hasExtractionCheckpoint, setHasExtractionCheckpoint] = useState(false);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [connection, setConnection] = useState<{ connected: boolean; semanticSearch: boolean; models: Record<Provider, { thinking: string; nonThinking: string }> }>({ connected: false, semanticSearch: false, models: { qwen: { thinking: "", nonThinking: "" }, deepseek: { thinking: "", nonThinking: "" } } });
  const stopRef = useRef(false);
  const trialsRef = useRef<Trial[]>([]);
  const compileRef = useRef(false);
  const autoCompiled = useRef("");
  const mainFileRef = useRef<HTMLInputElement>(null);
  const supplementaryFileRef = useRef<HTMLInputElement>(null);
  const recheckFileRef = useRef<HTMLInputElement>(null);
  const notes = useMemo(() => [mainNotes, extraNotes].filter(Boolean).join("\n\n"), [mainNotes, extraNotes]);
  useEffect(() => {
    (async () => {
      try {
        const [savedSources, savedMainSourceName, savedMainNotes, savedExtraNotes, savedGuide, savedChineseGuide, savedProtocol, savedDrafts, savedPersonas, savedTrials, savedStudyRead, savedProtocolReviewed, savedCheckpoint] = await Promise.all([
          loadWorkspace<SourceFile[]>("sources"), loadWorkspace<string>("mainSourceName"), loadWorkspace<string>("mainNotes"), loadWorkspace<string>("extraNotes"), loadWorkspace<StudyGuide>("studyGuide"), loadWorkspace<StudyGuide>("studyGuideZh"), loadWorkspace<string>("protocol"), loadWorkspace<Record<string, CorrectionDraft>>("correctionDrafts"), loadWorkspace<Persona[]>("personas"), loadTrials<Trial>(), loadWorkspace<boolean>("studyRead"), loadWorkspace<boolean>("protocolReviewed"), loadWorkspace<ExtractionCheckpoint>("extractionCheckpoint"),
        ]);
        setSources(savedSources || []); setMainSourceName(savedMainSourceName === undefined ? savedSources?.[0]?.name || "" : savedSources?.some((source) => source.name === savedMainSourceName) ? savedMainSourceName : "");
        setMainNotes(savedMainNotes || ""); setExtraNotes(savedExtraNotes || "");
        setStudyGuide(savedGuide || null); setChineseStudyGuide(savedChineseGuide || null); setProtocolJson(savedProtocol || ""); setCorrectionDrafts(savedDrafts || {}); setPersonas(savedPersonas || []);
        if (savedProtocol) { try { parseProtocol(JSON.parse(savedProtocol)); setExtractionReady(true); } catch { setExtractionReady(false); } }
        // A stream restored from a previous session is already complete, so its
        // bar shows full rather than an unstarted 0%.
        const restored = (detail: string): StreamProgress => ({ completed: 1, total: 1, detail, running: false, done: true, error: "" });
        if (savedMainNotes) setStreams((current) => ({ ...current, main: restored("Read in an earlier session") }));
        if (savedExtraNotes) setStreams((current) => ({ ...current, extra: restored("Read in an earlier session") }));
        setStudyRead(savedStudyRead || false); setProtocolReviewed(savedProtocolReviewed || false);
        setTrials(savedTrials); trialsRef.current = savedTrials;
        setHasExtractionCheckpoint(!!savedCheckpoint);
      } catch { /* The site remains usable if browser storage is unavailable. */ }
      setLoaded(true);
    })();
    fetch("/api/config").then((r) => r.json() as Promise<typeof connection>).then(setConnection).catch(() => {});
  }, []);
  useEffect(() => { if (loaded) void saveWorkspace("sources", sources).catch(() => {}); }, [sources, loaded]);
  useEffect(() => { if (loaded) void saveWorkspace("mainSourceName", mainSourceName).catch(() => {}); }, [mainSourceName, loaded]);
  useEffect(() => { if (loaded) void saveWorkspace("mainNotes", mainNotes).catch(() => {}); }, [mainNotes, loaded]);
  useEffect(() => { if (loaded) void saveWorkspace("extraNotes", extraNotes).catch(() => {}); }, [extraNotes, loaded]);
  useEffect(() => { if (loaded) void saveWorkspace("studyGuide", studyGuide).catch(() => {}); }, [studyGuide, loaded]);
  useEffect(() => { if (loaded) void saveWorkspace("studyGuideZh", chineseStudyGuide).catch(() => {}); }, [chineseStudyGuide, loaded]);
  useEffect(() => { if (loaded) void saveWorkspace("protocol", protocolJson).catch(() => {}); }, [protocolJson, loaded]);
  useEffect(() => { if (loaded) void saveWorkspace("correctionDrafts", correctionDrafts).catch(() => {}); }, [correctionDrafts, loaded]);
  useEffect(() => { if (loaded) void saveWorkspace("personas", personas).catch(() => {}); }, [personas, loaded]);
  useEffect(() => { if (loaded) void saveWorkspace("studyRead", studyRead).catch(() => {}); }, [studyRead, loaded]);
  useEffect(() => { if (loaded) void saveWorkspace("protocolReviewed", protocolReviewed).catch(() => {}); }, [protocolReviewed, loaded]);
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), error ? 8000 : 5500);
    return () => window.clearTimeout(timeout);
  }, [message, error]);
  const parsed = useMemo(() => {
    if (!protocolJson.trim()) return { protocol: null, syntaxError: "" };
    try { return { protocol: withBrownPublishedResults(parseProtocol(JSON.parse(protocolJson)), sources), syntaxError: "" }; }
    catch (e) { return { protocol: null, syntaxError: errorText(e) }; }
  }, [protocolJson, sources]);
  const audit = useMemo(() => parsed.protocol ? auditProtocol(parsed.protocol, sources) : null, [parsed.protocol, sources]);
  const personaBlockers = audit?.personaBlockers || [];
  const runBlockers = useMemo(() => audit?.runBlockers || [], [audit]);
  const coverageCheckMissing = !!parsed.protocol && (!parsed.protocol.designRequirements?.length || !Array.isArray(parsed.protocol.missingExecutable));
  const fidelityWarnings = useMemo(() => [...(audit?.fidelityWarnings || []), ...(coverageCheckMissing ? ["This older extraction has no full-study coverage check. Re-extract the paper before relying on it."] : [])], [audit, coverageCheckMissing]);
  const warnings = audit?.warnings || [];
  const issueCards = useMemo(() => {
    if (!audit) return [];
    const seen = new Set<string>();
    return [
      ...audit.personaBlockers.map((message) => ({ message, level: "Persona blocker", blocking: true })),
      ...runBlockers.map((message) => ({ message, level: "Run blocker", blocking: true })),
      ...fidelityWarnings.map((message) => ({ message, level: "Replication fidelity", blocking: false })),
      ...audit.warnings.map((message) => ({ message, level: reviewFindingKind(message), blocking: false })),
    ].filter(({ message }) => { if (seen.has(message)) return false; seen.add(message); return true; });
  }, [audit, runBlockers, fidelityWarnings]);
  const requiredCards = issueCards.filter(({ blocking }) => blocking);
  const reviewCards = issueCards.filter(({ blocking }) => !blocking);
  const completedCorrections = issueCards.filter(({ message, level }) => level !== "Runner limitation" && !message.startsWith("This older extraction has no full-study coverage check.") && correctionDrafts[message]?.detail.trim() && correctionDrafts[message]?.quote.trim()).length;
  const selectedModel = connection.models[provider][thinking ? "thinking" : "nonThinking"];
  const modelReady = connection.connected && !!selectedModel;
  const runId = `${provider}:${thinking ? "thinking" : "plain"}:${selectedModel}`;
  const activeTrials = useMemo(() => trials.filter((t) => t.runId === runId), [trials, runId]);
  const report = useMemo(() => parsed.protocol ? results(parsed.protocol, personas, activeTrials) : null, [parsed.protocol, personas, activeTrials]);
  const runProgress = useMemo(() => parsed.protocol ? experimentProgress(parsed.protocol, personas, activeTrials) : null, [parsed.protocol, personas, activeTrials]);
  const personasHaveNoAttributes = personas.length > 0 && personas.every((persona) => Object.keys(persona.fields).length === 0);
  const status = (text: string, isError = false) => { setMessage(text); setError(isError); };
  const extraSources = useMemo(() => sources.filter((source) => source.name !== mainSourceName), [sources, mainSourceName]);
  const notesReady = streams.main.done && (!extraSources.length || streams.extra.done);
  const anyStreamRunning = streams.main.running || streams.extra.running;

  const setStream = (stream: Stream, patch: Partial<StreamProgress>) => setStreams((current) => ({ ...current, [stream]: { ...current[stream], ...patch } }));

  async function clearSourceResults() {
    setExtractionReady(false); setExtractionProgress(null); setExtractionSearchMode(""); setReadingProgress(null);
    setExtractionFailure(""); setHasExtractionCheckpoint(false); await saveWorkspace("extractionCheckpoint", null);
    setMainNotes(""); setExtraNotes(""); setStreams({ main: idleStream(), extra: idleStream() });
    setStudyGuide(null); setChineseStudyGuide(null); setProtocolJson(""); setCorrectionDrafts({}); setRepairReport(null); setSynthesis(null);
    setPersonas([]); setTrials([]); trialsRef.current = []; await clearTrials();
    setStudyRead(false); setProtocolReviewed(false); setPersonaPage(0); setActiveSection(0);
    window.scrollTo({ top: 0 });
  }

  async function addFiles(files: FileList | null, kind: "main" | "supplementary", fromRecheck = false) {
    if (!files?.length) return;
    if (kind === "supplementary" && !mainSourceName) return status(t("Upload the main paper first."), true);
    setBusy("Reading sources");
    setExtractionProgress(null);
    const selectedFiles = Array.from(files);
    setReadingProgress({ completed: 0, total: selectedFiles.length, detail: `Opening file 1 of ${selectedFiles.length}` });
    try {
      const read: SourceFile[] = [];
      for (const [index, file] of selectedFiles.entries()) {
        read.push(await readSource(file, (fraction, detail) => setReadingProgress({ completed: index + fraction, total: selectedFiles.length, detail: `File ${index + 1} of ${selectedFiles.length} · ${detail}` })));
      }
      if (kind === "supplementary" && read.some((source) => source.name === mainSourceName)) throw new Error(t("A supplementary file cannot have the same name as the main paper."));
      if (kind === "main") {
        const paper = read[0];
        setSources((current) => [paper, ...current.filter((source) => source.name !== mainSourceName && source.name !== paper.name)]);
        setMainSourceName(paper.name);
        await clearSourceResults();
        status(t("Main paper ready. Add supplementary resources if needed, then extract experiment rules."));
      } else {
        setSources((current) => [...current.filter((source) => !read.some((item) => item.name === source.name)), ...read]);
        if (fromRecheck) {
          setReadingProgress(null); setRepairReport(null);
          status(t("Supplementary resources added. Select Recheck to search them with the paper."));
        } else {
          await clearSourceResults();
          status(t("Supplementary resources ready. Extract experiment rules to use all listed files."));
        }
      }
    } catch (e) { status(errorText(e), true); } finally { setBusy(""); }
  }
  async function removeFile(name: string) {
    if (busy || anyStreamRunning || compiling) return;
    const remaining = sources.filter((source) => source.name !== name);
    setBusy("Removing source");
    try {
      await saveWorkspace("sources", remaining);
      setSources(remaining);
      if (name === mainSourceName) setMainSourceName("");
      await clearSourceResults();
      status(`Removed ${name}. Extract experiment rules again to use the remaining files.`);
    } catch (e) { status(errorText(e), true); } finally { setBusy(""); }
  }

  /** Reads one file set into source notes. Both sets can be read at once. */
  async function extractStream(stream: Stream) {
    const files = stream === "main" ? sources.filter((source) => source.name === mainSourceName) : extraSources;
    if (!files.length) return;
    setStream(stream, { running: true, done: false, error: "", completed: 0, total: 1, detail: "Starting" });
    setExtractionReady(false); setExtractionFailure("");
    const chunks = files.flatMap((source) => source.text.match(/[\s\S]{1,20000}/g)?.map((chunk) => ({ source: source.name, chunk })) || []);
    const collected: string[] = [];
    try {
      for (const [index, chunk] of chunks.entries()) {
        setStream(stream, { completed: index, total: chunks.length, detail: `${chunk.source} · section ${index + 1} of ${chunks.length}` });
        const answer = await api({ action: "extract_chunk", provider, thinking, ...chunk });
        collected.push(`SOURCE: ${chunk.source}\n${answer.note || ""}`);
        const joined = collected.join("\n\n");
        if (stream === "main") setMainNotes(joined); else setExtraNotes(joined);
      }
      setStream(stream, { running: false, done: true, completed: chunks.length, total: chunks.length, detail: `${files.length} file${files.length === 1 ? "" : "s"} read` });
    } catch (e) {
      setStream(stream, { running: false, done: false, error: errorText(e), detail: "Paused" });
      status(`${stream === "main" ? "Main paper" : "Additional resources"}: ${errorText(e)}`, true);
    }
  }

  // Once both file sets have been read, the shared reconstruction runs on its
  // own; nothing about it depends on which stream finished last. It is attempted
  // once per source set, so a failure leaves the Resume button in charge.
  useEffect(() => {
    if (!loaded || compiling || compileRef.current || !notesReady || extractionReady || anyStreamRunning) return;
    if (!mainNotes.trim()) return;
    const signature = sourceSignature(sources, provider, thinking);
    if (autoCompiled.current === signature) return;
    autoCompiled.current = signature;
    void compileProtocol();
    // compileProtocol is stable for the inputs captured here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, notesReady, extractionReady, anyStreamRunning, compiling, mainNotes]);

  async function rebuildInstrument() {
    if (!brownAppendix(sources)) return status("Upload the verified survey instrument before rebuilding.", true);
    setBusy("Building the verified survey instrument");
    setExtractionFailure("");
    try {
      const built = await api({ action: "build_instrument", provider, thinking, sources });
      if (!built.protocol) throw new Error("The appendix did not produce an executable instrument.");
      setProtocolJson(JSON.stringify(built.protocol, null, 2));
      setRepairReport(null); setStudyRead(false); setProtocolReviewed(false); setSynthesis(null);
      setCount(20); setExtractionReady(true);
      await saveWorkspace("extractionCheckpoint", null);
      setHasExtractionCheckpoint(false);
      setExtractionProgress(null);
      await clearTrials(); setPersonas([]); setTrials([]); trialsRef.current = [];
      status("The verified survey instrument is ready. Review the protocol before running.");
      return built.protocol;
    } catch (error) { setExtractionFailure(errorText(error)); status(errorText(error), true); }
    finally { setBusy(""); }
  }

  /** Turns the gathered source notes into a runnable protocol. */
  async function compileProtocol() {
    if (!mainSourceName || !sources.some((source) => source.name === mainSourceName)) return status(t("Upload the main paper first."), true);
    if (!notes.trim()) return status("Extract the main paper before building the protocol.", true);
    compileRef.current = true;
    setCompiling(true); setExtractionFailure(""); setBusy("Reconstructing the study"); status("");
    let stage = "study plan";
    try {
      if (brownAppendix(sources) && sources.some((source) => /cognitive\s+constraints\s+on\s+valuing\s+annuities/i.test(source.text))) {
        stage = "verified survey instrument";
        const built = await rebuildInstrument();
        if (built) await finishExtraction(built);
        return;
      }
      const extractedNotes = notes;
      const signature = sourceSignature(sources, provider, thinking);
      let checkpoint = await loadWorkspace<ExtractionCheckpoint>("extractionCheckpoint");
      if (checkpoint?.signature !== signature || !Array.isArray(checkpoint.questionGroups)) checkpoint = undefined;
      if (!checkpoint) {
        if (extractedNotes.length > 160000) throw new Error("This paper produced more source notes than one protocol pass can safely inspect. Split the source set and extract it in smaller parts.");
        setExtractionProgress({ completed: 0, total: 5 });
        setBusy(connection.semanticSearch ? "Reconstructing study plan with Voyage" : "Reconstructing study plan");
        const planAnswer = await api({ action: "compile_plan", provider, thinking, notes: extractedNotes, sources });
        if (!planAnswer.protocol) throw new Error("No complete study plan was returned.");
        setExtractionSearchMode(planAnswer.retrievalMode || "");
        let protocol = planAnswer.protocol;
        let planIssues = planAnswer.planIssues || [];
        for (let attempt = 0; planIssues.length && attempt < 2; attempt++) {
          setBusy(`Checking and repairing study plan ${attempt + 1} of 2`);
          const repaired = await api({ action: "repair_plan", provider, thinking, notes: extractedNotes, protocol });
          if (!repaired.protocol) throw new Error("The study plan repair was incomplete.");
          protocol = repaired.protocol;
          planIssues = repaired.planIssues || [];
        }
        if (planIssues.length) throw new Error(`The study design is still incomplete: ${planIssues[0]}`);
        const byStage = new Map<string, string[]>();
        for (const condition of protocol.conditions) {
          const key = condition.stage || condition.id;
          byStage.set(key, [...(byStage.get(key) || []), condition.id]);
        }
        const questionGroups = [...byStage.entries()].flatMap(([stageName, conditionIds]) => {
          const groups: string[][] = [];
          // A stage whose conditions branch into multi-step paths is rebuilt one
          // condition at a time; independent single decisions batch safely.
          const requirement = protocol.designRequirements?.find((item) => item.stage === stageName);
          const batchSize = requirement && requirement.conditionCountPerArm != null && requirement.conditionCountPerArm < requirement.decisionsPerArm ? 1 : 4;
          for (let offset = 0; offset < conditionIds.length; offset += batchSize) groups.push(conditionIds.slice(offset, offset + batchSize));
          return groups;
        });
        checkpoint = { signature, notes: extractedNotes, protocol, questionGroups, nodeGroupsDone: 0, outcomeGroupsDone: 0, summaryDone: false, retrievalMode: planAnswer.retrievalMode || "" };
        await saveWorkspace("extractionCheckpoint", checkpoint);
        setHasExtractionCheckpoint(true);
      } else {
        setExtractionSearchMode(checkpoint.retrievalMode);
      }
      let { protocol } = checkpoint;
      const { questionGroups } = checkpoint;
      const totalSteps = questionGroups.length * 2 + 5;
      const step = (done: number) => setExtractionProgress({ completed: done, total: totalSteps });
      step(1 + checkpoint.nodeGroupsDone + checkpoint.outcomeGroupsDone + Number(checkpoint.summaryDone));
      for (let index = checkpoint.nodeGroupsDone; index < questionGroups.length; index++) {
        const conditionIds = questionGroups[index];
        stage = `decision group ${index + 1} of ${questionGroups.length}`;
        setBusy(`Reconstructing decisions ${index + 1} of ${questionGroups.length}`);
        let part: ApiResponse;
        try { part = await api({ action: "compile_nodes", provider, thinking, notes: extractedNotes, sources, protocol, conditionIds, retryIssue: checkpoint.lastNodeError }); }
        catch (requestError) {
          if ((requestError as Error & { status?: number }).status === 422) {
            const recoveredNodes: ExperimentProtocol["nodes"] = [];
            const missing: string[] = [];
            for (const id of conditionIds) {
              if (conditionIds.length === 1) { missing.push(`Question path for condition ${id} could not be reconstructed automatically: ${errorText(requestError)}`); break; }
              try {
                const recovered = await api({ action: "compile_nodes", provider, thinking, notes: extractedNotes, sources, protocol, conditionIds: [id], retryIssue: errorText(requestError) });
                if (!recovered.nodes?.length) throw Object.assign(new Error("No executable question was returned."), { status: 422 });
                recoveredNodes.push(...recovered.nodes);
              } catch (singleError) {
                if ((singleError as Error & { status?: number }).status !== 422) {
                  checkpoint = { ...checkpoint, lastNodeError: errorText(singleError) };
                  await saveWorkspace("extractionCheckpoint", checkpoint);
                  throw singleError;
                }
                missing.push(`Question path for condition ${id} could not be reconstructed automatically: ${errorText(singleError)}`);
              }
            }
            protocol = parseProtocol({ ...protocol, nodes: [...protocol.nodes, ...recoveredNodes], missingExecutable: [...new Set([...(protocol.missingExecutable || []), ...missing])] });
            checkpoint = { ...checkpoint, protocol, nodeGroupsDone: index + 1, lastNodeError: undefined };
            await saveWorkspace("extractionCheckpoint", checkpoint);
            step(2 + index);
            continue;
          }
          checkpoint = { ...checkpoint, lastNodeError: errorText(requestError) };
          await saveWorkspace("extractionCheckpoint", checkpoint);
          throw requestError;
        }
        if (!part.nodes?.length) throw new Error(`The questions for decision group ${index + 1} are incomplete.`);
        protocol = parseProtocol({ ...protocol, nodes: [...protocol.nodes, ...part.nodes] });
        checkpoint = { ...checkpoint, protocol, nodeGroupsDone: index + 1, lastNodeError: undefined };
        await saveWorkspace("extractionCheckpoint", checkpoint);
        step(2 + index);
      }
      for (let index = checkpoint.outcomeGroupsDone; index < questionGroups.length; index++) {
        const conditionIds = questionGroups[index].filter((id) => protocol.nodes.some((node) => node.conditionId === id));
        if (!conditionIds.length) {
          checkpoint = { ...checkpoint, outcomeGroupsDone: index + 1 };
          await saveWorkspace("extractionCheckpoint", checkpoint);
          step(questionGroups.length + 2 + index);
          continue;
        }
        stage = `result group ${index + 1} of ${questionGroups.length}`;
        setBusy(`Reconstructing result measures ${index + 1} of ${questionGroups.length}`);
        let part = await api({ action: "compile_outcome_group", provider, thinking, notes: extractedNotes, sources, protocol, conditionIds });
        if (!part.analysisRules?.length && protocol.nodes.some((node) => conditionIds.includes(node.conditionId) && node.options.length > 2)) {
          setBusy(`Rechecking published measures ${index + 1} of ${questionGroups.length}`);
          part = await api({ action: "compile_outcome_group", provider, thinking, notes: extractedNotes, sources, protocol, conditionIds, focused: true });
        }
        if (!part.analysisRules || !part.benchmarks) throw new Error(`The result measures for group ${index + 1} are incomplete.`);
        protocol = parseProtocol({ ...protocol, analysisRules: [...protocol.analysisRules, ...part.analysisRules], benchmarks: [...protocol.benchmarks, ...part.benchmarks] });
        checkpoint = { ...checkpoint, protocol, outcomeGroupsDone: index + 1 };
        await saveWorkspace("extractionCheckpoint", checkpoint);
        step(questionGroups.length + 2 + index);
      }
      if (!checkpoint.summaryDone) {
        stage = "published result summary";
        setBusy("Checking remaining published results");
        const summaryAnswer = await api({ action: "compile_outcome_summary", provider, thinking, notes: extractedNotes, sources, protocol });
        if (!summaryAnswer.protocol) throw new Error("The published result summary is incomplete.");
        protocol = summaryAnswer.protocol;
        checkpoint = { ...checkpoint, protocol, summaryDone: true };
        await saveWorkspace("extractionCheckpoint", checkpoint);
        step(questionGroups.length * 2 + 2);
      }
      stage = "study coverage";
      setBusy("Checking study coverage");
      const coverageAnswer = await api({ action: "verify_coverage", provider, thinking, notes: extractedNotes, sources, protocol });
      if (!coverageAnswer.protocol) throw new Error("The study coverage check was incomplete.");
      protocol = coverageAnswer.protocol;
      step(questionGroups.length * 2 + 3);
      await finishExtraction(protocol, (done) => step(questionGroups.length * 2 + 3 + done));
    } catch (e) { setExtractionFailure(`${stage}: ${errorText(e)}`); }
    finally { setBusy(""); setCompiling(false); compileRef.current = false; }
  }

  /**
   * The last shared steps: published values for every calculated measure, the
   * paper's own result layout, and the plain-language explanation. Each is
   * optional, so a failure here never discards a working protocol.
   */
  async function finishExtraction(input: ExperimentProtocol, step: (done: number) => void = () => {}) {
    let protocol = input;
    try {
      setBusy("Searching the paper for published values");
      const matched = await api({ action: "extract_benchmarks", provider, thinking, sources, protocol });
      if (matched.protocol) protocol = matched.protocol;
    } catch { /* The run still works with the values already matched. */ }
    step(1);
    try {
      setBusy("Reading how the paper presents its results");
      const layout = await api({ action: "result_tables", provider, thinking, sources, mainSourceName, protocol });
      if (layout.protocol) protocol = layout.protocol;
    } catch { /* Results fall back to the stage grouping. */ }
    step(2);
    setProtocolJson(JSON.stringify(protocol, null, 2));
    setRepairReport(null); setSynthesis(null);
    setStudyRead(false); setProtocolReviewed(false);
    setCount(Math.min(protocol.sampleSize || 20, 200));
    await saveWorkspace("extractionCheckpoint", null);
    setHasExtractionCheckpoint(false);
    setExtractionReady(true);
    // The study summary tab should never be empty after a successful run.
    if (!studyGuide) {
      try {
        setBusy("Writing the plain-language explanation");
        const guide = await api({ action: "study_guide", provider, thinking, language: "en", notes: notes || protocol.sourceNotes });
        if (guide.guide) setStudyGuide(guide.guide);
      } catch { /* The tab offers a retry button. */ }
    }
    step(3);
    status(protocol.missingExecutable?.length
      ? language === "zh" ? "资料提取已完成，但部分问题仍需核对；请在方案与证据中查看。" : "Extraction finished. Some design details need review in Protocol & evidence; the run is not blocked by them."
      : t("Protocol ready. Continue to the study summary; create a study guide or recheck sources there if needed."));
  }

  async function reviewIncompleteExtraction() {
    const checkpoint = await loadWorkspace<ExtractionCheckpoint>("extractionCheckpoint");
    if (!checkpoint || checkpoint.signature !== sourceSignature(sources, provider, thinking)) return;
    const missing = checkpoint.questionGroups.slice(checkpoint.nodeGroupsDone).flat();
    const protocol = parseProtocol({ ...checkpoint.protocol, missingExecutable: [...new Set([...(checkpoint.protocol.missingExecutable || []), "Extraction has not finished validation; resume extraction before relying on these results.", ...missing.map((id) => `Question path for condition ${id} has not been reconstructed.`)])] });
    setProtocolJson(JSON.stringify(protocol, null, 2));
    setExtractionReady(true);
    setStudyRead(true);
    setProtocolReviewed(false);
    setActiveSection(2);
    window.scrollTo({ top: 0 });
  }
  async function createStudyGuide() {
    if (!notes) return;
    setBusy("Writing the study guide");
    try {
      const existing = language === "zh" ? chineseStudyGuide || studyGuide : null;
      const answer = existing && !isChineseGuide(existing)
        ? await api({ action: "translate_study_guide", provider, thinking, guide: existing })
        : await api({ action: "study_guide", provider, thinking, language, notes });
      if (!answer.guide) throw new Error("No study guide was returned.");
      if (language === "zh") setChineseStudyGuide(answer.guide); else setStudyGuide(answer.guide);
      status("Study guide ready.");
    } catch (e) { status(errorText(e), true); } finally { setBusy(""); }
  }
  function updateCorrection(issue: string, patch: Partial<CorrectionDraft>) {
    setCorrectionDrafts((current) => ({ ...current, [issue]: { detail: current[issue]?.detail || "", source: current[issue]?.source || sources[0]?.name || "", quote: current[issue]?.quote || "", ...patch } }));
  }
  async function applyCorrections() {
    if (!parsed.protocol) return;
    const touched = issueCards.filter(({ message, level }) => {
      if (level === "Runner limitation") return false;
      const draft = correctionDrafts[message];
      return !!draft && !!(draft.detail.trim() || draft.quote.trim());
    });
    if (!touched.length) return status("Add a correction to one of the issue cards first.", true);
    if (touched.some(({ message }) => !correctionDrafts[message].detail.trim() || !correctionDrafts[message].quote.trim())) return status("Complete both the corrected detail and source quote in each started card.", true);
    const corrections = touched.map(({ message }) => ({ issue: message, ...correctionDrafts[message], source: correctionDrafts[message].source || sources[0]?.name || "" }));
    const unmatched = corrections.find((entry) => !sourceQuoteMatches({ source: entry.source, quote: entry.quote }, sources));
    if (unmatched) return status(`The quote for “${unmatched.issue}” was not found in ${unmatched.source}. Paste a short exact phrase from the uploaded file.`, true);
    setBusy("Applying source corrections"); status("");
    try {
      const answer = await api({ action: "refine_protocol", provider, thinking, protocol: parsed.protocol, notes, corrections });
      if (!answer.protocol) throw new Error("No revised protocol was returned.");
      setProtocolJson(JSON.stringify(answer.protocol, null, 2));
      setRepairReport(null);
      setProtocolReviewed(false);
      setCorrectionDrafts((current) => { const next = { ...current }; touched.forEach(({ message }) => { delete next[message]; }); return next; });
      await clearTrials(); setPersonas([]); setPersonaPage(0); setTrials([]); trialsRef.current = []; setSynthesis(null);
      status(`${corrections.length} source correction${corrections.length === 1 ? "" : "s"} reprocessed. The checks have been recalculated; review any items that remain.`);
    } catch (e) { status(errorText(e), true); } finally { setBusy(""); }
  }
  async function recheckWithSources() {
    if (!parsed.protocol || !sources.length) return;
    setBusy("Searching source passages"); setRepairReport(null); status("");
    try {
      const answer = await api({ action: "repair_with_retrieval", provider, thinking, protocol: parsed.protocol, sources });
      if (!answer.repair) throw new Error("The source recheck returned no report.");
      setRepairReport(answer.repair);
      status(answer.repair.protocol ? "Source search found a source-backed proposal. Review it below." : answer.repair.note);
    } catch (e) { status(errorText(e), true); } finally { setBusy(""); }
  }
  async function findPublishedValues() {
    if (!parsed.protocol) return;
    setBusy("Searching the paper for published values"); status("");
    try {
      const answer = await api({ action: "extract_benchmarks", provider, thinking, sources, protocol: parsed.protocol });
      if (!answer.protocol) throw new Error("No published values were returned.");
      setProtocolJson(JSON.stringify(answer.protocol, null, 2));
      status(answer.note || "The search finished.");
    } catch (e) { status(errorText(e), true); } finally { setBusy(""); }
  }
  async function applyRetrievedRepair() {
    if (!repairReport?.protocol) return;
    setProtocolJson(JSON.stringify(repairReport.protocol, null, 2));
    setProtocolReviewed(false); setCorrectionDrafts({}); setRepairReport(null);
    await clearTrials(); setPersonas([]); setPersonaPage(0); setTrials([]); trialsRef.current = []; setSynthesis(null);
    status("Source-backed repair applied. Review the remaining checks before continuing.");
  }
  async function makePersonas() {
    if (!parsed.protocol || personaBlockers.length) return status("A valid assignment plan is needed before generating personas.", true);
    try {
      // A fresh seed every time: each sample is an independent random draw.
      const generated = generatePersonas(parsed.protocol, count, randomSeed());
      await clearTrials(); setPersonas(generated); setPersonaPage(0); setTrials([]); trialsRef.current = []; setSynthesis(null);
      status(`${generated.length} synthetic AI personas generated. Review findings before interpreting their results.`);
    } catch (e) { status(errorText(e), true); }
  }
  async function run(limit: number) {
    const protocol = parsed.protocol;
    if (!protocol || !personas.length || runBlockers.length) return status("Complete the question paths before running.", true);
    if (!modelReady) return status("Configure a Paratera model on the server first.", true);
    stopRef.current = false; setBusy("Running AI personas"); status("");
    try {
      let processed = 0;
      let waitingUntil: string | null = null;
      for (const persona of personas) {
        if (stopRef.current || processed >= limit) break;
        const runProtocol = !honorWaveGap ? { ...protocol, waveGapDays: null } : protocol;
        const upcoming = nextTask(runProtocol, persona, trialsRef.current.filter((t) => t.runId === runId));
        if (!upcoming) continue;
        if (upcoming.availableAt) { if (!waitingUntil || upcoming.availableAt < waitingUntil) waitingUntil = upcoming.availableAt; continue; }
        processed++;
        let calls = 0;
        while (!stopRef.current) {
          const task = nextTask(runProtocol, persona, trialsRef.current.filter((t) => t.runId === runId));
          if (!task) break;
          if (task.availableAt) { if (!waitingUntil || task.availableAt < waitingUntil) waitingUntil = task.availableAt; break; }
          if (++calls > 100) throw new Error(`Question routing exceeded 100 steps for ${persona.id}; check the protocol for a loop.`);
          const ownWave = trialsRef.current.filter((t) => t.runId === runId && t.personaId === persona.id && t.wave === task.condition.wave);
          const history = ownWave.map((t) => `${t.prompt}\nCHOICE: ${t.choice}`);
          const prompt = renderPrompt(task.node.prompt, persona);
          const options = task.node.options.map((o) => ({ id: o.id, text: renderPrompt(o.text, persona) }));
          const scenario = { ...(task.condition.parameters || {}), ...(task.node.amount != null ? { offer_amount: task.node.amount } : {}), ...(task.node.valuationGroup ? { valuation_group: task.node.valuationGroup } : {}), ...(protocol.instrumentSpec ? { lump_sum: task.node.amount || 0, starting_value: persona.fields.ls_startvalue, monthly_benefit: persona.fields.benefit_monthly } : {}) };
          const defaultOptionId = task.condition.defaultOptionId || null;
          setBusy(`Running ${persona.id}: ${task.condition.label}, question ${calls}`);
          const answer = await api({ action: "respond", provider, thinking, system: `Persona ${persona.id}. Attributes: ${JSON.stringify(persona.fields)}. These attributes are randomly drawn synthetic values, not observed participant records; use them as preference tendencies. Do not claim to be an original human participant.`, prompt, options, scenario, defaultOptionId, history });
          if (!answer.choice || !answer.raw || !answer.model) throw new Error("The model response is incomplete.");
          const trial: Trial = { runId, personaId: persona.id, armId: persona.armId, conditionId: task.condition.id, nodeId: task.node.id, wave: task.condition.wave, prompt, options, scenario, defaultOptionId, choice: answer.choice, rawResponse: answer.raw, model: answer.model, at: new Date().toISOString() };
          await saveTrial(`${runId}:${trial.personaId}:${trial.nodeId}:${trialsRef.current.length}`, trial);
          trialsRef.current = [...trialsRef.current, trial]; setTrials(trialsRef.current);
        }
      }
      status(stopRef.current ? "Run paused. Saved choices will be used when you resume." : waitingUntil ? `Current waves saved. The next wave opens ${new Date(waitingUntil).toLocaleString()}.` : "Selected personas finished. Open Experiment results to see them.");
    } catch (e) { status(`${errorText(e)} Saved choices are available; you can resume.`, true); }
    finally { setBusy(""); }
  }

  const sourceComplete = extractionReady && !!parsed.protocol && !compiling;
  const visibleStudyGuide = language === "zh" ? isChineseGuide(chineseStudyGuide) ? chineseStudyGuide : null : studyGuide;
  const hasVerifiedInstrument = sources.some((source) => /Online Appendix B[\s\S]{0,100}Survey Instrument/i.test(source.text) && /LS_LOW/.test(source.text) && /LS_MED/.test(source.text));
  const columns = parsed.protocol && personas.length ? personaColumns(parsed.protocol, personas) : [];
  const personaPageCount = Math.ceil(personas.length / 50);
  const currentPersonaPage = Math.min(personaPage, Math.max(0, personaPageCount - 1));
  const visiblePersonas = personas.slice(currentPersonaPage * 50, (currentPersonaPage + 1) * 50);
  const runFinished = !!runProgress?.total && runProgress.completed === runProgress.total;
  const hasResults = !!report && (report.trials > 0 || report.outcomes.some((outcome) => outcome.value != null));
  const resultTables = useMemo(() => parsed.protocol && report ? aiResultTables(parsed.protocol, report.outcomes) : [], [parsed.protocol, report]);
  const exhibits = useMemo(() => sourceExhibits(sources, mainSourceName), [sources, mainSourceName]);
  const comparison = useMemo(() => report ? comparisonRows(report.outcomes, parsed.protocol) : [], [report, parsed.protocol]);
  const comparisonStats = useMemo(() => agreementSummary(comparison), [comparison]);
  const mechanicalSummary = useMemo(() => parsed.protocol && report ? executiveSummary(parsed.protocol, comparison, personas.length, report.trials) : "", [parsed.protocol, report, comparison, personas.length]);
  const tabUnlocked = [
    true,
    sourceComplete,
    sourceComplete && (studyRead || personas.length > 0),
    sourceComplete && (protocolReviewed || personas.length > 0),
    sourceComplete && personas.length > 0,
    sourceComplete && personas.length > 0 && (busy.startsWith("Running") || activeTrials.length > 0),
    sourceComplete && personas.length > 0 && (busy.startsWith("Running") || activeTrials.length > 0),
  ];
  const visibleSection = tabUnlocked[activeSection] ? activeSection : Math.max(0, tabUnlocked.findLastIndex(Boolean));
  const openTab = (index: number) => { if (tabUnlocked[index]) { setActiveSection(index); window.scrollTo({ top: 0, behavior: "smooth" }); } };
  useEffect(() => {
    const sourceGuide = chineseStudyGuide || studyGuide;
    if (language !== "zh" || !loaded || !sourceComplete || visibleSection !== 1 || !!busy || !modelReady || !sourceGuide || isChineseGuide(chineseStudyGuide)) return;
    const signature = JSON.stringify(sourceGuide);
    if (attemptedGuideTranslation.current === signature) return;
    attemptedGuideTranslation.current = signature;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setTranslatingGuide(true); });
    void api({ action: "translate_study_guide", provider, thinking, guide: sourceGuide }).then((answer) => {
      if (!answer.guide) throw new Error("No Chinese study guide was returned.");
      if (!cancelled) setChineseStudyGuide(answer.guide);
    }).catch((reason) => {
      if (!cancelled) status(`Chinese study guide could not be generated: ${errorText(reason)}`, true);
    }).finally(() => { if (!cancelled) setTranslatingGuide(false); });
    return () => { cancelled = true; if (attemptedGuideTranslation.current === signature) attemptedGuideTranslation.current = ""; };
  }, [language, loaded, sourceComplete, visibleSection, busy, modelReady, chineseStudyGuide, studyGuide, provider, thinking]);

  async function writeSynthesis() {
    if (!parsed.protocol || !comparison.length) return;
    setBusy("Writing the comparison"); status("");
    try {
      const answer = await api({ action: "synthesis", provider, thinking, title: parsed.protocol.title, rows: comparison.map(({ label, ai, published, difference, observations, agreement }) => ({ label, ai, published, difference, observations, agreement })), limits: fidelityWarnings, fallbackSummary: mechanicalSummary });
      if (!answer.summary || !answer.detail) throw new Error("The comparison was incomplete.");
      setSynthesis({ summary: answer.summary, detail: answer.detail });
      status("Comparison written.");
    } catch (e) { status(errorText(e), true); } finally { setBusy(""); }
  }
  function downloadAiReport() {
    if (!parsed.protocol || !report) return;
    const blocks = aiReportBlocks(parsed.protocol, resultTables, personas.length, report.trials, fidelityWarnings);
    download(`${fileStem(parsed.protocol.title)}-ai-results.pdf`, buildPdf(blocks, { title: "AI replication results", subtitle: `${parsed.protocol.title} · generated ${new Date().toLocaleString()}` }));
  }
  function downloadComparisonReport() {
    if (!parsed.protocol) return;
    const blocks = comparisonReportBlocks(parsed.protocol, comparison, synthesis?.summary || mechanicalSummary, synthesis?.detail || [], fidelityWarnings);
    download(`${fileStem(parsed.protocol.title)}-ai-vs-published.pdf`, buildPdf(blocks, { title: "AI replication compared with the published study", subtitle: `${parsed.protocol.title} · generated ${new Date().toLocaleString()}` }));
  }

  const streamCard = (stream: Stream, label: string, fileCount: number, disabled: boolean) => {
    const state = streams[stream];
    return <div className="extract-stream" key={stream}>
      <div className="extract-stream-head">
        <strong>{t(label)}</strong>
        <span>{state.done ? t("Read") : state.running ? t("Reading") : state.error ? t("Paused") : fileCount ? t("Not read yet") : t("No file")}</span>
      </div>
      <Button variant={state.done ? "outline" : "default"} disabled={disabled || !fileCount || state.running} onClick={() => void extractStream(stream)}>
        {state.running ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}
        {state.done ? t("Read again") : stream === "main" ? t("Extract main paper") : t("Extract additional resources")}
      </Button>
      {(state.running || state.done || state.error) && <ProgressBar label={t(label)} completed={state.completed} total={state.total || 1} detail={state.error || displayReading(language, state.detail)} active={state.running} />}
    </div>;
  };

  return <main className="studio experiment-shell workflow-shell"><div className="content experiment-page">
    <nav className="topbar" aria-label={t("Workspace links")}><Link className="reprise-wordmark" href="/about" aria-label="About Reprise">REPRISE</Link><div className="topbar-actions"><div className="language-toggle" role="group" aria-label="Language / 语言"><button type="button" className={language === "en" ? "active" : ""} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button><button type="button" className={language === "zh" ? "active" : ""} aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>简体中文</button></div></div></nav>
    <nav className="phase-tabs" role="tablist" aria-label={t("Experiment phases")}>{sectionNames.map((name, index) => <button key={name} type="button" role="tab" id={`phase-tab-${index + 1}`} aria-controls={`step-${String(index + 1).padStart(2, "0")}`} aria-selected={visibleSection === index} disabled={!tabUnlocked[index]} className={visibleSection === index ? "active" : ""} onClick={() => openTab(index)}><span className="phase-number">{String(index + 1).padStart(2, "0")}</span><span>{t(name)}</span>{!tabUnlocked[index] && <span className="sr-only">{t("Locked")}</span>}</button>)}</nav>
    {message && <div className={`status-toast ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{displayStatus(language, message)}</div>}
    <div className="experiment-grid">
      <section id="step-01" role="tabpanel" aria-labelledby="phase-tab-1" hidden={visibleSection !== 0} className="panel experiment-panel"><div className="step-label"><span>01</span> {t("Source materials")}</div>
        <div className="source-upload-group"><strong>{t("Main paper")} <span>{t("Required")}</span></strong><p>{t("Upload the study paper before extracting experiment rules.")}</p><input ref={mainFileRef} className="sr-only" type="file" accept=".pdf,.txt,.md" onChange={(e) => { void addFiles(e.target.files, "main"); e.target.value = ""; }} /><Button variant="outline" disabled={!!busy || anyStreamRunning} onClick={() => mainFileRef.current?.click()}><Paperclip size={16} /> {mainSourceName ? t("Replace main paper") : t("Upload main paper")}</Button></div>
        {mainSourceName && sources.filter((source) => source.name === mainSourceName).map((source) => <div className="source-list source-main-list" key={source.name}><div><FileText size={15} aria-hidden="true" /><span title={source.name}>{source.name}</span><small>{language === "zh" ? `约 ${Math.round(source.text.length / 1000)} 千字` : `${Math.round(source.text.length / 1000)}k chars`}</small><button type="button" className="source-remove" disabled={!!busy || anyStreamRunning} onClick={() => void removeFile(source.name)} aria-label={`${t("Remove file")}: ${source.name}`}><Trash2 size={15} aria-hidden="true" /><span>{t("Remove")}</span></button></div></div>)}
        <div className="source-upload-group"><strong>{t("Additional resources")} <span>{t("Optional")}</span></strong><p>{t("Add an appendix, questionnaire, or other supplementary material.")}</p><input ref={supplementaryFileRef} className="sr-only" type="file" multiple accept=".pdf,.txt,.md" onChange={(e) => { void addFiles(e.target.files, "supplementary"); e.target.value = ""; }} /><Button variant="outline" disabled={!!busy || anyStreamRunning || !mainSourceName} onClick={() => supplementaryFileRef.current?.click()}><Paperclip size={16} /> {t("Upload additional resources")}</Button></div>
        {readingProgress && <ProgressBar label={t("Reading uploaded files")} completed={readingProgress.completed} total={readingProgress.total} detail={displayReading(language, readingProgress.detail)} active={busy === "Reading sources"} />}
        {!!extraSources.length && <div className="source-list">{extraSources.map((source) => <div key={source.name}><FileText size={15} aria-hidden="true" /><span title={source.name}>{source.name}</span><small>{language === "zh" ? `约 ${Math.round(source.text.length / 1000)} 千字` : `${Math.round(source.text.length / 1000)}k chars`}</small><button type="button" className="source-remove" disabled={!!busy || anyStreamRunning} onClick={() => void removeFile(source.name)} aria-label={`${t("Remove file")}: ${source.name}`}><Trash2 size={15} aria-hidden="true" /><span>{t("Remove")}</span></button></div>)}</div>}
        <div className="model-grid"><div><label htmlFor="provider">{t("MODEL / MODEL ID")}</label><NativeSelect id="provider" className="wide-select" value={provider} onChange={(e) => setProvider(e.target.value as Provider)}><NativeSelectOption value="qwen">Qwen · {connection.models.qwen[thinking ? "thinking" : "nonThinking"] || t("ID unavailable")}</NativeSelectOption><NativeSelectOption value="deepseek">DeepSeek · {connection.models.deepseek[thinking ? "thinking" : "nonThinking"] || t("ID unavailable")}</NativeSelectOption></NativeSelect></div><div><label htmlFor="mode">{t("MODE")}</label><NativeSelect id="mode" className="wide-select" value={thinking ? "thinking" : "plain"} onChange={(e) => setThinking(e.target.value === "thinking")}><NativeSelectOption value="plain">{t("Non-thinking")}</NativeSelectOption><NativeSelectOption value="thinking">{t("Thinking")}</NativeSelectOption></NativeSelect></div></div>
        <p className="inline-note">{t("The paper and its additional resources are read separately and can run at the same time. The study protocol is built automatically once both are read.")}</p>
        <div className="extract-streams">
          {streamCard("main", "Main paper", mainSourceName ? 1 : 0, !!busy || (!hasVerifiedInstrument && !modelReady))}
          {streamCard("extra", "Additional resources", extraSources.length, !!busy || (!hasVerifiedInstrument && !modelReady))}
        </div>
        {hasExtractionCheckpoint && !compiling && !sourceComplete && <Button className="wide-button" variant="outline" disabled={!!busy || anyStreamRunning} onClick={() => void compileProtocol()}>{t("Resume extraction")}</Button>}
        {sourceComplete && <div className="source-actions"><Button className="phase-next" variant="outline" onClick={() => openTab(1)}> {t("Continue to study summary")} <ArrowRight size={16} /></Button></div>}
        {extractionFailure && <div className="extraction-failure" role="alert"><strong>{t("Extraction paused")}</strong><p>{extractionFailure}</p><p>{t("Select Resume extraction to retry this step. Earlier completed steps are saved in this browser.")}</p>{hasExtractionCheckpoint && <Button variant="outline" onClick={() => void reviewIncompleteExtraction()}>{t("Review incomplete protocol")}</Button>}</div>}
        {extractionProgress && <ProgressBar label={t("Building the study protocol")} completed={extractionProgress.completed} total={extractionProgress.total} detail={language === "zh" ? `${compiling && busy ? `${displayBusy(language, busy)} · ` : ""}已完成 ${extractionProgress.completed} / ${extractionProgress.total} 步${extractionSearchMode ? ` · 资料检索：${extractionSearchMode}` : ""}` : `${compiling && busy ? `${busy} · ` : ""}${extractionProgress.completed} of ${extractionProgress.total} steps complete${extractionSearchMode ? ` · Source search: ${extractionSearchMode}` : ""}`} active={compiling} />}
        {!modelReady && <p className="inline-note">{hasVerifiedInstrument ? "A verified survey instrument was detected and can be converted without a model. A Paratera model is still required to run AI personas." : t("Set the Paratera key and selected model ID in server settings.")}</p>}
      </section>
      {sourceComplete && <>
      <section id="step-02" role="tabpanel" aria-labelledby="phase-tab-2" hidden={visibleSection !== 1} className="panel experiment-panel"><div className="step-label"><span>02</span> {t("Read the study")}</div>
        {visibleStudyGuide ? <div className="study-guide"><p className="study-headline">{visibleStudyGuide.headline}</p>{visibleStudyGuide.sections.map((section, index) => <article className="study-section" key={`${section.title}-${index}`}><h3>{section.title}</h3><p>{section.explanation}</p><small>{sourceQuoteMatches(section.evidence, sources) ? `${section.evidence.source}${sourceQuotePage(section.evidence, sources) ? language === "zh" ? `，第 ${sourceQuotePage(section.evidence, sources)} 页` : `, p. ${sourceQuotePage(section.evidence, sources)}` : ""} · “${section.evidence.quote}”` : `${t("Source quote needs review")} · ${section.evidence.source}`}</small></article>)}</div>
          : <div className="empty-result">{busy === "Writing the plain-language explanation" || busy === "Writing the study guide" ? t("Writing the plain-language explanation of the paper…") : translatingGuide ? "正在生成中文研究导读…" : language === "zh" ? modelReady ? "中文研究导读尚未生成。请点击下方按钮生成。" : "中文研究导读尚未生成。" : t("A plain-language explanation of the paper will appear here after extraction. Select Create study guide if it is not shown.")}</div>}
        {language === "zh" && !visibleStudyGuide && !connection.connected && <p className="inline-note">请先连接模型，以生成中文研究导读。</p>}
        {!!notes && <Button className="guide-button" variant="outline" disabled={!!busy || translatingGuide || !modelReady} onClick={() => void createStudyGuide()}>{busy === "Writing the study guide" ? <LoaderCircle className="spin" size={16} /> : null} {language === "zh" && !visibleStudyGuide ? "生成中文研究导读" : visibleStudyGuide ? t("Refresh study guide") : t("Create study guide")}</Button>}
        <Button className="phase-next" variant="outline" onClick={() => { setStudyRead(true); setActiveSection(2); window.scrollTo({ top: 0, behavior: "smooth" }); }}> {t("Continue to protocol")} <ArrowRight size={16} /></Button>
      </section>
      <section id="step-03" role="tabpanel" aria-labelledby="phase-tab-3" hidden={visibleSection !== 2} className="panel experiment-panel"><div className="step-label"><span>03</span> {t("Protocol & evidence")}</div>
        {parsed.protocol ? <div className="protocol-list">
          <div className="protocol-item"><strong>{t("Respondents")}</strong><span>{parsed.protocol.sampleSize?.toLocaleString() || t("Not found")}</span></div>
          <div className="protocol-item"><strong>{t("Conditions")}</strong><ul>{parsed.protocol.conditions.map((c) => <li key={c.id}>{studyLabel(language, c.label)} <small>· {language === "zh" ? `第 ${c.wave} 轮` : `wave ${c.wave}`}</small></li>)}</ul></div>
          {!!parsed.protocol.designRequirements?.length && <div className="protocol-item"><strong>{t("Required study stages")}</strong><ul>{parsed.protocol.designRequirements.map((requirement) => <li key={requirement.stage}>{studyLabel(language, requirement.stage)}: {requirement.decisionsPerArm} {t("decisions per arm")}{requirement.optionsPerDecision ? ` · ${requirement.optionsPerDecision} ${t("choices per decision")}` : ""}{requirement.requiredParameterKeys?.length ? ` · ${requirement.requiredParameterKeys.join(", ")}` : ""}</li>)}</ul></div>}
          {!!parsed.protocol.conditions.some((condition) => condition.defaultOptionId || Object.keys(condition.parameters || {}).length) && <details className="protocol-details"><summary>{t("Scenario parameters and defaults")}</summary><ul>{parsed.protocol.conditions.map((condition) => <li key={condition.id}><strong>{studyLabel(language, condition.label)}</strong>: {Object.entries(condition.parameters || {}).map(([key, value]) => `${key} ${value}`).join(" · ") || t("No parameters")} · {t("Default")}: {condition.defaultOptionId || t("None")}</li>)}</ul></details>}
          <div className="protocol-item"><strong>{t("Assignment")}</strong><ul>{parsed.protocol.arms.map((a) => <li key={a.id}>{studyLabel(language, a.label)}: {a.conditionOrder.join(" → ")}</li>)}</ul></div>
          <div className="protocol-item"><strong>{t("Wave gap")}</strong><span>{parsed.protocol.waveGapDays == null ? t("Not stated") : language === "zh" ? `${parsed.protocol.waveGapDays} 天` : `${parsed.protocol.waveGapDays} days`}</span></div>
          <div className="protocol-item"><strong>{t("Persona attributes")}</strong><span>{[...parsed.protocol.personaFields.map((f) => f.key), ...(parsed.protocol.simulatedFields || []).map((f) => f.key), ...(parsed.protocol.requiredNumericFields || []).map((f) => f.key)].join(", ") || t("Not found")}</span></div>
          <div className="protocol-item"><strong>{t("Outcome rules")}</strong><ul>{parsed.protocol.analysisRules.map((r) => <li key={r.id}>{studyLabel(language, r.label)} <small>· {parsed.protocol!.benchmarks.some((b) => b.ruleId === r.id) ? t("published value matched") : t("no published value yet")}</small></li>)}</ul></div>
          <details className="protocol-details"><summary>{t("Questions and branching")} ({parsed.protocol.nodes.length})</summary><ol>{parsed.protocol.nodes.map((n) => <li key={n.id}><strong>{n.id}</strong>：{n.prompt}</li>)}</ol></details>
        </div> : <div className="empty-result">{t("Extract the study to see respondents, conditions, questions, and rules here.")}</div>}
        {parsed.syntaxError && <p className="issue">JSON: {parsed.syntaxError}</p>}
        {!!parsed.protocol && <div className="audit-summary">
          {hasVerifiedInstrument && !!runBlockers.length && <Button variant="outline" disabled={!!busy} onClick={() => void rebuildInstrument()}>{language === "zh" ? "从已核验问卷重建" : "Rebuild from the verified survey instrument"}</Button>}
          {parsed.protocol.analysisRules.some((rule) => !parsed.protocol!.benchmarks.some((benchmark) => benchmark.ruleId === rule.id)) && <div className="source-recheck"><div><strong>{t("Published values")}</strong><p>{parsed.protocol.instrumentSpec?.kind === "brown-annuity-2017" && parsed.protocol.benchmarks.length ? (language === "zh" ? "论文中可直接对应的中位数、价差均值和附录 A.3 相关系数已关联。其余 AI 指标没有可直接对应的已发表数值。" : "The paper's matching medians, mean spread, and Appendix A.3 correlations are linked. The remaining AI measures have no directly matching published value.") : t("Some calculated measures have no published value extracted yet. Search the uploaded paper's result tables again.")}</p></div>{parsed.protocol.instrumentSpec?.kind !== "brown-annuity-2017" && <Button variant="outline" disabled={!!busy || !modelReady} onClick={() => void findPublishedValues()}>{busy === "Searching the paper for published values" ? <LoaderCircle className="spin" size={16} /> : null} {t("Find published values")}</Button>}</div>}
          {!!issueCards.length && <div className="source-recheck"><div><strong>{t("Appendix or supplementary resources")}</strong><p>{t("Upload missing material, then recheck the existing protocol against all sources.")}</p><input ref={recheckFileRef} className="sr-only" type="file" multiple accept=".pdf,.txt,.md" onChange={(e) => { void addFiles(e.target.files, "supplementary", true); e.target.value = ""; }} /><Button variant="outline" disabled={!!busy} onClick={() => recheckFileRef.current?.click()}><Paperclip size={16} /> {t("Upload appendix / supplementary resources")}</Button></div><Button variant="outline" disabled={!!busy || !modelReady} onClick={() => void recheckWithSources()}>{busy === "Searching source passages" ? <LoaderCircle className="spin" size={16} /> : null } {t("Recheck")}</Button></div>}
          {repairReport && <div className="repair-report" role="status"><strong>{t("Source recheck")}</strong><p>{repairReport.note}</p>{repairReport.validationDetail && <p>{repairReport.validationDetail}</p>}<small>{language === "zh" ? "检索" : "Search"}: {repairReport.mode}{repairReport.retrievalWarning ? ` · ${repairReport.retrievalWarning}` : ""}</small>
            {!!repairReport.findings.length && <details><summary>{t("What the source search found")}</summary><ul>{repairReport.findings.map((finding, index) => <li key={`${finding.issue}-${index}`}><strong>{displayAudit(language, finding.issue)}</strong><span>{t(reviewFindingKind(finding.issue))}</span><p>{finding.explanation}</p>{finding.citationVerified && <small>{finding.source}: “{finding.quote}”</small>}</li>)}</ul></details>}
            {!!repairReport.passages.length && <details><summary>{t("Retrieved source passages")}</summary><ul>{repairReport.passages.map((passage, index) => <li key={`${passage.source}-${passage.page}-${index}`}><strong>{passage.source}{passage.page ? language === "zh" ? `，PDF 第 ${passage.page} 页` : `, PDF page ${passage.page}` : ""}</strong><p>{passage.excerpt}…</p></li>)}</ul></details>}
            {repairReport.protocol && <Button className="apply-repair" onClick={() => void applyRetrievedRepair()}>{t("Apply proposed repairs")}</Button>}
          </div>}
          <p>{t("Review the findings below. Add a source-backed correction where the extracted protocol is wrong; runner limitations do not need a paper correction.")}</p>
          {!!requiredCards.length && <details className="blocker-group"><summary>{t("Checks needed to run")} ({requiredCards.length})</summary><div className="correction-list">{requiredCards.map(({ message, level }, index) => <CorrectionCard key={message} issue={message} level={level} index={index} draft={correctionDrafts[message]} sources={sources} language={language} onChange={(patch) => updateCorrection(message, patch)} />)}</div></details>}
          {!requiredCards.length && <p className="audit-ready-note">{t("Persona generation and the executable path have no blocking checks.")}</p>}
          {!!fidelityWarnings.length && <p className="inline-note">{language === "zh" ? `有 ${fidelityWarnings.length} 项与论文设计不一致，但不会阻止运行。结果会一并标注。` : `${fidelityWarnings.length} difference${fidelityWarnings.length === 1 ? "" : "s"} from the reported design ${fidelityWarnings.length === 1 ? "was" : "were"} found. These do not block the run; they are reported beside the results.`}</p>}
          {!!reviewCards.length && <details className="audit-details source-review"><summary>{t("Review findings")} ({reviewCards.length})</summary><div className="correction-list">{reviewCards.map(({ message, level }, index) => <CorrectionCard key={message} issue={message} level={level} index={requiredCards.length + index} draft={correctionDrafts[message]} sources={sources} language={language} onChange={(patch) => updateCorrection(message, patch)} />)}</div></details>}
          {!!issueCards.length && <Button className="apply-corrections" disabled={!completedCorrections || !!busy || !modelReady} onClick={() => void applyCorrections()}>{busy === "Applying source corrections" ? <LoaderCircle className="spin" size={16} /> : null} {language === "zh" ? `应用 ${completedCorrections} 项修正并重新核对` : `Apply ${completedCorrections} correction${completedCorrections === 1 ? "" : "s"} and recheck`}</Button>}
        </div>}
        {!!protocolJson && <details className="protocol-details"><summary>{t("Advanced: view or edit extracted JSON")}</summary><textarea className="protocol-editor" spellCheck={false} value={protocolJson} disabled={!!busy} onChange={(e) => { setProtocolJson(e.target.value); setRepairReport(null); setProtocolReviewed(false); if (personas.length || trials.length) { setPersonas([]); setTrials([]); trialsRef.current = []; void clearTrials(); } }} placeholder={t("The extracted protocol will appear here.")} aria-label={t("Experiment protocol JSON")} /></details>}
        <Button className="phase-next" variant="outline" disabled={!parsed.protocol || !!personaBlockers.length} onClick={() => { setProtocolReviewed(true); setActiveSection(3); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("Continue to AI personas")} <ArrowRight size={16} /></Button>
      </section>
      <section id="step-04" role="tabpanel" aria-labelledby="phase-tab-4" hidden={visibleSection !== 3} className="panel experiment-panel"><div className="step-label"><span>04</span> {t("AI personas")}</div>
        <label htmlFor="count">{t("NUMBER OF AI PERSONAS")}</label><Input id="count" type="number" min={1} max={10000} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        <p className="inline-note">{t("Every other attribute is drawn at random for each persona, inside the range the study supports and the range the attribute can plausibly take. Nothing here is a fixed scenario shared by the whole sample.")}</p>
        {!!parsed.protocol && !!(parsed.protocol.personaFields.length || parsed.protocol.simulatedFields?.length || parsed.protocol.requiredNumericFields?.length) && <details className="protocol-details"><summary>{t("Randomized attributes read from the study")} ({parsed.protocol.personaFields.length + (parsed.protocol.simulatedFields?.length || 0) + (parsed.protocol.requiredNumericFields?.length || 0)})</summary><ul>
          {parsed.protocol.personaFields.map((field) => <li key={field.key}><strong>{field.key}</strong> · {t("one of")} {field.values.map((value) => value.value).join(", ") || t("no listed values")}</li>)}
          {(parsed.protocol.simulatedFields || []).map((field) => <li key={field.key}><strong>{field.key}</strong> · {t("sampled around the reported mean")} {field.mean} (SD {field.sd}), {field.min}–{field.max}</li>)}
          {(parsed.protocol.requiredNumericFields || []).map((field) => <li key={field.key}><strong>{field.key}</strong> · {t("drawn uniformly")} {field.min ?? "?"}–{field.max ?? "?"}{field.note ? ` · ${field.note}` : ""}</li>)}
        </ul></details>}
        <Button className="wide-button" disabled={!parsed.protocol || !!personaBlockers.length || !!busy} aria-describedby={parsed.protocol && personaBlockers.length ? "persona-block-reason" : undefined} onClick={() => void makePersonas()}>{personas.length ? t("Generate a new random sample") : t("Generate personas")}</Button>
        {!!parsed.protocol && !!personaBlockers.length && <div className="blocked-step" id="persona-block-reason" role="status"><strong>{t("Assignment needs repair")}</strong><p>{personaBlockers.map((item) => displayAudit(language, item)).join(" ")}</p></div>}
        {!!parsed.protocol && !personaBlockers.length && <p className="inline-note">{language === "zh" ? `论文报告了 ${parsed.protocol.sampleSize?.toLocaleString() || "若干"} 名参与者，但没有提供个人资料。AI 模拟受访者是随机生成的合成数据。` : `The paper reports ${parsed.protocol.sampleSize?.toLocaleString() || "a sample"} participants but does not supply those individuals' profiles. These personas are randomly generated synthetic respondents.`}</p>}
        {!!parsed.protocol?.simulatedFields?.length && <p className="inline-note">{t("Simulated traits use reported aggregate statistics and an explicit distribution assumption, not original participant records.")} {parsed.protocol.simulatedFields.map((field) => `${field.key}: ${field.assumption}`).join(" · ")}</p>}
        {!!personas.length && !!parsed.protocol && <div className="persona-preview"><div className="persona-preview-heading"><div><strong>{language === "zh" ? `${personas.length.toLocaleString()} 名 AI 模拟受访者已生成` : `${personas.length.toLocaleString()} AI personas ready`}</strong><p>{language === "zh" ? `${columns.length} 列 · 分组和研究属性` : `${columns.length} columns · assignment and study-specific attributes`}</p></div><Button variant="outline" onClick={() => download("ai-personas.csv", personasToCsv(parsed.protocol!, personas), "text/csv")}><Download size={15} /> {t("Export CSV for Excel")}</Button></div>
          <p className="persona-attribute-note">{t("Fields such as name, age, or gender appear only when the study provides usable values. Missing respondent details are left blank rather than invented.")}</p>
          <div className="persona-table-scroll"><table className="persona-table"><thead><tr>{columns.map((column) => <th scope="col" key={column.key}>{t(column.label)}</th>)}</tr></thead><tbody>{visiblePersonas.map((persona) => <tr key={persona.id}>{columns.map((column) => <td key={column.key}>{personaCell(parsed.protocol!, persona, column) || (language === "zh" ? "未提供" : "—")}</td>)}</tr>)}</tbody></table></div>
          {personaPageCount > 1 && <div className="persona-pagination"><span>{language === "zh" ? `第 ${currentPersonaPage * 50 + 1} 至 ${Math.min((currentPersonaPage + 1) * 50, personas.length)} 行，共 ${personas.length.toLocaleString()} 行` : `Rows ${currentPersonaPage * 50 + 1}–${Math.min((currentPersonaPage + 1) * 50, personas.length)} of ${personas.length.toLocaleString()}`}</span><div><Button variant="outline" disabled={currentPersonaPage === 0} onClick={() => setPersonaPage(currentPersonaPage - 1)}>{t("Previous")}</Button><Button variant="outline" disabled={currentPersonaPage >= personaPageCount - 1} onClick={() => setPersonaPage(currentPersonaPage + 1)}>{t("Next")}</Button></div></div>}
        </div>}
        {!!personas.length && <Button className="phase-next" variant="outline" onClick={() => openTab(4)}>{t("Continue to experiment run")} <ArrowRight size={16} /></Button>}
      </section>
      <section id="step-05" role="tabpanel" aria-labelledby="phase-tab-5" hidden={visibleSection !== 4} className="panel experiment-panel"><div className="step-label"><span>05</span> {t("Experiment run")}</div>
        {!!parsed.protocol?.conditions.some((condition) => condition.wave > 1) && parsed.protocol.waveGapDays != null && <label className="inline-note"><input type="checkbox" checked={honorWaveGap} onChange={(event) => setHonorWaveGap(event.target.checked)} /> {language === "zh" ? `按论文的 ${parsed.protocol.waveGapDays} 天间隔运行后续轮次。不勾选则在本次会话内连续完成。` : `Wait the study's ${parsed.protocol.waveGapDays} days between waves. Leave unchecked to complete an AI pilot in one session.`}</label>}
        <div className="run-controls">{busy.startsWith("Running") ? <Button variant="outline" onClick={() => { stopRef.current = true; }}><Square size={14} /> {t("Pause run")}</Button> : <Button disabled={!personas.length || !!runBlockers.length || !!busy || !modelReady || (runProgress?.total ? runProgress.completed === runProgress.total : false)} onClick={() => void run(Infinity)}><Play size={16} /> {runProgress?.total && runProgress.completed === runProgress.total ? t("Experiment complete") : activeTrials.length ? t("Continue experiment") : warnings.length ? t("Start exploratory pilot") : t("Start experiment")}</Button>}</div>
        {!!personas.length && !!runBlockers.length && <p className="inline-note">{t("The run needs valid question paths. See the run blockers in Protocol & evidence.")}</p>}
        {!!personas.length && !runBlockers.length && !!warnings.length && <p className="inline-note">{language === "zh" ? "探索性试运行：请核对待审查的发现。结果不能称为准确复现。" : "Exploratory pilot: review the findings. Results must not be described as an exact replication."}</p>}
        {personasHaveNoAttributes && <p className="inline-note">{t("The paper provides no individual profiles for these personas. Repeated identical questions may produce identical AI choices.")}</p>}
        <div className="run-stats"><div><strong>{report?.completedPersonas || 0}</strong><span>{t("completed")}</span></div><div><strong>{personas.length}</strong><span>{t("generated")}</span></div><div><strong>{report?.trials || 0}</strong><span>{t("choices saved")}</span></div></div>
        {!!runProgress?.total && <ProgressBar label={t("Experiment progress")} completed={runProgress.completed} total={runProgress.total} detail={language === "zh" ? `已完成 ${runProgress.completed} / ${runProgress.total} 条已提取的实验路径。` : `${runProgress.completed} of ${runProgress.total} extracted condition paths complete.`} active={busy.startsWith("Running")} />}
        {busy.startsWith("Running") && <p className="inline-note"><LoaderCircle className="spin" size={14} /> {displayBusy(language, busy)}</p>}
        {!!parsed.protocol && parsed.protocol.conditions.some((c) => c.wave > 1) && <p className="inline-note">{!honorWaveGap ? t("Later waves follow earlier ones in this session.") : parsed.protocol.waveGapDays == null
          ? t("No interval is recorded for the later stage. It will run after the earlier stage finishes, without a scheduled delay.")
          : language === "zh" ? `后续轮次将在 ${parsed.protocol.waveGapDays} 天后开放。届时重新打开页面即可继续。` : `Later waves open after ${parsed.protocol.waveGapDays} days. Reopen this page to resume.`}</p>}
        {(busy.startsWith("Running") || activeTrials.length > 0) && <Button className="phase-next" variant="outline" onClick={() => openTab(5)}>{t("See experiment results")} <ArrowRight size={16} /></Button>}
      </section>
      <section id="step-06" role="tabpanel" aria-labelledby="phase-tab-6" hidden={visibleSection !== 5} className="panel results-panel"><div className="step-label"><span>06</span> {t("Experiment results")}</div>
        <p className="inline-note">{parsed.protocol?.resultTables?.length
          ? (language === "zh" ? "下表按论文自身的结果表格布局呈现 AI 复现结果。" : "The AI run's results, laid out the way the paper lays out its own results.")
          : (language === "zh" ? "论文的表格布局未能提取，结果按研究阶段分组显示。" : "The paper's own table layout was not extracted, so results are grouped by study stage.")}</p>
        {!runFinished && hasResults && <p className="inline-note">{t("Live simulation: results update as choices are saved.")}</p>}
        {!!exhibits.length && <details className="protocol-details exhibit-inventory" open><summary>{language === "zh" ? `上传资料中的表格与图形（${exhibits.length}）` : `Tables and figures in the uploaded sources (${exhibits.length})`}</summary>
          <p className="inline-note">{language === "zh" ? "此目录列出资料中实际找到的每张表和图。只有能从本次 AI 选择计算的项目才会显示 AI 数值。" : "This lists every caption found in the uploaded files. An AI result appears only where this run can calculate that measure."}</p>
          <ul>{exhibits.map((exhibit) => {
            const aiTable = exhibit.kind === "Table" && resultTables.some((table) => table.title.toLowerCase().includes(`${exhibit.kind} ${exhibit.number}`.toLowerCase()) && table.rows.some((row) => row.values.some((value) => value !== "—")));
            const aiFigure = exhibit.kind === "Figure" && exhibit.main && !!parsed.protocol?.instrumentSpec && ["1", "2"].includes(exhibit.number);
            const aiMeasure = exhibit.kind === "Table" && report?.outcomes.some((outcome) => outcome.value != null && outcome.label.toLowerCase().includes(`${exhibit.kind} ${exhibit.number}`.toLowerCase()));
            const availability = aiTable || aiFigure ? (language === "zh" ? "下方显示 AI 版本" : "AI version below") : aiMeasure ? (language === "zh" ? "下方显示部分 AI 指标" : "Partial AI measure below") : (language === "zh" ? "尚无可计算的 AI 版本" : "No executable AI equivalent");
            return <li key={exhibit.id}><strong>{exhibit.title}</strong><span> · {exhibit.source}{exhibit.page ? `, PDF p. ${exhibit.page}` : ""} · {availability}</span></li>;
          })}</ul>
        </details>}
        {hasResults ? <>
          {resultTables.map((table) => <div className="paper-table" key={table.id}>
            <h3>{studyLabel(language, table.title)}</h3>
            {table.caption && <p className="paper-table-caption">{table.caption}</p>}
            <div className="persona-table-scroll"><table className="persona-table">
              <thead><tr>{table.columns.map((column, index) => <th scope="col" key={`${table.id}-h-${index}`}>{t(column)}</th>)}</tr></thead>
              <tbody>{table.rows.map((row, rowIndex) => <tr key={`${table.id}-r-${rowIndex}`}>
                <th scope="row">{studyLabel(language, row.header)}{row.note && <small className="result-detail">{t(row.note)}</small>}</th>
                {table.columns.slice(1).map((_, index) => <td key={`${table.id}-r-${rowIndex}-c-${index}`}>{row.values[index] ?? "—"}</td>)}
              </tr>)}</tbody>
            </table></div>
          </div>)}
          {!!parsed.protocol?.instrumentSpec && exhibits.some((item) => item.main && item.kind === "Figure" && item.number === "1") && <ValuationCdf title="Figure 1. AI CV-Sell and CV-Buy valuations" series={[
            { label: "CV-Sell", color: "#111111", values: report?.valuations.filter((item) => item.group === "cv_sell_100").map((item) => item.midpoint).filter((value): value is number => value != null) || [], publishedMedian: parsed.protocol?.benchmarks.find((item) => item.ruleId === "median_cv_sell_100")?.value },
            { label: "CV-Buy", color: "#087e8b", values: report?.valuations.filter((item) => item.group === "cv_buy_100").map((item) => item.midpoint).filter((value): value is number => value != null) || [], publishedMedian: parsed.protocol?.benchmarks.find((item) => item.ruleId === "median_cv_buy_100")?.value },
          ]} />}
          {!!parsed.protocol?.instrumentSpec && exhibits.some((item) => item.main && item.kind === "Figure" && item.number === "2") && <ValuationCdf title="Figure 2. AI EV-Sell and EV-Buy valuations" series={[
            { label: "EV-Sell", color: "#111111", values: report?.valuations.filter((item) => item.group === "ev_sell_100").map((item) => item.midpoint).filter((value): value is number => value != null) || [], publishedMedian: parsed.protocol?.benchmarks.find((item) => item.ruleId === "median_ev_sell_100")?.value },
            { label: "EV-Buy", color: "#087e8b", values: report?.valuations.filter((item) => item.group === "ev_buy_100").map((item) => item.midpoint).filter((value): value is number => value != null) || [], publishedMedian: parsed.protocol?.benchmarks.find((item) => item.ruleId === "median_ev_buy_100")?.value },
          ]} />}
          <div className="report-actions">
            <Button variant="outline" onClick={downloadAiReport}><Download size={15} /> {t("Download AI results (PDF)")}</Button>
          </div>
          {!!fidelityWarnings.length && <details className="protocol-details"><summary>{t("Departures from the reported design")} ({fidelityWarnings.length})</summary><ul>{fidelityWarnings.map((item) => <li key={item}>{displayAudit(language, item)}</li>)}</ul></details>}
        </> : <div className="empty-result">{t("Results will appear after the experiment runs.")}</div>}
        {hasResults && <Button className="phase-next" variant="outline" onClick={() => openTab(6)}>{t("Compare with the published study")} <ArrowRight size={16} /></Button>}
      </section>
      <section id="step-07" role="tabpanel" aria-labelledby="phase-tab-7" hidden={visibleSection !== 6} className="panel results-panel"><div className="step-label"><span>07</span> {t("Results comparison")}</div>
        <p className="inline-note">{language === "zh" ? "AI 结果来自合成受访者。即使题目和计算方式与论文一致，也不能保证重现真人样本的发表数值。" : "AI results come from synthetic respondents. Matching the study design and calculation does not guarantee the published human result."}</p>
        {comparison.length ? <>
          <div className="result-table comparison-table">
            <div className="result-row result-head"><span>{t("Measure")}</span><span>{language === "zh" ? "合成 AI 结果" : "Synthetic AI result"}</span><span>{language === "zh" ? "发表的人类样本结果" : "Published human result"}</span><span>{t("Difference")}</span><span>{t("Scored observations")}</span></div>
            {comparison.map((row) => <div className={`result-row agreement-${row.agreement}`} key={row.id}>
              <span>{studyLabel(language, row.label)}</span>
              <span>{row.ai}</span>
              <span>{row.published === "Not extracted" ? t("Not extracted") : row.published === "No matching published median" && language === "zh" ? "论文未报告可直接对应的中位数" : row.published}{row.evidence && <small className="result-detail">{row.evidence.source}{sourceQuotePage(row.evidence, sources) ? `, PDF p. ${sourceQuotePage(row.evidence, sources)}` : ""} · “{row.evidence.quote}”</small>}</span>
              <span>{row.difference}{row.note && <small className="result-detail">{t(row.note)}</small>}</span>
              <span>{row.observations}</span>
            </div>)}
          </div>
          <div className="agreement-stats">
            <div><strong>{comparisonStats.compared}</strong><span>{t("compared")}</span></div>
            <div><strong>{comparisonStats.close}</strong><span>{t("within 15%")}</span></div>
            <div><strong>{comparisonStats.divergent}</strong><span>{t("far apart")}</span></div>
            <div><strong>{comparisonStats.missingBenchmark}</strong><span>{t("no published value")}</span></div>
          </div>
          {!!exhibits.length && <details className="protocol-details exhibit-inventory"><summary>{language === "zh" ? "逐表逐图的比较覆盖情况" : "Comparison coverage by table and figure"}</summary>
            <ul>{exhibits.map((exhibit) => {
              const related = exhibit.kind === "Figure" && exhibit.main && exhibit.number === "1" ? ["median_cv_sell_100", "median_cv_buy_100"]
                : exhibit.kind === "Figure" && exhibit.main && exhibit.number === "2" ? ["median_ev_sell_100", "median_ev_buy_100"]
                : comparison.filter((row) => row.label.toLowerCase().includes(`${exhibit.kind} ${exhibit.number}`.toLowerCase())).map((row) => row.id);
              const compared = comparison.filter((row) => related.includes(row.id) && row.agreement !== "unavailable").length;
              return <li key={`${exhibit.id}-comparison`}><strong>{exhibit.title}</strong><span> · {compared ? (language === "zh" ? `${compared} 项 AI 与人类指标可比较` : `${compared} AI–human measure${compared === 1 ? "" : "s"} compared`) : (language === "zh" ? "本次运行没有可直接比较的 AI 指标" : "No directly comparable AI measure in this run")}</span></li>;
            })}</ul>
          </details>}
          <h3>{t("Executive summary")}</h3>
          <p className="synthesis-summary">{synthesis?.summary || mechanicalSummary}</p>
          <h3>{t("In detail")}</h3>
          {synthesis?.detail.length ? synthesis.detail.map((paragraph, index) => <p className="synthesis-detail" key={index}>{paragraph}</p>) : <p className="inline-note">{t("Select Write the detailed comparison for a measure-by-measure reading of these results.")}</p>}
          <div className="report-actions">
            <Button variant="outline" disabled={!!busy || !modelReady} onClick={() => void writeSynthesis()}>{busy === "Writing the comparison" ? <LoaderCircle className="spin" size={16} /> : null} {synthesis ? t("Rewrite the detailed comparison") : t("Write the detailed comparison")}</Button>
            <Button variant="outline" onClick={downloadComparisonReport}><Download size={15} /> {t("Download comparison (PDF)")}</Button>
          </div>
          {!!fidelityWarnings.length && <details className="protocol-details"><summary>{t("Limits on this comparison")} ({fidelityWarnings.length})</summary><ul>{fidelityWarnings.map((item) => <li key={item}>{displayAudit(language, item)}</li>)}</ul></details>}
        </> : <div className="empty-result">{t("Results will appear after the experiment runs.")}</div>}
      </section>
      </>}
    </div>
    {sourceComplete && <p className="footnote">{t("AI personas are randomly generated synthetic respondents. Source gaps and design departures remain visible and block an exact mirror.")}</p>}
  </div></main>;
}
