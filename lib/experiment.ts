import { brownAssignment, brownAudit, brownTask, type BrownSpec } from "./brown-annuity.ts";
import { constrainToLogic, harmonizeAges, logicalBounds, truncatedNormal, uniform } from "./persona-sampling.ts";

export type SourceFile = { name: string; text: string };
export type Evidence = { source: string; quote: string };
export type PersonaField = { key: string; values: { value: string; weight: number }[]; evidence?: Evidence };
export type SimulatedField = { key: string; mean: number; sd: number; min: number; max: number; integer?: boolean; evidence: Evidence; assumption: string };
/**
 * A numeric attribute the instrument must have a value for even though the
 * paper reports no distribution for it. Each persona draws one uniformly from
 * the stated plausible range.
 */
export type RequiredNumericField = { key: string; label?: string; min?: number; max?: number; integer?: boolean; note?: string; evidence?: Evidence };
export type DesignRequirement = { stage: string; decisionsPerArm: number; conditionCountPerArm?: number; optionsPerDecision?: number; requiredParameterKeys?: string[]; varyingParameterKeys?: string[]; defaultByArm?: Record<string, string | null>; evidence: Evidence };
export type ExperimentOption = { id: string; text: string; score?: number; scoreEvidence?: Evidence };
export type ExperimentNode = {
  id: string;
  conditionId: string;
  prompt: string;
  options: ExperimentOption[];
  nextByChoice: Record<string, string | null>;
  amount?: number;
  valuationGroup?: string;
  upperBoundOptionId?: string;
  evidence: Evidence;
  routeEvidence?: Evidence;
  amountEvidence?: Evidence;
};
export type ExperimentCondition = { id: string; label: string; wave: number; stage?: string; entryNodeId: string; parameters?: Record<string, string | number>; defaultOptionId?: string | null; defaultEvidence?: Evidence; evidence: Evidence };
export type ExperimentArm = { id: string; label: string; weight: number; conditionOrder: string[]; evidence: Evidence };
export type PublishedBenchmark = { id: string; label: string; value: number; unit: string; ruleId?: string; valuationGroup?: string; evidence: Evidence };
export const ANALYSIS_KINDS = [
  "median_valuation", "mean_valuation", "mean_abs_log_spread", "pearson_correlation",
  "choice_share", "mean_choice_score", "median_choice_score", "sd_choice_score",
  // Generic kinds, so a paper that reports a statistic over a whole stage or a
  // contrast between arms does not have to be squeezed into one question.
  "stage_mean_choice_score", "stage_choice_share", "arm_difference_choice_score", "arm_difference_choice_share",
] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];
export type AnalysisRule = {
  id: string;
  label: string;
  kind: AnalysisKind;
  group?: string;
  groups?: [string, string];
  stage?: string;
  armIds?: [string, string];
  nodeId?: string;
  optionId?: string;
  optionMatch?: string;
  optionScores?: Record<string, number>;
  scoreEvidence?: Evidence;
  unit?: string;
  decimals?: number;
  evidence: Evidence;
};
/**
 * How the paper itself laid its results out, so the AI run can be shown the
 * same way instead of as one flat list. Cells name analysis rules; the renderer
 * fills in the AI value, the published value, or both.
 */
export type ResultTableCell = { ruleId?: string; benchmarkId?: string; text?: string };
export type ResultTable = {
  id: string;
  title: string;
  caption?: string;
  columnHeaders: string[];
  rows: { header: string; cells: ResultTableCell[] }[];
  evidence?: Evidence;
};
export type OutcomeNote = string | null;
export type ExperimentProtocol = {
  title: string;
  sampleSize: number | null;
  sampleSizeEvidence: Evidence | null;
  waveGapDays: number | null;
  waveGapEvidence: Evidence | null;
  personaFields: PersonaField[];
  simulatedFields?: SimulatedField[];
  requiredNumericFields?: RequiredNumericField[];
  designRequirements?: DesignRequirement[];
  assignmentStrataKey?: string;
  assignmentEvidence?: Evidence;
  arms: ExperimentArm[];
  conditions: ExperimentCondition[];
  nodes: ExperimentNode[];
  analysisRules: AnalysisRule[];
  benchmarks: PublishedBenchmark[];
  resultTables?: ResultTable[];
  unresolved: string[];
  missingExecutable?: string[];
  sourceNotes: string;
  /** A verified instrument importer may attach its own runner. */
  instrumentSpec?: BrownSpec;
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
  options: ExperimentOption[];
  scenario?: Record<string, string | number>;
  defaultOptionId?: string | null;
  choice: string;
  rawResponse: string;
  model: string;
  at: string;
};

