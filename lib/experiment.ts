export type SourceFile = { name: string; text: string };
export type Evidence = { source: string; quote: string };
export type PersonaField = { key: string; values: { value: string; weight: number }[]; evidence?: Evidence };
export type ExperimentNode = {
  id: string;
  conditionId: string;
  prompt: string;
  options: { id: string; text: string }[];
  nextByChoice: Record<string, string | null>;
  amount?: number;
  valuationGroup?: string;
  upperBoundOptionId?: string;
  evidence: Evidence;
  routeEvidence?: Evidence;
  amountEvidence?: Evidence;
};
export type ExperimentCondition = { id: string; label: string; wave: number; entryNodeId: string; evidence: Evidence };
export type ExperimentArm = { id: string; label: string; weight: number; conditionOrder: string[]; evidence: Evidence };
export type PublishedBenchmark = { id: string; label: string; value: number; unit: string; ruleId?: string; valuationGroup?: string; evidence: Evidence };
export type AnalysisRule = {
  id: string;
  label: string;
  kind: "median_valuation" | "mean_valuation" | "mean_abs_log_spread" | "pearson_correlation" | "choice_share";
  group?: string;
  groups?: [string, string];
  nodeId?: string;
  optionId?: string;
  evidence: Evidence;
};
export type ExperimentProtocol = {
  title: string;
  sampleSize: number | null;
  sampleSizeEvidence: Evidence | null;
  waveGapDays: number | null;
  waveGapEvidence: Evidence | null;
  personaFields: PersonaField[];
  arms: ExperimentArm[];
  conditions: ExperimentCondition[];
  nodes: ExperimentNode[];
  analysisRules: AnalysisRule[];
  benchmarks: PublishedBenchmark[];
  unresolved: string[];
  sourceNotes: string;
};
export type Persona = { id: string; armId: string; fields: Record<string, string> };
export type Trial = {
  runId: string;
  personaId: string;
  armId: string;
  conditionId: string;
  nodeId: string;
  wave: number;
  prompt: string;
  options: { id: string; text: string }[];
  choice: string;
  rawResponse: string;
  model: string;
  at: string;
};

export function parseProtocol(value: unknown): ExperimentProtocol {
  if (!value || typeof value !== "object") throw new Error("The extracted protocol is not an object.");
  const p = value as ExperimentProtocol;
  if (!Array.isArray(p.arms) || !Array.isArray(p.conditions) || !Array.isArray(p.nodes) || !Array.isArray(p.analysisRules) || !Array.isArray(p.unresolved) || !Array.isArray(p.personaFields) || !Array.isArray(p.benchmarks)) throw new Error("The protocol is missing required lists.");
  if (typeof p.title !== "string" || p.unresolved.some((x) => typeof x !== "string")) throw new Error("The protocol title or unresolved list is invalid.");
  if (p.arms.some((x) => !x || !Array.isArray(x.conditionOrder) || typeof x.id !== "string") || p.conditions.some((x) => !x || typeof x.id !== "string" || typeof x.entryNodeId !== "string") || p.nodes.some((x) => !x || typeof x.id !== "string" || !Array.isArray(x.options) || x.options.some((o) => !o || typeof o.id !== "string" || typeof o.text !== "string") || !x.nextByChoice || typeof x.nextByChoice !== "object")) throw new Error("The assignment or question structure is invalid.");
  if (p.personaFields.some((x) => !x || !Array.isArray(x.values) || x.values.some((v) => !v || typeof v.value !== "string" || typeof v.weight !== "number")) || p.benchmarks.some((x) => !x || typeof x.id !== "string")) throw new Error("The persona or benchmark structure is invalid.");
  if (p.analysisRules.some((x) => !x || typeof x.id !== "string" || typeof x.kind !== "string")) throw new Error("The outcome rules are invalid.");
  return p;
}

export type ProtocolAudit = { personaBlockers: string[]; runBlockers: string[]; warnings: string[]; checks: string[] };
export type ReviewKind = "Study detail to verify" | "Citation to verify" | "Reconstruction to review" | "Runner limitation";

