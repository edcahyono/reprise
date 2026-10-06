import type { Evidence, ExperimentArm, ExperimentCondition, ExperimentNode, ExperimentProtocol, Persona, SourceFile, Trial } from "./experiment";

type Matrix = (number | null)[][];
export type BrownSpec = { kind: "brown-annuity-2017"; matrices: Record<"low" | "medium" | "high", Matrix>; appendixSource: string };

// Appendix B, A-33–A-35. Null cells are never reached by the ROW update rule.
const matrices: BrownSpec["matrices"] = {
  low: [
    [10000,4000,2000,1000,500],[null,null,null,null,1500],[null,null,null,3000,2500],[null,null,null,null,3500],
    [null,null,7000,5500,4750],[null,null,null,null,6250],[null,null,null,8500,7750],[null,null,null,null,9250],
    [null,30000,20000,15000,12500],[null,null,null,null,17500],[null,null,null,25000,22500],[null,null,null,null,27500],
    [null,null,60000,40000,35000],[null,null,null,null,50000],[null,null,null,100000,80000],[null,null,null,null,200000],
  ],
  medium: [
    [20000,4000,2000,1000,500],[null,null,null,null,1500],[null,null,null,3000,2500],[null,null,null,null,3500],
    [null,null,10000,7000,5500],[null,null,null,null,8500],[null,null,null,15000,12500],[null,null,null,null,17500],
    [null,60000,30000,25000,22500],[null,null,null,null,27500],[null,null,null,40000,35000],[null,null,null,null,50000],
    [null,null,100000,80000,70000],[null,null,null,null,90000],[null,null,null,200000,150000],[null,null,null,null,500000],
  ],
  high: [
    [30000,10000,4000,2000,1000],[null,null,null,null,3000],[null,null,null,7000,5500],[null,null,null,null,8500],
    [null,null,20000,15000,12500],[null,null,null,null,17500],[null,null,null,25000,22500],[null,null,null,null,27500],
    [null,60000,40000,35000,32500],[null,null,null,null,37500],[null,null,null,50000,45000],[null,null,null,null,55000],
    [null,null,100000,80000,70000],[null,null,null,null,90000],[null,null,null,200000,150000],[null,null,null,null,500000],
  ],
};

const compact = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const pageText = (source: SourceFile, page: number) => source.text.match(new RegExp(`\\[Page ${page}\\]([\\s\\S]*?)(?=\\[Page \\d+\\]|$)`))?.[1] || "";
const evidence = (source: string, quote: string): Evidence => ({ source, quote });
const money = (amount: number) => `$${amount.toLocaleString("en-US")}`;

export function brownAppendix(sources: SourceFile[]): SourceFile | null {
  return sources.find((source) => {
    const text = compact(source.text);
    return text.includes("onlineappendixbsurveyinstrument") && text.includes("lsstartvalue") && text.includes("lslow") && text.includes("nop olrisk".replace(" ", ""));
  }) || null;
}

function verifyMatrices(source: SourceFile): boolean {
  return ([33,34,35] as const).every((page, index) => {
    const text = compact(pageText(source, page));
    const matrix = matrices[(["low","medium","high"] as const)[index]];
    return text.includes(`table${index + 1}`) && matrix.every((row) => row.every((amount) => amount == null || text.includes(String(amount))));
  });
}