export function parseProtocol(value: unknown): ExperimentProtocol {
  if (!value || typeof value !== "object") throw new Error("The extracted protocol is not an object.");
  const p = value as ExperimentProtocol & { brownSpec?: BrownSpec };
  // Protocols saved before verified instruments were generalized used brownSpec.
  if (!p.instrumentSpec && p.brownSpec) { p.instrumentSpec = p.brownSpec; delete p.brownSpec; }
  if (!Array.isArray(p.arms) || !Array.isArray(p.conditions) || !Array.isArray(p.nodes) || !Array.isArray(p.analysisRules) || !Array.isArray(p.unresolved) || !Array.isArray(p.personaFields) || !Array.isArray(p.benchmarks)) throw new Error("The protocol is missing required lists.");
  if (typeof p.title !== "string" || p.unresolved.some((x) => typeof x !== "string")) throw new Error("The protocol title or unresolved list is invalid.");
  if (p.missingExecutable != null && (!Array.isArray(p.missingExecutable) || p.missingExecutable.some((x) => typeof x !== "string"))) throw new Error("The missing executable steps are invalid.");
  if (p.arms.some((x) => !x || !Array.isArray(x.conditionOrder) || typeof x.id !== "string") || p.conditions.some((x) => !x || typeof x.id !== "string" || typeof x.entryNodeId !== "string") || p.nodes.some((x) => !x || typeof x.id !== "string" || !Array.isArray(x.options) || x.options.some((o) => !o || typeof o.id !== "string" || typeof o.text !== "string") || !x.nextByChoice || typeof x.nextByChoice !== "object")) throw new Error("The assignment or question structure is invalid.");
  if (p.personaFields.some((x) => !x || !Array.isArray(x.values) || x.values.some((v) => !v || typeof v.value !== "string" || typeof v.weight !== "number")) || p.benchmarks.some((x) => !x || typeof x.id !== "string")) throw new Error("The persona or benchmark structure is invalid.");
  if (p.simulatedFields != null && (!Array.isArray(p.simulatedFields) || p.simulatedFields.some((x) => !x || typeof x.key !== "string" || ![x.mean, x.sd, x.min, x.max].every(Number.isFinite) || typeof x.assumption !== "string"))) throw new Error("The simulated fields are invalid.");
  if (p.requiredNumericFields != null && (!Array.isArray(p.requiredNumericFields) || p.requiredNumericFields.some((x) => !x || typeof x.key !== "string" || !x.key || [x.min, x.max].some((value) => value != null && !Number.isFinite(value)) || (x.min != null && x.max != null && x.min > x.max)))) throw new Error("The required numeric fields are invalid.");
  if (p.designRequirements != null && (!Array.isArray(p.designRequirements) || p.designRequirements.some((x) => !x || typeof x.stage !== "string" || !Number.isInteger(x.decisionsPerArm) || x.decisionsPerArm < 1 || (x.conditionCountPerArm != null && (!Number.isInteger(x.conditionCountPerArm) || x.conditionCountPerArm < 1)) || (x.optionsPerDecision != null && (!Number.isInteger(x.optionsPerDecision) || x.optionsPerDecision < 2)) || (x.requiredParameterKeys != null && (!Array.isArray(x.requiredParameterKeys) || x.requiredParameterKeys.some((key) => typeof key !== "string"))) || (x.varyingParameterKeys != null && (!Array.isArray(x.varyingParameterKeys) || x.varyingParameterKeys.some((key) => typeof key !== "string"))) || (x.defaultByArm != null && (typeof x.defaultByArm !== "object" || Array.isArray(x.defaultByArm) || Object.values(x.defaultByArm).some((value) => value !== null && typeof value !== "string")))))) throw new Error("The study design requirements are invalid.");
  if (p.conditions.some((condition) => condition.parameters != null && (typeof condition.parameters !== "object" || Array.isArray(condition.parameters) || Object.values(condition.parameters).some((value) => typeof value !== "string" && !Number.isFinite(value))))) throw new Error("The condition parameters are invalid.");
  if (p.assignmentStrataKey != null && typeof p.assignmentStrataKey !== "string") throw new Error("The assignment stratification field is invalid.");
  if (p.analysisRules.some((x) => !x || typeof x.id !== "string" || typeof x.kind !== "string")) throw new Error("The outcome rules are invalid.");
  if (p.analysisRules.some((rule) => rule.optionScores != null && (typeof rule.optionScores !== "object" || Array.isArray(rule.optionScores) || Object.values(rule.optionScores).some((score) => !Number.isFinite(score))))) throw new Error("An outcome has invalid choice scores.");
  if (p.resultTables != null && (!Array.isArray(p.resultTables) || p.resultTables.some((table) => !table || typeof table.id !== "string" || typeof table.title !== "string" || !Array.isArray(table.columnHeaders) || table.columnHeaders.some((header) => typeof header !== "string") || !Array.isArray(table.rows) || table.rows.some((row) => !row || typeof row.header !== "string" || !Array.isArray(row.cells) || row.cells.some((cell) => !cell || typeof cell !== "object" || Array.isArray(cell)))))) throw new Error("The published result tables are invalid.");
  return p;
}