export function reviewFindingKind(message: string): ReviewKind {
  if (/quote could not be verified|has no source quote/i.test(message)) return "Citation to verify";
  if (/runner|unsupported|not directly comparable/i.test(message)) return "Runner limitation";
  if (/^Source detail still needed:/i.test(message) && /exact (?:question )?wording.*(?:missing|absent)|(?:missing|absent).*exact (?:question )?wording|questionnaire.*appendix/i.test(message)) return "Study detail to verify";
  return "Reconstruction to review";
}

// PDF text layers vary in spacing, line wrapping, ligatures, and footnote marks.
const comparableText = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const withoutCitationMarks = (value: string) => value.replace(/\[(?:\d+(?:\s*[-,]\s*\d+)*)\]/g, "").replace(/[¹²³⁰⁴⁵⁶⁷⁸⁹]/g, "");
const sourcePages = (text: string) => text.split(/(?=\[Page \d+\])/).filter(Boolean);
function quoteInPage(quote: string, page: string) {
  const direct = comparableText(quote);
  const withoutMarks = comparableText(withoutCitationMarks(quote));
  return !!direct && (comparableText(page).includes(direct) || (!!withoutMarks && comparableText(withoutCitationMarks(page)).includes(withoutMarks)));
}
export function sourceQuoteMatches(item: Evidence, sources: SourceFile[]) {
  const source = sources.find((s) => s.name === item.source);
  return !!source && !!item.quote && sourcePages(source.text).some((page) => quoteInPage(item.quote, page));
}
export function sourceQuotePage(item: Evidence, sources: SourceFile[]): number | null {
  const source = sources.find((s) => s.name === item.source);
  if (!source || !item.quote) return null;
  for (const page of sourcePages(source.text)) {
    const match = page.match(/^\[Page (\d+)\]/);
    if (match && quoteInPage(item.quote, page)) return Number(match[1]);
  }
  return null;
}

