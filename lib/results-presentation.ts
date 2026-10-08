import type { Evidence, ExperimentProtocol, Persona, ResultTable, ResultTableCell, Trial } from "./experiment.ts";
import { results } from "./experiment.ts";
import type { ReportBlock } from "./pdf-report.ts";

export type Outcome = ReturnType<typeof results>["outcomes"][number];

/** The unit a paper writes out in prose, as the symbol a table column wants. */
function unitSymbol(unit: string): string {
  const cleaned = unit.trim().toLowerCase();
  if (/^(%|percent|percentage|percentage points?|pp|pct)$/.test(cleaned)) return "%";
  if (/^(\$|usd|dollars?|us dollars?)$/.test(cleaned)) return "$";
  return unit.trim();
}

export function formatValue(value: number | null, unit: string, decimals?: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const places = decimals ?? (Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 10 ? 2 : 3);
  const rendered = Number(value.toFixed(places)).toLocaleString(undefined, { maximumFractionDigits: places });
  const symbol = unitSymbol(unit || "");
  if (!symbol) return rendered;
  if (symbol === "%") return `${rendered}%`;
  if (symbol === "$") return `$${rendered}`;
  return `${rendered} ${symbol}`;
}

/**
 * The paper's own result layout when one was extracted; otherwise one table per
 * study stage, which is how a behavioral paper almost always groups its
 * reported measures.
 */
export function presentationTables(protocol: ExperimentProtocol, outcomes: Outcome[]): ResultTable[] {
  const executableIds = new Set(protocol.analysisRules.map((rule) => rule.id));
  const paperTables = (protocol.resultTables || []).filter((table) => table.rows.some((row) => row.cells.some((cell) => cell.ruleId && executableIds.has(cell.ruleId))));
  if (paperTables.length) {
    const shown = new Set(paperTables.flatMap((table) => table.rows.flatMap((row) => row.cells.map((cell) => cell.ruleId).filter((id): id is string => !!id))));
    const remaining = outcomes.filter((outcome) => executableIds.has(outcome.id) && !shown.has(outcome.id));
    return remaining.length ? [...paperTables, { id: "other-ai-measures", title: "Other AI measures", columnHeaders: ["Measure", "AI result", "Observations"], rows: remaining.map((outcome) => ({ header: outcome.label, cells: [{ ruleId: outcome.id }] })) }] : paperTables;
  }
  // Without the paper's own layout, each stage gets a measure/value/count table.
  const byRule = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  const stageOf = (outcome: Outcome) => {
    const rule = protocol.analysisRules.find((item) => item.id === outcome.id);
    if (!rule) return "Other published measures";
    if (rule.stage) return rule.stage;
    const condition = protocol.conditions.find((item) => item.id === rule.group);
    return condition?.stage || condition?.label || "Reported measures";
  };
  const groups = new Map<string, Outcome[]>();
  for (const outcome of outcomes) {
    if (!executableIds.has(outcome.id)) continue;
    const stage = byRule.has(outcome.id) ? stageOf(outcome) : "Reported measures";
    groups.set(stage, [...(groups.get(stage) || []), outcome]);
  }
  return [...groups.entries()].map(([stage, items], index) => ({
    id: `stage-${index}`,
    title: stage,
    columnHeaders: ["Measure", "Value", "Observations"],
    rows: items.map((outcome) => ({ header: outcome.label, cells: [{ ruleId: outcome.id }] })),
  }));
}

export type RenderedTable = { id: string; title: string; caption?: string; columns: string[]; rows: { header: string; values: string[]; note?: string }[] };