export type ProtocolAudit = {
  /** Assignment is unusable, so no persona can be drawn. */
  personaBlockers: string[];
  /** The question graph cannot be walked. Only these stop a run. */
  runBlockers: string[];
  /** The run works but departs from the paper's reported design. */
  fidelityWarnings: string[];
  warnings: string[];
  checks: string[];
};
export type ReviewKind = "Study detail to verify" | "Citation to verify" | "Reconstruction to review" | "Runner limitation" | "Replication fidelity";

export function reviewFindingKind(message: string): ReviewKind {
  if (/quote could not be verified|has no source quote/i.test(message)) return "Citation to verify";
  if (/runner|unsupported|not directly comparable/i.test(message)) return "Runner limitation";
  if (/^(?:Missing executable study step|Coverage review)|required decision|does not vary parameter|wrong default|missing required parameter|unreachable questions|repeats a condition|reuses an entry question|independent decision/i.test(message)) return "Replication fidelity";
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
  const fidelityWarnings: string[] = [];
  const warnings: string[] = [];
  const personaBlock = (message: string) => personaBlockers.push(message);
  const runBlock = (message: string) => runBlockers.push(message);
  // A design detail the reconstruction did not match. The run still executes;
  // the difference is reported beside the results instead of hiding them.
  const fidelity = (message: string) => fidelityWarnings.push(message);
  const warn = (message: string) => warnings.push(message);
  const done = (): ProtocolAudit => {
    const unique = (items: string[]) => [...new Set(items)];
    return {
      personaBlockers: unique(personaBlockers),
      runBlockers: unique([...personaBlockers, ...runBlockers]),
      fidelityWarnings: unique(fidelityWarnings),
      warnings: unique([...fidelityWarnings, ...warnings]),
      checks: unique([...personaBlockers, ...runBlockers, ...fidelityWarnings, ...warnings]),
    };
  };
  if (p.instrumentSpec) {
    brownAudit(p, sources).forEach(runBlock);
    p.unresolved.forEach((item) => warn(`Source detail still needed: ${item}`));
    return done();
  }
  if (!p.arms.length) personaBlock("No usable assignment plan was extracted.");
  if (!p.conditions.length || !p.nodes.length) runBlock("Conditions or executable questions are missing.");
  for (const step of p.missingExecutable || []) fidelity(`Missing executable study step: ${step}`);
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
  for (const field of p.simulatedFields || []) {
    evidence(`Simulated field ${field.key}`, field.evidence);
    if (!field.key || field.sd < 0 || field.min > field.max || field.mean < field.min || field.mean > field.max || !field.assumption.trim()) personaBlock(`Simulated field ${field.key || "unnamed"} needs a valid range and an explicit assumption.`);
  }
  if (new Set([...p.personaFields.map((field) => field.key), ...(p.simulatedFields || []).map((field) => field.key)]).size !== p.personaFields.length + (p.simulatedFields || []).length) personaBlock("Persona and simulated field names must be distinct.");
  if (p.assignmentStrataKey) {
    evidence("Assignment stratification", p.assignmentEvidence);
    if (![...p.personaFields.map((field) => field.key), ...(p.simulatedFields || []).map((field) => field.key)].includes(p.assignmentStrataKey)) personaBlock(`Assignment stratification field ${p.assignmentStrataKey} is not a persona trait.`);
  }
  for (const arm of p.arms) {
    evidence(`Arm ${arm.id}`, arm.evidence);
    if (!(arm.weight > 0) || !arm.conditionOrder.length || arm.conditionOrder.some((id) => !conditionIds.has(id))) personaBlock(`Arm ${arm.id} needs a valid weight and condition order.`);
    if (new Set(arm.conditionOrder).size !== arm.conditionOrder.length) fidelity(`Arm ${arm.id} repeats a condition; make repeated tasks separate conditions.`);
    const waves = arm.conditionOrder.map((id) => p.conditions.find((c) => c.id === id)?.wave || 0);
    if (waves.some((wave, i) => i > 0 && wave < waves[i - 1])) fidelity(`Arm ${arm.id} places an earlier wave after a later wave.`);
  }
  for (const c of p.conditions) {
    evidence(`Condition ${c.id}`, c.evidence);
    if (!nodeIds.has(c.entryNodeId)) runBlock(`Condition ${c.id} has no entry question.`);
    else if (p.nodes.find((n) => n.id === c.entryNodeId)?.conditionId !== c.id) {
      fidelity(`Condition ${c.id} reuses an entry question assigned to another condition; check the treatment wording.`);
    }
    if (c.defaultOptionId) {
      if (!p.nodes.find((node) => node.id === c.entryNodeId)?.options.some((option) => option.id === c.defaultOptionId)) fidelity(`Condition ${c.id} names a default choice absent from its entry question.`);
      evidence(`Condition ${c.id} default`, c.defaultEvidence);
    }
  }
  for (const n of p.nodes) {
    evidence(`Question ${n.id}`, n.evidence);
    evidence(`Question ${n.id} routing`, n.routeEvidence);
    if (n.amount != null) evidence(`Question ${n.id} amount`, n.amountEvidence);
    if (!conditionIds.has(n.conditionId) || n.options.length < 2 || n.options.length > 20 || new Set(n.options.map((o) => o.id)).size !== n.options.length) runBlock(`Question ${n.id} needs a condition and 2 to 20 distinct choices.`);
    for (const option of n.options) {
      if (option.score != null) {
        if (!Number.isFinite(option.score)) fidelity(`Question ${n.id} option ${option.id} has an invalid numeric score.`);
        else evidence(`Question ${n.id} option ${option.id} score`, option.scoreEvidence);
      }
      const next = n.nextByChoice?.[option.id];
      if (!(option.id in (n.nextByChoice || {})) || (next && !nodeIds.has(next))) runBlock(`Question ${n.id} has an incomplete choice route.`);
      if (next && p.nodes.find((x) => x.id === next)?.conditionId !== n.conditionId) fidelity(`Question ${n.id} routes into another condition.`);
    }
    if (n.valuationGroup && (!Number.isFinite(n.amount) || !n.options.some((o) => o.id === n.upperBoundOptionId))) warn(`Question ${n.id} has an incomplete valuation rule; its outcome cannot be scored.`);
  }
  for (const requirement of p.designRequirements || []) {
    evidence(`Design stage ${requirement.stage}`, requirement.evidence);
    for (const arm of p.arms) {
      const stageConditions = arm.conditionOrder.map((id) => p.conditions.find((condition) => condition.id === id)).filter((condition) => condition?.stage === requirement.stage);
      const stageNodes = p.nodes.filter((node) => stageConditions.some((condition) => condition?.id === node.conditionId));
      // Every check below compares the reconstruction with the paper's reported
      // design. A mismatch weakens the claim to replicate it, but the extracted
      // path still runs, so these report rather than block.
      if (requirement.conditionCountPerArm === requirement.decisionsPerArm) for (const condition of stageConditions) {
        if (condition && p.nodes.filter((node) => node.conditionId === condition.id).length !== 1) fidelity(`Condition ${condition.id} must contain exactly one independent decision; other decisions need their own conditions.`);
      }
      if (requirement.conditionCountPerArm != null && stageConditions.length !== requirement.conditionCountPerArm) fidelity(`Arm ${arm.id} stage ${requirement.stage} has ${stageConditions.length} of ${requirement.conditionCountPerArm} required decision occasions.`);
      if (requirement.varyingParameterKeys?.length && stageConditions.length < requirement.decisionsPerArm) fidelity(`Arm ${arm.id} stage ${requirement.stage} needs a separate scenario for each of its ${requirement.decisionsPerArm} changing-parameter decisions.`);
      if (stageNodes.length < requirement.decisionsPerArm) fidelity(`Arm ${arm.id} has ${stageNodes.length} of ${requirement.decisionsPerArm} required decisions in stage ${requirement.stage}.`);
      if (requirement.optionsPerDecision && stageNodes.some((node) => node.options.length !== requirement.optionsPerDecision)) fidelity(`Arm ${arm.id} stage ${requirement.stage} needs ${requirement.optionsPerDecision} choices per decision.`);
      for (const condition of stageConditions) for (const key of requirement.requiredParameterKeys || []) if (condition && !Object.hasOwn(condition.parameters || {}, key)) fidelity(`Condition ${condition.id} is missing required parameter ${key}.`);
      for (const key of requirement.varyingParameterKeys || []) if (new Set(stageConditions.map((condition) => condition?.parameters?.[key])).size < Math.min(2, stageConditions.length)) fidelity(`Arm ${arm.id} stage ${requirement.stage} does not vary parameter ${key} as reported.`);
      if (requirement.defaultByArm && Object.hasOwn(requirement.defaultByArm, arm.id) && stageConditions.some((condition) => (condition?.defaultOptionId || null) !== requirement.defaultByArm?.[arm.id])) fidelity(`Arm ${arm.id} stage ${requirement.stage} has the wrong default choice.`);
    }
  }
  for (const benchmark of p.benchmarks) {
    evidence(`Benchmark ${benchmark.id}`, benchmark.evidence);
    if (benchmark.ruleId && !p.analysisRules.some((r) => r.id === benchmark.ruleId)) warn(`Benchmark ${benchmark.id} has no matching outcome rule.`);
  }
  const valuationGroups = new Set(p.nodes.map((n) => n.valuationGroup).filter(Boolean));
  for (const rule of p.analysisRules) {
    evidence(`Outcome ${rule.id}`, rule.evidence);
    const legacyChoiceMean = rule.kind === "mean_valuation" && !!rule.nodeId && p.conditions.some((c) => c.id === rule.group) && p.nodes.some((n) => n.id === rule.nodeId);
    if (["median_valuation", "mean_valuation"].includes(rule.kind) && !valuationGroups.has(rule.group) && !legacyChoiceMean) warn(`Outcome ${rule.id} names an unknown valuation group.`);
    if (legacyChoiceMean) {
      const node = p.nodes.find((n) => n.id === rule.nodeId)!;
      if (node.options.some((option) => optionPercent(option.text) === null)) warn(`Outcome ${rule.id} cannot score every option as a percentage.`);
      if (node.conditionId !== rule.group) warn(`Outcome ${rule.id} reuses a question assigned to another condition; check the treatment wording.`);
    }
    if (["mean_abs_log_spread", "pearson_correlation"].includes(rule.kind) && (!Array.isArray(rule.groups) || rule.groups.length !== 2 || rule.groups.some((g) => !valuationGroups.has(g)))) warn(`Outcome ${rule.id} needs two known valuation groups.`);
    if (rule.kind === "choice_share" && (!nodeIds.has(rule.nodeId || "") || !p.nodes.find((n) => n.id === rule.nodeId)?.options.some((o) => o.id === rule.optionId) || (rule.group && p.nodes.find((n) => n.id === rule.nodeId)?.conditionId !== rule.group))) warn(`Outcome ${rule.id} needs a valid question, condition, and choice; it will not be scored.`);
    if (["mean_choice_score", "median_choice_score", "sd_choice_score"].includes(rule.kind)) {
      const node = p.nodes.find((n) => n.id === rule.nodeId);
      if (rule.scoreEvidence) evidence(`Outcome ${rule.id} choice scores`, rule.scoreEvidence);
      if (!node || !p.conditions.some((c) => c.id === rule.group) || node.options.some((option) => !Number.isFinite(rule.optionScores ? rule.optionScores[option.id] : option.score))) warn(`Outcome ${rule.id} needs a valid scored choice question and condition; it will not be scored.`);
      else if (node.conditionId !== rule.group) fidelity(`Outcome ${rule.id} uses a question assigned to another condition.`);
    }
    if (["stage_mean_choice_score", "stage_choice_share"].includes(rule.kind) && !p.conditions.some((condition) => condition.stage === rule.stage)) warn(`Outcome ${rule.id} names an unknown study stage.`);
    if (["arm_difference_choice_score", "arm_difference_choice_share"].includes(rule.kind) && (!Array.isArray(rule.armIds) || rule.armIds.length !== 2 || rule.armIds.some((id) => !p.arms.some((arm) => arm.id === id)))) warn(`Outcome ${rule.id} needs two known assignment arms.`);
    if (!(ANALYSIS_KINDS as readonly string[]).includes(rule.kind)) warn(`Outcome ${rule.id} uses an unsupported calculation.`);
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
    if (p.nodes.some((n) => n.conditionId === c.id && !reached.has(n.id))) fidelity(`Condition ${c.id} has unreachable questions.`);
  }
  if (p.conditions.some((c) => c.wave > 1)) {
    if (p.waveGapDays != null && (!Number.isFinite(p.waveGapDays) || p.waveGapDays < 0)) {
      runBlock("The recorded gap between stages must be a nonnegative number of days.");
    } else if (p.waveGapDays != null) {
      evidence("Wave timing", p.waveGapEvidence);
    }
  }
  if (p.analysisRules.some((rule) => rule.kind === "pearson_correlation")) warn("A published correlation is usually estimated with controls for the study's own manipulations; the runner computes a raw correlation, which is not directly comparable.");
  return done();
}