export function auditProtocol(p: ExperimentProtocol, sources: SourceFile[]): ProtocolAudit {
  const personaBlockers: string[] = [];
  const runBlockers: string[] = [];
  const warnings: string[] = [];
  const personaBlock = (message: string) => personaBlockers.push(message);
  const runBlock = (message: string) => runBlockers.push(message);
  const warn = (message: string) => warnings.push(message);
  if (!p.arms.length) personaBlock("No usable assignment plan was extracted.");
  if (!p.conditions.length || !p.nodes.length) runBlock("Conditions or executable questions are missing.");
  const optionalTimingGap = (detail: string) => {
    const timing = /\b(gap|interval|time between|timing between)\b/i.test(detail);
    const stages = /\b(waves?|stages?|online task|lab session)\b/i.test(detail);
    const absent = /\b(missing|unknown|unspecified|not reported|not stated|not specified|not provided)\b/i.test(detail);
    return timing && stages && absent;
  };
  p.unresolved.filter((x) => !/^specific node ids? for terminal states/i.test(x) && !optionalTimingGap(x)).forEach((x) => warn(`Source detail still needed: ${x}`));
  const conditionIds = new Set(p.conditions.map((c) => c.id));
  const nodeIds = new Set(p.nodes.map((n) => n.id));
  const evidence = (label: string, item?: Evidence | null) => {
    if (!item?.source || !item.quote) { warn(`${label} has no source quote.`); return; }
    if (!sourceQuoteMatches(item, sources)) warn(`${label} quote could not be verified in ${item.source}.`);
  };
  if (p.sampleSize != null) evidence("Respondent count", p.sampleSizeEvidence);
  for (const field of p.personaFields) {
    evidence(`Persona field ${field.key}`, field.evidence);
    if (!field.key || !Array.isArray(field.values) || !field.values.length || field.values.some((v) => !v.value || !(v.weight > 0))) personaBlock(`Persona field ${field.key || "unnamed"} needs usable values and weights.`);
    if (/^(condition|arm|wave|assignment|order)(_|$)/i.test(field.key)) warn(`${field.key} looks like an assigned study condition, not a respondent attribute; it will not be sampled as a persona trait.`);
  }
  for (const arm of p.arms) {
    evidence(`Arm ${arm.id}`, arm.evidence);
    if (!(arm.weight > 0) || !arm.conditionOrder.length || arm.conditionOrder.some((id) => !conditionIds.has(id))) personaBlock(`Arm ${arm.id} needs a valid weight and condition order.`);
    if (new Set(arm.conditionOrder).size !== arm.conditionOrder.length) runBlock(`Arm ${arm.id} repeats a condition; make repeated tasks separate conditions.`);
    const waves = arm.conditionOrder.map((id) => p.conditions.find((c) => c.id === id)?.wave || 0);
    if (waves.some((wave, i) => i > 0 && wave < waves[i - 1])) runBlock(`Arm ${arm.id} places an earlier wave after a later wave.`);
  }
  for (const c of p.conditions) {
    evidence(`Condition ${c.id}`, c.evidence);
    if (!nodeIds.has(c.entryNodeId)) runBlock(`Condition ${c.id} has no entry question.`);
  }
  for (const n of p.nodes) {
    evidence(`Question ${n.id}`, n.evidence);
    evidence(`Question ${n.id} routing`, n.routeEvidence);
    if (n.amount != null) evidence(`Question ${n.id} amount`, n.amountEvidence);
    if (!conditionIds.has(n.conditionId) || n.options.length !== 2 || new Set(n.options.map((o) => o.id)).size !== 2) runBlock(`Question ${n.id} needs a condition and two distinct choices.`);
    for (const option of n.options) {
      const next = n.nextByChoice?.[option.id];
      if (!(option.id in (n.nextByChoice || {})) || (next && !nodeIds.has(next))) runBlock(`Question ${n.id} has an incomplete choice route.`);
      if (next && p.nodes.find((x) => x.id === next)?.conditionId !== n.conditionId) runBlock(`Question ${n.id} routes into another condition.`);
    }
    if (n.valuationGroup && (!Number.isFinite(n.amount) || !n.options.some((o) => o.id === n.upperBoundOptionId))) warn(`Question ${n.id} has an incomplete valuation rule; its outcome cannot be scored.`);
  }
  for (const benchmark of p.benchmarks) {
    evidence(`Benchmark ${benchmark.id}`, benchmark.evidence);
    if (benchmark.ruleId && !p.analysisRules.some((r) => r.id === benchmark.ruleId)) warn(`Benchmark ${benchmark.id} has no matching outcome rule.`);
  }
  const valuationGroups = new Set(p.nodes.map((n) => n.valuationGroup).filter(Boolean));
  for (const rule of p.analysisRules) {
    evidence(`Outcome ${rule.id}`, rule.evidence);
    if (["median_valuation", "mean_valuation"].includes(rule.kind) && !valuationGroups.has(rule.group)) warn(`Outcome ${rule.id} names an unknown valuation group.`);
    if (["mean_abs_log_spread", "pearson_correlation"].includes(rule.kind) && (!Array.isArray(rule.groups) || rule.groups.length !== 2 || rule.groups.some((g) => !valuationGroups.has(g)))) warn(`Outcome ${rule.id} needs two known valuation groups.`);
    if (rule.kind === "choice_share" && (!nodeIds.has(rule.nodeId || "") || !p.nodes.find((n) => n.id === rule.nodeId)?.options.some((o) => o.id === rule.optionId))) warn(`Outcome ${rule.id} needs a valid question and choice.`);
    if (!["median_valuation", "mean_valuation", "mean_abs_log_spread", "pearson_correlation", "choice_share"].includes(rule.kind)) warn(`Outcome ${rule.id} uses an unsupported calculation.`);
  }
  for (const c of p.conditions) {
    const reached = new Set<string>();
    const visiting = new Set<string>();
    let hasCycle = false;
    const walk = (id: string) => {
      if (visiting.has(id)) { hasCycle = true; return; }
      if (reached.has(id)) return;
      visiting.add(id);
      const node = p.nodes.find((n) => n.id === id);
      if (node?.conditionId === c.id) for (const next of Object.values(node.nextByChoice || {})) if (next) walk(next);
      visiting.delete(id); reached.add(id);
    };
    walk(c.entryNodeId);
    if (hasCycle) runBlock(`Condition ${c.id} has a routing loop.`);
    if (p.nodes.some((n) => n.conditionId === c.id && !reached.has(n.id))) warn(`Condition ${c.id} has unreachable questions.`);
  }
  if (p.conditions.some((c) => c.wave > 1)) {
    if (p.waveGapDays != null && (!Number.isFinite(p.waveGapDays) || p.waveGapDays < 0)) {
      runBlock("The recorded gap between stages must be a nonnegative number of days.");
    } else if (p.waveGapDays != null) {
      evidence("Wave timing", p.waveGapEvidence);
    }
  }
  const brownPaper = sources.some((source) => comparableText(source.text).includes("cognitiveconstraintsonvaluingannuities"));
  if (brownPaper) {
    const cvSellWaves = new Set(p.conditions.filter((condition) => /cv[\s_-]*sell|compensating variation[\s_-]*sell/i.test(`${condition.id} ${condition.label}`)).map((condition) => condition.wave));
    if (cvSellWaves.size > 0 && (!cvSellWaves.has(1) || !cvSellWaves.has(2))) warn("Brown et al. randomized CV-Sell between wave 1 and wave 2; this protocol does not represent both placements.");
    if (p.analysisRules.some((rule) => rule.kind === "pearson_correlation")) warn("Brown's published correlations use log valuations adjusted for experimental manipulations; the runner's raw correlation is not directly comparable.");
  }
  const unique = (items: string[]) => [...new Set(items)];
  return { personaBlockers: unique(personaBlockers), runBlockers: unique([...personaBlockers, ...runBlockers]), warnings: unique(warnings), checks: unique([...personaBlockers, ...runBlockers, ...warnings]) };
}