export function buildBrownProtocol(sources: SourceFile[]): ExperimentProtocol {
  const appendix = brownAppendix(sources);
  if (!appendix || !verifyMatrices(appendix)) throw new Error("Appendix B's survey instrument and all three amount matrices must be readable before building the experiment.");
  const source = appendix.name;
  const waveQuote = "We fielded the survey in two waves.";
  const amountQuote = "LS_STARTVALUE";
  const loopQuote = "Set ROW=1";
  const sectionQuote = "Survey Instrument";
  const condition = (id: string, label: string, wave: number, stage: string, measure: string, increment: string): ExperimentCondition => ({
    id, label, wave, stage, entryNodeId: `${id}_entry`, parameters: { measure, increment }, evidence: evidence(source, waveQuote),
  });
  const conditions: ExperimentCondition[] = [];
  for (const wave of [1,2]) {
    for (const increment of ["100","500","benefit","random"]) conditions.push(condition(`cv_sell_${increment}_w${wave}`, `CV-Sell ${increment} monthly benefit change, wave ${wave}`, wave, "cv_sell", "cv_sell", increment));
    for (const measure of ["cv_buy","ev_sell","ev_buy"]) conditions.push(condition(`${measure}_w${wave}`, `${measure.replace("_", "-").toUpperCase()}, wave ${wave}`, wave, "other_tradeoffs", measure, "100"));
  }
  conditions.push(condition("no_political_risk", "CV-Sell without political risk", 2, "no_political_risk", "no_political_risk", "100"));
  const arms: ExperimentArm[] = [];
  const orders = [
    ["cv_buy","ev_sell","ev_buy"],["cv_buy","ev_buy","ev_sell"],["ev_sell","cv_buy","ev_buy"],
    ["ev_sell","ev_buy","cv_buy"],["ev_buy","cv_buy","ev_sell"],["ev_buy","ev_sell","cv_buy"],
  ];
  for (const version of ["A","B"] as const) for (let order = 0; order < 6; order++) {
    const sellWave = version === "A" ? 1 : 2;
    const otherWave = version === "A" ? 2 : 1;
    const sell = ["100","500","benefit","random"].map((increment) => `cv_sell_${increment}_w${sellWave}`);
    const other = orders[order].map((measure) => `${measure}_w${otherWave}`);
    arms.push({ id: `version_${version}_order_${order + 1}`, label: `Version ${version}, tradeoff order ${order + 1}`, weight: 1, conditionOrder: version === "A" ? [...sell,...other,"no_political_risk"] : [...other,...sell,"no_political_risk"], evidence: evidence(source, "VERSION_A") });
  }
  const nodes: ExperimentNode[] = conditions.map((item) => ({ id: item.entryNodeId, conditionId: item.id, prompt: "Adaptive question generated from Appendix B", options: [{ id: "1", text: "Option 1" }, { id: "2", text: "Option 2" }], nextByChoice: { "1": null, "2": null }, valuationGroup: `${item.parameters?.measure}_${item.parameters?.increment}`, evidence: evidence(source, sectionQuote), routeEvidence: evidence(source, loopQuote), amountEvidence: evidence(source, amountQuote) }));
  const groups = [...new Set(nodes.map((node) => node.valuationGroup!))];
  return {
    title: "Cognitive Constraints on Valuing Annuities", sampleSize: null, sampleSizeEvidence: null, waveGapDays: 14,
    waveGapEvidence: evidence(source, waveQuote), personaFields: [], simulatedFields: [],
    designRequirements: [{ stage: "brown_valuation", decisionsPerArm: 1, evidence: evidence(source, sectionQuote) }],
    arms, conditions, nodes, analysisRules: groups.map((group) => ({ id: `median_${group}`, label: `Median elicited valuation: ${group.replaceAll("_", " ")}`, kind: "median_valuation" as const, group, unit: "$", evidence: evidence(source, amountQuote) })), benchmarks: [], unresolved: [], missingExecutable: [],
    sourceNotes: "Appendix B: randomized versions and order, source amount matrices, adaptive valuation choices, and the political-risk question.",
    brownSpec: { kind: "brown-annuity-2017", matrices, appendixSource: source },
  };
}

export function brownAssignment(persona: Persona, seed: string) {
  // Independent assignment variables in Appendix B, A-31.
  let value = 2166136261;
  for (const char of `${seed}:${persona.id}`) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  const draw = () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; };
  persona.fields.ls_startvalue = (["low","medium","high"] as const)[Math.floor(draw() * 3)];
  persona.fields.ls_first = String(Math.floor(draw() * 2));
  persona.fields.small_to_large = String(Math.floor(draw() * 2));
  persona.fields.brown_random_draw = String(draw());
}