/** The AI run's own results, laid out the way the paper lays its results out. */
export function aiResultTables(protocol: ExperimentProtocol, outcomes: Outcome[]): RenderedTable[] {
  const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  // The paper's own layout fixes the columns, so each cell renders one value.
  // The fallback grouping instead gets a value column and a count column.
  const cellValue = (cell: ResultTableCell, usingPaperLayout: boolean) => {
    const outcome = cell.ruleId ? byId.get(cell.ruleId) : undefined;
    // A paper-only cell is never an AI result, even if its published number
    // was quoted in the extracted table layout.
    if (!outcome) return ["—"];
    const value = formatValue(outcome.value, outcome.unit);
    return usingPaperLayout ? [value] : [value, String(outcome.count || 0)];
  };
  return presentationTables(protocol, outcomes).map((table) => {
    const usingPaperLayout = !!protocol.resultTables?.some((item) => item.id === table.id);
    const columnCount = Math.max(1, ...table.rows.map((row) => row.cells.reduce((total, cell) => total + cellValue(cell, usingPaperLayout).length, 0)));
    const headers = usingPaperLayout && table.columnHeaders.length > 1 ? table.columnHeaders : ["Measure", "AI result", "Observations"];
    return {
      id: table.id,
      title: table.title,
      caption: table.caption,
      // A layout that named fewer columns than the rows fill gets the extras back.
      columns: headers.length >= columnCount + 1 ? headers : [...headers, ...Array.from({ length: columnCount + 1 - headers.length }, (_, index) => `Value ${headers.length + index}`)],
      rows: table.rows.map((row) => {
        const cells = row.cells.length ? row.cells : [{}];
        const outcome = cells[0]?.ruleId ? byId.get(cells[0].ruleId) : undefined;
        return { header: row.header, values: cells.flatMap((cell) => cellValue(cell, usingPaperLayout)), note: outcome?.note || (cells.some((cell) => cell.text || cell.benchmarkId) ? "Published-only cells have no AI calculation." : undefined) };
      }),
    };
  });
}

export type ComparisonRow = {
  id: string;
  label: string;
  ai: string;
  published: string;
  observations: string;
  /** Signed gap when both sides are numeric and share a unit. */
  difference: string;
  agreement: "close" | "directional" | "divergent" | "unavailable";
  note?: string;
  evidence?: Evidence;
};

export function comparisonRows(outcomes: Outcome[], protocol?: ExperimentProtocol | null): ComparisonRow[] {
  return outcomes.map((outcome) => {
    const published = outcome.benchmark;
    const ai = outcome.value;
    let difference = "—";
    let agreement: ComparisonRow["agreement"] = "unavailable";
    const unitsMatch = !published || unitSymbol(outcome.unit || "") === unitSymbol(published.unit || "");
    if (ai != null && published && Number.isFinite(published.value) && unitsMatch) {
      const gap = ai - published.value;
      const scale = Math.max(Math.abs(published.value), 1e-9);
      const relative = Math.abs(gap) / scale;
      difference = `${gap >= 0 ? "+" : ""}${formatValue(gap, outcome.unit || published.unit)}`;
      agreement = relative <= 0.15 ? "close" : relative <= 0.5 ? "directional" : "divergent";
    }
    return {
      id: outcome.id,
      label: outcome.label,
      ai: formatValue(ai, outcome.unit),
      published: published ? formatValue(published.value, published.unit) : protocol?.instrumentSpec?.kind === "brown-annuity-2017" && outcome.id.startsWith("median_") && protocol.benchmarks.some((item) => item.ruleId?.startsWith("median_")) ? "No matching published median" : "Not extracted",
      observations: String(outcome.count || 0),
      difference,
      agreement,
      note: !unitsMatch ? `Unit mismatch: AI ${outcome.unit || "unspecified"}; published ${published?.unit || "unspecified"}.` : outcome.comparisonNote || outcome.note || undefined,
      evidence: published?.evidence,
    };
  });
}

export function agreementSummary(rows: ComparisonRow[]) {
  const compared = rows.filter((row) => row.agreement !== "unavailable");
  return {
    compared: compared.length,
    close: compared.filter((row) => row.agreement === "close").length,
    directional: compared.filter((row) => row.agreement === "directional").length,
    divergent: compared.filter((row) => row.agreement === "divergent").length,
    missingBenchmark: rows.filter((row) => row.published === "Not extracted" || row.published === "No matching published median").length,
    noAiValue: rows.filter((row) => row.ai === "—").length,
  };
}