export function checkProtocol(p: ExperimentProtocol, sources: SourceFile[]): string[] {
  return auditProtocol(p, sources).checks;
}

function hashSeed(seed: string) {
  let h = 2166136261;
  for (const char of seed) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rngFor(seed: string) {
  let s = hashSeed(seed) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
function weighted<T extends { weight: number }>(items: T[], random: () => number): T {
  const total = items.reduce((n, item) => n + item.weight, 0);
  let pick = random() * total;
  for (const item of items) { pick -= item.weight; if (pick < 0) return item; }
  return items[items.length - 1];
}
export function generatePersonas(p: ExperimentProtocol, count: number, seed: string): Persona[] {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error("Choose between 1 and 10,000 personas.");
  const random = rngFor(seed);
  return Array.from({ length: count }, (_, i) => ({
    id: `P${String(i + 1).padStart(5, "0")}`,
    armId: weighted(p.arms, random).id,
    fields: Object.fromEntries(p.personaFields.filter((f) => !/^(condition|arm|wave|assignment|order)(_|$)/i.test(f.key)).map((f) => [f.key, f.values.length ? weighted(f.values, random).value : "unspecified"])),
  }));
}
export function renderPrompt(template: string, persona: Persona): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => persona.fields[key] ?? `[${key} missing]`);
}
export function nextTask(p: ExperimentProtocol, persona: Persona, trials: Trial[], now = Date.now()): { condition: ExperimentCondition; node: ExperimentNode; availableAt?: string } | null {
  const arm = p.arms.find((a) => a.id === persona.armId);
  if (!arm) return null;
  const own = trials.filter((t) => t.personaId === persona.id);
  for (const conditionId of arm.conditionOrder) {
    const condition = p.conditions.find((c) => c.id === conditionId);
    if (!condition) continue;
    const inCondition = own.filter((t) => t.conditionId === conditionId);
    const nextId = inCondition.length ? p.nodes.find((n) => n.id === inCondition[inCondition.length - 1].nodeId)?.nextByChoice[inCondition[inCondition.length - 1].choice] : condition.entryNodeId;
    if (nextId) {
      const node = p.nodes.find((n) => n.id === nextId);
      if (node) {
        const previousWave = own.filter((t) => t.wave < condition.wave).map((t) => Date.parse(t.at)).filter(Number.isFinite);
        const due = previousWave.length && p.waveGapDays ? Math.max(...previousWave) + p.waveGapDays * 86400000 : 0;
        return { condition, node, ...(due > now ? { availableAt: new Date(due).toISOString() } : {}) };
      }
    }
  }
  return null;
}

export function experimentProgress(p: ExperimentProtocol, personas: Persona[], trials: Trial[]) {
  const arms = new Map(p.arms.map((arm) => [arm.id, arm]));
  const nodes = new Map(p.nodes.map((node) => [node.id, node]));
  const latest = new Map<string, Trial>();
  for (const trial of trials) latest.set(`${trial.personaId}:${trial.conditionId}`, trial);
  let completed = 0;
  let total = 0;
  for (const persona of personas) {
    for (const conditionId of arms.get(persona.armId)?.conditionOrder || []) {
      total++;
      const last = latest.get(`${persona.id}:${conditionId}`);
      const node = last && nodes.get(last.nodeId);
      if (last && node && Object.hasOwn(node.nextByChoice, last.choice) && node.nextByChoice[last.choice] === null) completed++;
    }
  }
  return { completed, total, percent: total ? Math.round(completed / total * 100) : 0 };
}