export function brownTask(p: ExperimentProtocol, persona: Persona, trials: Trial[], now: number): { condition: ExperimentCondition; node: ExperimentNode; availableAt?: string } | null {
  const spec = p.brownSpec;
  if (!spec) return null;
  const arm = p.arms.find((item) => item.id === persona.armId);
  if (!arm) return null;
  const benefit = Number(persona.fields.benefit_monthly);
  if (!Number.isFinite(benefit) || benefit < 200) throw new Error("The participant needs a monthly Social Security benefit of at least $200.");
  const randomCandidates = benefit < 300 ? [] : benefit < 600 ? [200,300,400].filter((x) => x <= benefit - 100) : [200,300,400,600,700,800,900,1000,1100,1200,1300,1400,1500,1600,1700,1800,1900,2000].filter((x) => x <= benefit - 100);
  const randomIncrement = randomCandidates[Math.floor((Number(persona.fields.brown_random_draw) || 0) * randomCandidates.length)] || 200;
  const incrementOf = (condition: ExperimentCondition) => condition.parameters?.increment === "benefit" ? benefit : condition.parameters?.increment === "random" ? randomIncrement : Number(condition.parameters?.increment);
  const valid = arm.conditionOrder.map((id) => p.conditions.find((item) => item.id === id)!).filter((item) => item && (item.stage !== "cv_sell" || item.parameters?.increment === "100" || item.parameters?.increment === "benefit" || (item.parameters?.increment === "500" ? benefit >= 600 : benefit >= 300)));
  const sell = valid.filter((item) => item.stage === "cv_sell").sort((a,b) => incrementOf(a)-incrementOf(b));
  if (persona.fields.small_to_large === "0") sell.reverse();
  const ordered = valid.map((item) => item.stage === "cv_sell" ? sell.shift()! : item);
  const matrix = spec.matrices[(persona.fields.ls_startvalue as keyof BrownSpec["matrices"]) || "medium"] || spec.matrices.medium;
  for (const condition of ordered) {
    const own = trials.filter((item) => item.personaId === persona.id && item.conditionId === condition.id);
    const rounds = condition.stage === "cv_sell" && incrementOf(condition) === 100 ? 5 : 4;
    if (own.length >= rounds) continue;
    const previousWave = trials.filter((item) => item.personaId === persona.id && item.wave < condition.wave).map((item) => Date.parse(item.at)).filter(Number.isFinite);
    const due = previousWave.length && p.waveGapDays ? Math.max(...previousWave) + p.waveGapDays * 86400000 : 0;
    let row = 1;
    for (let index = 0; index < own.length; index++) if (own[index].choice === "1") row += 2 ** (4 - (index + 1));
    const round = own.length + 1;
    const amount = matrix[row - 1]?.[round - 1];
    if (amount == null) throw new Error(`Appendix B amount matrix has no value for row ${row}, round ${round}.`);
    const change = incrementOf(condition);
    const lower = Math.max(0, benefit - change);
    const status = `your ${persona.fields.ss_status === "expected" ? "expected" : "current"} Social Security benefit of ${money(benefit)} per month`;
    const paymentTime = Number(persona.fields.claim_age) > Number(persona.fields.age) + 1 ? `at age ${persona.fields.claim_age}` : "one year from now";
    let one: string, two: string;
    switch (condition.parameters?.measure) {
      case "cv_buy": one = `Receiving a Social Security benefit of ${money(benefit + change)} per month and making a one-time payment of ${money(amount)} ${paymentTime} to Social Security.`; two = `Receiving ${status}.`; break;
      case "ev_sell": one = `Receiving a Social Security benefit of ${money(benefit + change)} per month.`; two = `Receiving ${status} and receiving a one-time payment of ${money(amount)} ${paymentTime}.`; break;
      case "ev_buy": one = `Receiving ${status} and making a one-time payment of ${money(amount)} ${paymentTime} to Social Security.`; two = lower === 0 ? "Receiving no Social Security benefits." : `Receiving a Social Security benefit of ${money(lower)} per month.`; break;
      default: one = `Receiving ${status}.`; two = lower === 0 ? `Receiving no Social Security benefits but receiving a one-time payment of ${money(amount)} ${paymentTime}.` : `Receiving a Social Security benefit of ${money(lower)} per month and receiving a one-time payment of ${money(amount)} ${paymentTime}.`;
    }
    const first = persona.fields.ls_first === "1" ? [one,two].sort((a,b) => Number(b.includes("one-time"))-Number(a.includes("one-time"))) : [one,two].sort((a,b) => Number(a.includes("one-time"))-Number(b.includes("one-time")));
    const label = (value: string) => value === one ? "1" : "2";
    const prompt = `${condition.stage === "no_political_risk" ? "Please assume that you are absolutely certain to receive all income promised as future Social Security benefits or as a future one-time payment. " : ""}Please assume that all amounts shown are after tax. Think of any dollar amount in terms of what a dollar buys you today because Social Security adjusts future dollar amounts for inflation. ${persona.fields.married === "yes" ? "Benefits paid to your spouse will stay the same for either choice. " : ""}Please click on the option that you would prefer. Suppose Social Security gave you a choice between:`;
    const node: ExperimentNode = { id: `${condition.id}_r${round}_row${row}`, conditionId: condition.id, prompt, options: first.map((value) => ({ id: label(value), text: value })), nextByChoice: { "1": null, "2": null }, amount, valuationGroup: `${condition.parameters?.measure}_${condition.parameters?.increment}`, upperBoundOptionId: "2", evidence: evidence(spec.appendixSource, "Suppose Social Security gave you a choice between:"), routeEvidence: evidence(spec.appendixSource, "Set ROW=ROW+2^(4-j)"), amountEvidence: evidence(spec.appendixSource, "LS_AMT[ROW,j]") };
    return { condition, node, ...(due > now ? { availableAt: new Date(due).toISOString() } : {}) };
  }
  return null;
}