function optionPercent(text: string): number | null {
  const match = text.match(/(?:^|[^\d])(\d+(?:\.\d+)?)\s*%\s*(?:co[\s-]?insurance|co[\s-]?payment)/i);
  return match ? Number(match[1]) : null;
}

export function checkProtocol(p: ExperimentProtocol, sources: SourceFile[]): string[] {
  return auditProtocol(p, sources).checks;
}

/**
 * Structural checks on freshly compiled questions, before they join the
 * protocol. The shape a condition must have comes from its own stage
 * requirement, not from the name of any particular study.
 */
export function compiledNodeIssues(p: ExperimentProtocol, conditionIds: string[]): string[] {
  const issues: string[] = [];
  for (const conditionId of conditionIds) {
    const condition = p.conditions.find((item) => item.id === conditionId);
    if (!condition) { issues.push(`Unknown condition ${conditionId}.`); continue; }
    const nodes = p.nodes.filter((node) => node.conditionId === conditionId);
    if (!nodes.length) { issues.push(`Condition ${conditionId} has no question.`); continue; }
    if (!nodes.some((node) => node.id === condition.entryNodeId)) issues.push(`Condition ${conditionId} is missing its planned entry question.`);
    const requirement = (p.designRequirements || []).find((item) => item.stage === condition.stage);
    // One planned condition per planned decision means this condition carries a
    // single independent decision and must end there.
    const singleDecision = !!requirement && requirement.conditionCountPerArm != null && requirement.conditionCountPerArm >= requirement.decisionsPerArm;
    if (singleDecision) {
      if (nodes.length !== 1) issues.push(`Condition ${conditionId} is one independent decision and must contain exactly one question; other periods and questions have their own conditions.`);
      if (nodes.some((node) => Object.values(node.nextByChoice).some((next) => next !== null))) issues.push(`Condition ${conditionId} must end after its single independent decision.`);
      continue;
    }
    const terminals: number[] = [];
    const visit = (id: string, depth: number, seen: Set<string>) => {
      if (seen.has(id)) { issues.push(`Condition ${conditionId} contains a branching loop.`); return; }
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node) { issues.push(`Condition ${conditionId} routes to question ${id}, which was not returned.`); return; }
      // An elicitation path scored by valuation bounds needs its offer amount
      // and the choice that caps the respondent's value on every step.
      if (node.valuationGroup && (!Number.isFinite(node.amount) || !node.options.some((option) => option.id === node.upperBoundOptionId))) issues.push(`Question ${node.id} needs a source-backed amount and the choice that sets an upper valuation bound.`);
      const routes = Object.values(node.nextByChoice);
      if (!routes.length) issues.push(`Question ${node.id} has no choice routes.`);
      for (const next of routes) { if (next === null) terminals.push(depth); else visit(next, depth + 1, new Set([...seen, id])); }
    };
    visit(condition.entryNodeId, 1, new Set());
    if (!terminals.length) issues.push(`Condition ${conditionId} has no question path that ends.`);
    if (requirement?.decisionsPerArm && terminals.some((length) => length < requirement.decisionsPerArm)) issues.push(`Condition ${conditionId} has a path of ${Math.min(...terminals)} decisions; the source describes ${requirement.decisionsPerArm}.`);
  }
  return [...new Set(issues)];
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
/** A fresh seed, so each generation draws a different synthetic sample. */
export function randomSeed(): string {
  const bytes = new Uint32Array(2);
  if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else { bytes[0] = Math.floor(Math.random() * 2 ** 32); bytes[1] = Date.now() >>> 0; }
  return `${bytes[0].toString(36)}${bytes[1].toString(36)}`;
}