/** A short plain-language reading of the comparison, written without a model. */
export function executiveSummary(protocol: ExperimentProtocol, rows: ComparisonRow[], personaCount: number, trialCount: number): string {
  const summary = agreementSummary(rows);
  const sentences: string[] = [
    `${personaCount.toLocaleString()} synthetic respondents produced ${trialCount.toLocaleString()} recorded choices under the reconstructed protocol for ${protocol.title}.`,
  ];
  if (!summary.compared) {
    sentences.push("No published value was matched to an executable calculation, so the AI results stand on their own and cannot yet be scored against the paper.");
  } else {
    sentences.push(`${summary.compared} measure${summary.compared === 1 ? "" : "s"} could be compared with a published value: ${summary.close} within 15% of the paper, ${summary.directional} within 50%, and ${summary.divergent} further apart.`);
    sentences.push(summary.close >= summary.divergent
      ? "The simulated sample reproduces the published pattern on most comparable measures, though agreement in magnitude is not evidence that the underlying behaviour matches."
      : "The simulated sample departs from the published values on most comparable measures, which is the expected outcome when a language model stands in for human respondents.");
  }
  if (summary.missingBenchmark) sentences.push(`${summary.missingBenchmark} measure${summary.missingBenchmark === 1 ? " has" : "s have"} no matching published value available from the uploaded sources, so ${summary.missingBenchmark === 1 ? "it is" : "they are"} reported as an AI result only.`);
  if (summary.noAiValue) sentences.push(`${summary.noAiValue} published measure${summary.noAiValue === 1 ? " has" : "s have"} no executable calculation in this runner and ${summary.noAiValue === 1 ? "is" : "are"} shown for reference.`);
  sentences.push("AI responses are new simulated data. They are not observations from the original participants and do not establish that the published finding replicates.");
  return sentences.join(" ");
}

export function aiReportBlocks(protocol: ExperimentProtocol, tables: RenderedTable[], personaCount: number, trialCount: number, fidelityWarnings: string[]): ReportBlock[] {
  const blocks: ReportBlock[] = [
    { kind: "paragraph", text: `Synthetic replication of "${protocol.title}". ${personaCount.toLocaleString()} AI personas produced ${trialCount.toLocaleString()} recorded choices. Results below follow the layout the paper used for its own results.` },
    { kind: "note", text: "AI personas are simulated respondents generated for this run. These values are not observations from the original study's participants." },
  ];
  for (const table of tables) {
    blocks.push({ kind: "table", title: table.title, columns: table.columns, rows: table.rows.map((row) => [row.header, ...row.values]) });
    if (table.caption) blocks.push({ kind: "note", text: table.caption });
  }
  if (fidelityWarnings.length) {
    blocks.push({ kind: "heading", text: "Departures from the reported design" });
    blocks.push({ kind: "bullets", items: fidelityWarnings.slice(0, 25) });
  }
  if (protocol.unresolved.length) {
    blocks.push({ kind: "heading", text: "Source details still open" });
    blocks.push({ kind: "bullets", items: protocol.unresolved.slice(0, 25) });
  }
  return blocks;
}

export function comparisonReportBlocks(protocol: ExperimentProtocol, rows: ComparisonRow[], summary: string, detail: string[], fidelityWarnings: string[]): ReportBlock[] {
  const blocks: ReportBlock[] = [
    { kind: "heading", text: "Executive summary" },
    { kind: "paragraph", text: summary },
    { kind: "heading", text: "Measure by measure" },
    {
      kind: "table",
      columns: ["Measure", "AI result", "Published", "Difference", "Obs."],
      rows: rows.map((row) => [row.label, row.ai, row.published, row.difference, row.observations]),
    },
  ];
  if (detail.length) {
    blocks.push({ kind: "heading", text: "Detailed reading" });
    for (const paragraph of detail) blocks.push({ kind: "paragraph", text: paragraph });
  }
  if (fidelityWarnings.length) {
    blocks.push({ kind: "heading", text: "Limits on this comparison" });
    blocks.push({ kind: "bullets", items: fidelityWarnings.slice(0, 25) });
  }
  blocks.push({ kind: "note", text: `Reconstructed from the uploaded sources for "${protocol.title}". Matching the study design and calculation does not guarantee the published human result.` });
  return blocks;
}

export function runCounts(protocol: ExperimentProtocol, personas: Persona[], trials: Trial[]) {
  const report = results(protocol, personas, trials);
  return { report, personaCount: personas.length, trialCount: trials.length };
}