export function brownAudit(p: ExperimentProtocol, sources: SourceFile[]): string[] {
  if (!p.brownSpec) return [];
  const source = brownAppendix(sources);
  const issues: string[] = [];
  if (!source || !verifyMatrices(source)) issues.push("Appendix B's complete amount matrices are required.");
  if (p.brownSpec.appendixSource !== source?.name || JSON.stringify(p.brownSpec.matrices) !== JSON.stringify(matrices)) issues.push("The executable amount matrices differ from Appendix B.");
  if (p.arms.length !== 12 || p.arms.some((arm) => arm.conditionOrder.length !== 8)) issues.push("Both wave versions and all six orders of the three other tradeoffs are required.");
  for (const arm of p.arms) {
    const order = arm.conditionOrder.map((id) => p.conditions.find((item) => item.id === id));
    if (order.some((item) => !item) || new Set(order.map((item) => item!.id)).size !== 8 || order.filter((item) => item?.stage === "cv_sell").length !== 4 || order.filter((item) => item?.stage === "other_tradeoffs").length !== 3 || order[7]?.stage !== "no_political_risk" || new Set(order.filter((item) => item?.stage === "cv_sell").map((item) => item!.wave)).size !== 1 || new Set(order.filter((item) => item?.stage === "other_tradeoffs").map((item) => item!.wave)).size !== 1 || order[0]!.wave === order[4]!.wave) issues.push(`Arm ${arm.id} has an incomplete or incorrectly ordered two-wave survey.`);
  }
  if (!p.conditions.some((item) => item.stage === "no_political_risk" && item.wave === 2)) issues.push("The no-political-risk question must follow in wave 2.");
  if (p.missingExecutable?.length) issues.push(...p.missingExecutable);
  return issues;
}