export function results(p: ExperimentProtocol, personas: Persona[], trials: Trial[]) {
  const valuations: { personaId: string; group: string; lower: number | null; upper: number | null; midpoint: number | null }[] = [];
  const groups = [...new Set(p.nodes.map((n) => n.valuationGroup).filter((x): x is string => !!x))];
  for (const persona of personas) for (const group of groups) {
    let lower: number | null = null, upper: number | null = null;
    for (const trial of trials.filter((t) => t.personaId === persona.id)) {
      const node = p.nodes.find((n) => n.id === trial.nodeId);
      if (!node || node.valuationGroup !== group || node.amount == null) continue;
      if (trial.choice === node.upperBoundOptionId) upper = Math.min(upper ?? Infinity, node.amount);
      else lower = Math.max(lower ?? -Infinity, node.amount);
    }
    if (lower != null || upper != null) valuations.push({ personaId: persona.id, group, lower, upper, midpoint: lower != null && upper != null && lower <= upper ? (lower + upper) / 2 : null });
  }
  const summaries = groups.map((group) => {
    const values = valuations.filter((v) => v.group === group && v.midpoint != null).map((v) => v.midpoint!).sort((a, b) => a - b);
    const median = values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : null;
    return { group, complete: values.length, median, benchmark: p.benchmarks.find((b) => b.valuationGroup === group) ?? null };
  });
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const median = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
  };
  const pairs = (a: string, b: string) => personas.flatMap((persona) => {
    const x = valuations.find((v) => v.personaId === persona.id && v.group === a)?.midpoint;
    const y = valuations.find((v) => v.personaId === persona.id && v.group === b)?.midpoint;
    return x != null && y != null && x > 0 && y > 0 ? [[x, y] as const] : [];
  });
  const outcomes = p.analysisRules.map((rule) => {
    let value: number | null = null;
    let count = 0;
    if (rule.kind === "median_valuation" || rule.kind === "mean_valuation") {
      const numbers = valuations.filter((v) => v.group === rule.group && v.midpoint != null).map((v) => v.midpoint!);
      count = numbers.length;
      value = rule.kind === "median_valuation" ? median(numbers) : mean(numbers);
    } else if (rule.kind === "mean_abs_log_spread" && rule.groups) {
      const numbers = pairs(rule.groups[0], rule.groups[1]).map(([a, b]) => Math.abs(Math.log(a) - Math.log(b)));
      count = numbers.length; value = mean(numbers);
    } else if (rule.kind === "pearson_correlation" && rule.groups) {
      const data = pairs(rule.groups[0], rule.groups[1]); count = data.length;
      if (data.length > 1) {
        const mx = mean(data.map(([a]) => a))!, my = mean(data.map(([, b]) => b))!;
        const numerator = data.reduce((sum, [a, b]) => sum + (a - mx) * (b - my), 0);
        const xx = data.reduce((sum, [a]) => sum + (a - mx) ** 2, 0);
        const yy = data.reduce((sum, [, b]) => sum + (b - my) ** 2, 0);
        value = xx && yy ? numerator / Math.sqrt(xx * yy) : null;
      }
    } else if (rule.kind === "choice_share") {
      const relevant = trials.filter((t) => t.nodeId === rule.nodeId); count = relevant.length;
      value = count ? 100 * relevant.filter((t) => t.choice === rule.optionId).length / count : null;
    }
    const comparisonNote = /cognitive constraints on valuing annuities/i.test(p.title) && rule.kind === "pearson_correlation" ? "Published value needs adjusted log analysis" : null;
    return { id: rule.id, label: rule.label, value, count, benchmark: comparisonNote ? null : p.benchmarks.find((b) => b.ruleId === rule.id || (rule.kind === "median_valuation" && b.valuationGroup === rule.group)) ?? null, comparisonNote };
  });
  return { completedPersonas: personas.filter((x) => !nextTask(p, x, trials)).length, trials: trials.length, summaries, valuations, outcomes };
}