export function generatePersonas(p: ExperimentProtocol, count: number, seed: string): Persona[] {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error("Choose between 1 and 10,000 personas.");
  const random = rngFor(seed);
  const format = (value: number, integer: boolean) => String(integer ? Math.round(value) : Number(value.toFixed(2)));
  // A paper's reported mean and SD, kept inside what the attribute can be.
  const sampledValue = (field: SimulatedField) => {
    const { min, max, integer } = constrainToLogic(field.key, { min: field.min, max: field.max, integer: field.integer });
    return format(truncatedNormal(random, field.mean, field.sd, min, max), integer);
  };
  // An attribute the instrument needs that the paper never described as a
  // distribution. It is drawn uniformly across a stated plausible range,
  // narrowed to what the attribute can be. Without a range it stays blank
  // rather than being invented.
  const drawnValue = (key: string, range?: { min?: number; max?: number; integer?: boolean }) => {
    const logical = logicalBounds(key);
    const { min, max, integer } = constrainToLogic(key, {
      min: range?.min ?? logical.min,
      max: range?.max ?? logical.max,
      integer: range?.integer ?? logical.integer,
    });
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return "";
    return format(uniform(random, min, max), integer);
  };
  const declared = new Set([...p.personaFields.map((field) => field.key), ...(p.simulatedFields || []).map((field) => field.key)]);
  const personas = Array.from({ length: count }, (_, i) => ({
    id: `P${String(i + 1).padStart(5, "0")}`,
    armId: weighted(p.arms, random).id,
    fields: harmonizeAges(Object.fromEntries([
      ...p.personaFields.filter((f) => !/^(condition|arm|wave|assignment|order)(_|$)/i.test(f.key)).map((f) => [f.key, f.values.length ? weighted(f.values, random).value : drawnValue(f.key)]),
      ...(p.simulatedFields || []).map((field) => [field.key, sampledValue(field)]),
      ...(p.requiredNumericFields || []).filter((field) => !declared.has(field.key)).map((field) => [field.key, drawnValue(field.key, field)]),
    ]) as Record<string, string>),
  }));
  if (p.instrumentSpec) personas.forEach((persona) => brownAssignment(persona, seed));
  if (p.assignmentStrataKey && p.arms.length > 1) {
    const ordered = [...personas].sort((a, b) => Number(a.fields[p.assignmentStrataKey!]) - Number(b.fields[p.assignmentStrataKey!]));
    if (ordered.every((persona) => Number.isFinite(Number(persona.fields[p.assignmentStrataKey!]))) && p.arms.every((arm) => arm.weight > 0)) {
      const totalWeight = p.arms.reduce((sum, arm) => sum + arm.weight, 0);
      const assigned = new Map(p.arms.map((arm) => [arm.id, 0]));
      for (const persona of ordered) {
        const deficit = (arm: ExperimentArm) => arm.weight / totalWeight * count - assigned.get(arm.id)!;
        const arm = [...p.arms].sort((a, b) => deficit(b) - deficit(a))[0];
        persona.armId = arm.id;
        assigned.set(arm.id, assigned.get(arm.id)! + 1);
      }
    }
  }
  return personas;
}
export function renderPrompt(template: string, persona: Persona): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => persona.fields[key] ?? `[${key} missing]`);
}
export function nextTask(p: ExperimentProtocol, persona: Persona, trials: Trial[], now = Date.now()): { condition: ExperimentCondition; node: ExperimentNode; availableAt?: string } | null {
  if (p.instrumentSpec) return brownTask(p, persona, trials, now);
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
  if (p.instrumentSpec) {
    const completed = personas.filter((persona) => !brownTask(p, persona, trials, Number.MAX_SAFE_INTEGER)).length;
    return { completed, total: personas.length, percent: personas.length ? Math.round(completed / personas.length * 100) : 0 };
  }
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
      const trialAmount = p.instrumentSpec ? Number(trial.scenario?.lump_sum) : node?.amount;
      const trialGroup = p.instrumentSpec ? String(trial.scenario?.valuation_group || "") : node?.valuationGroup;
      const upperChoice = p.instrumentSpec ? "2" : node?.upperBoundOptionId;
      if (trialGroup !== group || !Number.isFinite(trialAmount)) continue;
      if (trial.choice === upperChoice) upper = Math.min(upper ?? Infinity, trialAmount!);
      else lower = Math.max(lower ?? -Infinity, trialAmount!);
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
  // A pooled measure counts a response by its option ID when the paper names
  // one, or by matching the chosen option's text when the same answer appears
  // under different IDs across decision occasions.
  const matchesOption = (rule: AnalysisRule, trial: Trial) => {
    if (rule.optionId && trial.choice === rule.optionId) return true;
    if (!rule.optionMatch) return false;
    const text = trial.options.find((option) => option.id === trial.choice)?.text || "";
    try { return new RegExp(rule.optionMatch, "i").test(text); } catch { return text.toLowerCase().includes(rule.optionMatch.toLowerCase()); }
  };
  const armFilter = (rule: AnalysisRule, trial: Trial) => !rule.armIds?.length || rule.armIds.includes(trial.armId);
  const outcomes = p.analysisRules.map((rule) => {
    let value: number | null = null;
    let count = 0;
    let note: OutcomeNote = null;
    let unit = rule.unit || "";
    let choiceBreakdown: { label: string; count: number }[] = [];
    const choiceNode = rule.kind === "mean_valuation" && rule.nodeId && p.conditions.some((c) => c.id === rule.group) ? p.nodes.find((n) => n.id === rule.nodeId) : null;
    const scoredNode = ["mean_choice_score", "median_choice_score", "sd_choice_score"].includes(rule.kind) && rule.nodeId ? p.nodes.find((n) => n.id === rule.nodeId && n.conditionId === rule.group) : null;
    if (scoredNode) {
      const selected = trials.filter((trial) => trial.conditionId === rule.group && trial.nodeId === scoredNode.id);
      choiceBreakdown = scoredNode.options.map((option) => ({ label: option.text, count: selected.filter((trial) => trial.choice === option.id).length }));
      const optionScores = new Map(scoredNode.options.map((option) => [option.id, rule.optionScores ? rule.optionScores[option.id] : option.score]));
      const numbers = selected.map((trial) => optionScores.get(trial.choice)).filter((number): number is number => number != null && Number.isFinite(number));
      count = numbers.length;
      value = rule.kind === "median_choice_score" ? median(numbers) : rule.kind === "sd_choice_score" ? (numbers.length > 1 ? Math.sqrt(numbers.reduce((sum, number) => sum + (number - mean(numbers)!) ** 2, 0) / (numbers.length - 1)) : null) : mean(numbers);
    } else if (choiceNode) {
      unit = "%";
      const optionValues = new Map(choiceNode.options.map((option) => [option.id, optionPercent(option.text)]));
      const selected = trials.filter((trial) => trial.conditionId === rule.group && trial.nodeId === choiceNode.id);
      choiceBreakdown = choiceNode.options.map((option) => ({ label: option.text, count: selected.filter((trial) => trial.choice === option.id).length }));
      const numbers = selected
        .map((trial) => optionValues.get(trial.choice)).filter((number): number is number => number != null);
      count = numbers.length;
      value = mean(numbers);
      note = choiceNode.conditionId !== rule.group
        ? "Partial result from the extracted choices. This arm reused a question assigned to another condition; it cannot be compared with the published measure."
        : "Partial result from the extracted choices. Confirm the full set of policies and periods before comparing with the published measure.";
    } else if (rule.kind === "median_valuation" || rule.kind === "mean_valuation") {
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
      const relevant = trials.filter((t) => t.nodeId === rule.nodeId && (!rule.group || t.conditionId === rule.group)); count = relevant.length;
      value = count && rule.optionId && p.nodes.find((node) => node.id === rule.nodeId)?.options.some((option) => option.id === rule.optionId)
        ? 100 * relevant.filter((t) => t.choice === rule.optionId).length / count : null;
    } else if (rule.kind === "stage_mean_choice_score" || rule.kind === "stage_choice_share") {
      // A measure the paper reports over a whole stage, pooling every decision
      // occasion in it rather than one question.
      const stageConditions = new Set(p.conditions.filter((condition) => condition.stage === rule.stage).map((condition) => condition.id));
      const relevant = trials.filter((trial) => stageConditions.has(trial.conditionId) && armFilter(rule, trial));
      count = relevant.length;
      if (rule.kind === "stage_choice_share") {
        unit = "%";
        value = count ? 100 * relevant.filter((trial) => matchesOption(rule, trial)).length / count : null;
      } else {
        const numbers = relevant.map((trial) => rule.optionScores?.[trial.choice]).filter((number): number is number => Number.isFinite(number));
        count = numbers.length;
        value = mean(numbers);
      }
    } else if (rule.kind === "arm_difference_choice_score" || rule.kind === "arm_difference_choice_share") {
      // The treatment contrast a paper reports between two assignment arms.
      const scope = (armId: string) => trials.filter((trial) => trial.armId === armId && (!rule.stage || p.conditions.some((condition) => condition.id === trial.conditionId && condition.stage === rule.stage)) && (!rule.nodeId || trial.nodeId === rule.nodeId));
      const side = (armId: string) => {
        const relevant = scope(armId);
        if (rule.kind === "arm_difference_choice_share") return relevant.length ? 100 * relevant.filter((trial) => matchesOption(rule, trial)).length / relevant.length : null;
        return mean(relevant.map((trial) => rule.optionScores?.[trial.choice]).filter((number): number is number => Number.isFinite(number)));
      };
      const [first, second] = rule.armIds || [];
      const a = first ? side(first) : null;
      const b = second ? side(second) : null;
      count = (first ? scope(first).length : 0) + (second ? scope(second).length : 0);
      if (rule.kind === "arm_difference_choice_share") unit = unit || "pp";
      value = a != null && b != null ? a - b : null;
    }
    const comparisonNote = rule.kind === "pearson_correlation" ? "Published correlations are usually adjusted; this is a raw correlation" : null;
    return { id: rule.id, label: rule.label, value, count, unit, note, choiceBreakdown, benchmark: p.benchmarks.find((b) => b.ruleId === rule.id || (rule.kind === "median_valuation" && b.valuationGroup === rule.group)) ?? null, comparisonNote };
  });
  const comparedIds = new Set(outcomes.map((outcome) => outcome.benchmark?.id).filter(Boolean));
  const uncomputed = p.benchmarks.filter((benchmark) => !comparedIds.has(benchmark.id)).map((benchmark) => ({ id: `benchmark:${benchmark.id}`, label: benchmark.label, value: null, count: 0, unit: benchmark.unit, note: null, choiceBreakdown: [], benchmark, comparisonNote: "No executable calculation for this published measure." }));
  return { completedPersonas: personas.filter((x) => !nextTask(p, x, trials)).length, trials: trials.length, summaries, valuations, outcomes: [...outcomes, ...uncomputed] };
}
