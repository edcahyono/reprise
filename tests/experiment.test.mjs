import test from "node:test";
import assert from "node:assert/strict";
import { auditProtocol, checkProtocol, experimentProgress, generatePersonas, nextTask, results, reviewFindingKind, sourceQuoteMatches, sourceQuotePage } from "../lib/experiment.ts";
import { applyProtocolChanges } from "../lib/protocol-patch.ts";
import { personaColumns, personaCell, personasToCsv } from "../lib/persona-export.ts";
import { pdfPageText } from "../lib/pdf-text.ts";
import { issueQuery, keywordRank, sourcePassages, vectorRank } from "../lib/source-retrieval.ts";

const source = { name: "study.txt", text: "Twenty respondents. Two arms. Question one asks about 100 dollars. Question two asks about 200 dollars." };
const evidence = (quote) => ({ source: source.name, quote });
const protocol = {
  title: "Fixture", sampleSize: 20, sampleSizeEvidence: evidence("Twenty respondents"), waveGapDays: null, waveGapEvidence: null,
  personaFields: [{ key: "type", values: [{ value: "careful", weight: 1 }], evidence: evidence("respondents") }],
  arms: [{ id: "a", label: "A", weight: 1, conditionOrder: ["sell"], evidence: evidence("Two arms") }],
  conditions: [{ id: "sell", label: "Sell", wave: 1, entryNodeId: "q1", evidence: evidence("Question one") }],
  nodes: [
    { id: "q1", conditionId: "sell", prompt: "Take 100 dollars?", options: [{ id: "annuity", text: "Keep annuity" }, { id: "cash", text: "Take cash" }], nextByChoice: { annuity: "q2", cash: "q2" }, amount: 100, valuationGroup: "sell", upperBoundOptionId: "cash", evidence: evidence("100 dollars"), routeEvidence: evidence("Question one"), amountEvidence: evidence("100 dollars") },
    { id: "q2", conditionId: "sell", prompt: "Take 200 dollars?", options: [{ id: "annuity", text: "Keep annuity" }, { id: "cash", text: "Take cash" }], nextByChoice: { annuity: null, cash: null }, amount: 200, valuationGroup: "sell", upperBoundOptionId: "cash", evidence: evidence("200 dollars"), routeEvidence: evidence("Question two"), amountEvidence: evidence("200 dollars") },
  ],
  analysisRules: [{ id: "median_sell", label: "Median sell valuation", kind: "median_valuation", group: "sell", evidence: evidence("Question one") }],
  benchmarks: [], unresolved: [], sourceNotes: "",
};

test("source and route checks reject unsupported details", () => {
  assert.deepEqual(checkProtocol(protocol, [source]), []);
  const unsupported = structuredClone(protocol);
  unsupported.nodes[0].evidence.quote = "not in the source";
  assert.match(checkProtocol(unsupported, [source]).join(" "), /could not be verified/);
});

test("source retrieval preserves citations and finds a relevant branching passage", () => {
  const pages = sourcePassages([{ name: "instrument.pdf", text: "[Page 1] Introductory survey text about retirement benefits, participant consent, and general financial decisions before the choice tasks begin. [Page 2] In the sell condition, rejecting the lump sum leads to a higher offer in the next question. The question asks for a choice between an annuity and cash." }], 150, 20);
  assert.equal(pages[0].page, 1);
  assert.ok(pages.some((passage) => passage.page === 2));
  const query = issueQuery("Question q1 has an incomplete choice route.", protocol);
  assert.match(query, /Take 100 dollars/);
  assert.equal(pages[keywordRank(pages, "sell condition lump sum higher offer", 1)[0]].page, 2);
  assert.deepEqual(vectorRank([[1, 0], [0, 1]], [0, 1], 1), [1]);
});

test("source warnings do not prevent a pilot, while broken routes do", () => {
  const quoted = structuredClone(protocol);
  quoted.unresolved.push("Full questionnaire is in a separate appendix");
  quoted.nodes[0].evidence.quote = "a phrase absent from the source";
  const review = auditProtocol(quoted, [source]);
  assert.equal(review.personaBlockers.length, 0);
  assert.equal(review.runBlockers.length, 0);
  assert.ok(review.warnings.some((issue) => issue.includes("Full questionnaire")));
  assert.ok(review.warnings.some((issue) => issue.includes("could not be verified")));
  quoted.nodes[0].nextByChoice.cash = "missing";
  assert.ok(auditProtocol(quoted, [source]).runBlockers.some((issue) => issue.includes("incomplete choice route")));
});

test("absent optional source details do not create correction cards", () => {
  const p = structuredClone(protocol);
  p.sampleSize = null;
  p.sampleSizeEvidence = null;
  p.personaFields = [];
  p.analysisRules = [];
  p.unresolved = ["The gap between waves is missing", "Question wording for q2 is missing"];
  const review = auditProtocol(p, [source]);
  assert.deepEqual(review.runBlockers, []);
  assert.deepEqual(review.warnings, ["Source detail still needed: Question wording for q2 is missing"]);
});

test("quote matching tolerates PDF spacing artifacts", () => {
  const spaced = structuredClone(protocol);
  spaced.sampleSizeEvidence.quote = "Twenty respondents";
  const pdfText = { ...source, text: source.text.replace("Twenty respondents", "Twentyrespondents") };
  assert.ok(!auditProtocol(spaced, [pdfText]).warnings.some((issue) => issue.startsWith("Respondent count quote")));
});

test("PDF extraction preserves lines and joins printed line-end hyphenation", () => {
  assert.equal(pdfPageText([
    { str: "The health insur-", hasEOL: true },
    { str: "ance policy", hasEOL: true },
    { str: "costs 30%", hasEOL: false },
  ]), "The health insurance policy\ncosts 30%");
});

test("PDF citations can be ignored without losing quoted numbers or page location", () => {
  const pdf = { name: "paper.pdf", text: "[Page 1]\nThe cost-sharing¹ policy [12] covers 30% of treatment.\n[Page 2]\nA later question follows." };
  const quote = { source: pdf.name, quote: "The cost-sharing policy covers 30% of treatment" };
  assert.equal(sourceQuoteMatches(quote, [pdf]), true);
  assert.equal(sourceQuotePage(quote, [pdf]), 1);
  assert.equal(sourceQuoteMatches({ ...quote, quote: "The cost-sharing policy covers 40% of treatment" }, [pdf]), false);
  assert.equal(sourceQuoteMatches({ ...quote, quote: "treatment A later question" }, [pdf]), false);
});

test("findings distinguish source uncertainty from reconstruction and runner limits", () => {
  assert.equal(reviewFindingKind("Source detail still needed: Exact question wording is absent."), "Study detail to verify");
  assert.equal(reviewFindingKind("Source detail still needed: Options C, D, and E are not in executable nodes."), "Reconstruction to review");
  assert.equal(reviewFindingKind("Source detail still needed: Reported outcomes are not supported by the runner."), "Runner limitation");
  assert.equal(reviewFindingKind("Question q1 quote could not be verified in paper.pdf."), "Citation to verify");
  assert.equal(reviewFindingKind("Outcome r1 names an unknown valuation group."), "Reconstruction to review");
});

test("Brown pilot flags missing randomized wave placement without blocking synthetic personas", () => {
  const brown = structuredClone(protocol);
  brown.title = "Cognitive Constraints on Valuing Annuities";
  brown.conditions[0].id = "cv_sell";
  brown.conditions[0].label = "CV-Sell";
  brown.nodes.forEach((node) => { node.conditionId = "cv_sell"; });
  brown.arms[0].conditionOrder = ["cv_sell"];
  brown.personaFields.push({ key: "condition_index", values: [{ value: "1", weight: 1 }], evidence: evidence("Two arms") });
  const pdf = { ...source, text: `${source.text} Cognitive Constraints on Valuing Annuities` };
  const review = auditProtocol(brown, [pdf]);
  assert.ok(review.warnings.some((issue) => issue.includes("randomized CV-Sell")));
  assert.ok(review.warnings.some((issue) => issue.includes("condition_index")));
  assert.deepEqual(generatePersonas(brown, 1, "seed")[0].fields, { type: "careful" });
});

test("a targeted correction updates one protocol field and rejects unsafe paths", () => {
  const revised = applyProtocolChanges(protocol, [{ path: ["arms", 0, "weight"], value: 2 }]);
  assert.equal(revised.arms[0].weight, 2);
  assert.equal(protocol.arms[0].weight, 1);
  assert.throws(() => applyProtocolChanges(protocol, [{ path: ["__proto__", "polluted"], value: true }]));
  assert.throws(() => applyProtocolChanges(protocol, [{ path: ["arms", 99, "weight"], value: 2 }]));
});

test("persona assignment is reproducible and a resumed ladder finishes", () => {
  const [persona] = generatePersonas(protocol, 1, "seed");
  assert.deepEqual(generatePersonas(protocol, 1, "seed"), [persona]);
  assert.equal(nextTask(protocol, persona, [])?.node.id, "q1");
  const first = { runId: "test", personaId: persona.id, armId: "a", conditionId: "sell", nodeId: "q1", wave: 1, prompt: "Take 100 dollars?", options: protocol.nodes[0].options, choice: "annuity", rawResponse: '{"choice":"annuity"}', model: "test", at: "2026-01-01" };
  assert.equal(nextTask(protocol, persona, [first])?.node.id, "q2");
  const second = { ...first, nodeId: "q2", choice: "cash" };
  assert.equal(nextTask(protocol, persona, [first, second]), null);
  const report = results(protocol, [persona], [first, second]);
  assert.equal(report.completedPersonas, 1);
  assert.equal(report.summaries[0].median, 150);
  assert.equal(report.outcomes[0].value, 150);
});

test("persona table uses study-specific fields and CSV exports every row safely", () => {
  const p = structuredClone(protocol);
  p.personaFields = [
    { key: "age_band", values: [{ value: "65–74", weight: 1 }], evidence: evidence("respondents") },
    { key: "condition_index", values: [{ value: "1", weight: 1 }], evidence: evidence("Two arms") },
  ];
  const personas = generatePersonas(p, 2, "seed");
  personas[1].fields.age_band = '=HYPERLINK("example","click")';
  assert.deepEqual(personaColumns(p, personas).map((column) => column.label), ["Persona ID", "Assigned arm", "Condition sequence", "age_band"]);
  assert.equal(personaCell(p, personas[0], personaColumns(p, personas)[2]), "Sell (wave 1)");
  const csv = personasToCsv(p, personas);
  assert.ok(csv.startsWith('\uFEFF"Persona ID","Assigned arm","Condition sequence","age_band"\r\n'));
  assert.equal(csv.trim().split("\r\n").length, 3);
  assert.ok(csv.includes("'=HYPERLINK("));
  assert.ok(!csv.includes("condition_index"));
});

test("run progress counts completed condition paths across branches", () => {
  const p = structuredClone(protocol);
  p.conditions.push({ id: "followup", label: "Followup", wave: 1, entryNodeId: "q3", evidence: evidence("Question two") });
  p.arms[0].conditionOrder.push("followup");
  p.nodes.push({ id: "q3", conditionId: "followup", prompt: "A final choice", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], nextByChoice: { a: null, b: null }, evidence: evidence("Question two"), routeEvidence: evidence("Question two") });
  const [persona] = generatePersonas(p, 1, "seed");
  const row = (nodeId, conditionId, choice) => ({ runId: "test", personaId: persona.id, armId: "a", conditionId, nodeId, wave: 1, prompt: "", options: p.nodes.find((n) => n.id === nodeId).options, choice, rawResponse: "", model: "test", at: "2026-01-01" });
  assert.deepEqual(experimentProgress(p, [persona], []), { completed: 0, total: 2, percent: 0 });
  assert.deepEqual(experimentProgress(p, [persona], [row("q1", "sell", "cash")]), { completed: 0, total: 2, percent: 0 });
  assert.deepEqual(experimentProgress(p, [persona], [row("q1", "sell", "cash"), row("q2", "sell", "annuity")]), { completed: 1, total: 2, percent: 50 });
  assert.deepEqual(experimentProgress(p, [persona], [row("q1", "sell", "cash"), row("q2", "sell", "annuity"), row("q3", "followup", "b")]), { completed: 2, total: 2, percent: 100 });
});

test("a later wave stays scheduled until its source-defined gap has passed", () => {
  const p = structuredClone(protocol);
  p.waveGapDays = 14;
  p.conditions.push({ id: "buy", label: "Buy", wave: 2, entryNodeId: "q3", evidence: evidence("Question two") });
  p.arms[0].conditionOrder.push("buy");
  p.nodes.push({ id: "q3", conditionId: "buy", prompt: "A later choice", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], nextByChoice: { a: null, b: null }, evidence: evidence("Question two"), routeEvidence: evidence("Question two") });
  const [persona] = generatePersonas(p, 1, "seed");
  const completed = [
    { runId: "test", personaId: persona.id, armId: "a", conditionId: "sell", nodeId: "q1", wave: 1, prompt: "", options: p.nodes[0].options, choice: "annuity", rawResponse: "", model: "test", at: "2026-01-01T00:00:00Z" },
    { runId: "test", personaId: persona.id, armId: "a", conditionId: "sell", nodeId: "q2", wave: 1, prompt: "", options: p.nodes[1].options, choice: "cash", rawResponse: "", model: "test", at: "2026-01-01T00:00:00Z" },
  ];
  assert.equal(nextTask(p, persona, completed, Date.parse("2026-01-02T00:00:00Z"))?.availableAt, "2026-01-15T00:00:00.000Z");
  assert.equal(nextTask(p, persona, completed, Date.parse("2026-01-15T00:00:00Z"))?.node.id, "q3");
});

test("an unreported stage interval creates no check and does not block the run", () => {
  const p = structuredClone(protocol);
  p.conditions.push({ id: "lab", label: "Lab", wave: 2, entryNodeId: "q3", evidence: evidence("Question two") });
  p.arms[0].conditionOrder.push("lab");
  p.nodes.push({ id: "q3", conditionId: "lab", prompt: "A lab choice", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], nextByChoice: { a: null, b: null }, evidence: evidence("Question two"), routeEvidence: evidence("Question two") });
  const review = auditProtocol(p, [source]);
  assert.deepEqual(review.runBlockers, []);
  assert.deepEqual(review.warnings, []);
  assert.ok(!review.warnings.some((issue) => issue.includes("Wave timing has no source quote")));
  const [persona] = generatePersonas(p, 1, "seed");
  const completed = [
    { runId: "test", personaId: persona.id, armId: "a", conditionId: "sell", nodeId: "q1", wave: 1, prompt: "", options: p.nodes[0].options, choice: "annuity", rawResponse: "", model: "test", at: "2026-01-01T00:00:00Z" },
    { runId: "test", personaId: persona.id, armId: "a", conditionId: "sell", nodeId: "q2", wave: 1, prompt: "", options: p.nodes[1].options, choice: "cash", rawResponse: "", model: "test", at: "2026-01-01T00:00:00Z" },
  ];
  assert.equal(nextTask(p, persona, completed, Date.parse("2026-01-01T00:00:00Z"))?.node.id, "q3");
  assert.equal(nextTask(p, persona, completed, Date.parse("2026-01-01T00:00:00Z"))?.availableAt, undefined);
});

test("spread analysis uses the absolute log difference", () => {
  const p = structuredClone(protocol);
  p.conditions.push({ id: "buy", label: "Buy", wave: 1, entryNodeId: "b1", evidence: evidence("Question two") });
  p.arms[0].conditionOrder.push("buy");
  p.nodes.push(
    { id: "b1", conditionId: "buy", prompt: "50?", options: [{ id: "keep", text: "Keep" }, { id: "take", text: "Take" }], nextByChoice: { keep: "b2", take: "b2" }, amount: 50, valuationGroup: "buy", upperBoundOptionId: "take", evidence: evidence("Question one"), routeEvidence: evidence("Question one"), amountEvidence: evidence("Question one") },
    { id: "b2", conditionId: "buy", prompt: "100?", options: [{ id: "keep", text: "Keep" }, { id: "take", text: "Take" }], nextByChoice: { keep: null, take: null }, amount: 100, valuationGroup: "buy", upperBoundOptionId: "take", evidence: evidence("Question two"), routeEvidence: evidence("Question two"), amountEvidence: evidence("Question two") },
  );
  p.analysisRules.push({ id: "spread", label: "Absolute spread", kind: "mean_abs_log_spread", groups: ["buy", "sell"], evidence: evidence("Question one") });
  const [persona] = generatePersonas(p, 1, "seed");
  const row = (nodeId, conditionId, choice) => ({ runId: "test", personaId: persona.id, armId: "a", conditionId, nodeId, wave: 1, prompt: "", options: p.nodes.find((n) => n.id === nodeId).options, choice, rawResponse: "", model: "test", at: "2026-01-01" });
  const report = results(p, [persona], [row("q1", "sell", "annuity"), row("q2", "sell", "cash"), row("b1", "buy", "keep"), row("b2", "buy", "take")]);
  assert.ok(Math.abs(report.outcomes.find((x) => x.id === "spread").value - Math.log(2)) < 1e-10);
});

test("completed insurance choices score legacy condition means without numeric valuation bounds", () => {
  const p = structuredClone(protocol);
  p.nodes[0].id = "insurance";
  p.nodes[0].conditionId = "full";
  p.nodes[0].options = [{ id: "a", text: "Policy A: 0% co-insurance" }, { id: "b", text: "Policy B: 20% co-insurance" }];
  p.nodes[0].nextByChoice = { a: null, b: null };
  p.nodes = [p.nodes[0]];
  p.conditions = ["full", "baseline", "share"].map((id) => ({ id, label: id, wave: 1, entryNodeId: "insurance", evidence: evidence("Question one") }));
  p.arms = p.conditions.map((condition) => ({ id: condition.id, label: condition.label, weight: 1, conditionOrder: [condition.id], evidence: evidence("Two arms") }));
  p.analysisRules = p.conditions.map((condition) => ({ id: condition.id, label: condition.label, kind: "mean_valuation", group: condition.id, nodeId: "insurance", evidence: evidence("Question one") }));
  const personas = p.arms.map((arm, index) => ({ id: `P${index}`, armId: arm.id, fields: {} }));
  const trials = personas.map((persona, index) => ({ runId: "test", personaId: persona.id, armId: persona.armId, conditionId: persona.armId, nodeId: "insurance", wave: 1, prompt: "", options: p.nodes[0].options, choice: index === 1 ? "b" : "a", rawResponse: "", model: "test", at: "2026-01-01" }));
  const report = results(p, personas, trials);
  assert.deepEqual(report.outcomes.map((outcome) => [outcome.value, outcome.count]), [[0, 1], [20, 1], [0, 1]]);
  assert.deepEqual(report.outcomes[0].choiceBreakdown, [{ label: "Policy A: 0% co-insurance", count: 1 }, { label: "Policy B: 20% co-insurance", count: 0 }]);
  assert.ok(report.outcomes[1].note.includes("another condition"));
  assert.ok(!auditProtocol(p, [source]).warnings.some((warning) => warning.includes("cannot score every option")));
  assert.ok(auditProtocol(p, [source]).warnings.some((warning) => warning.includes("reuses a question")));
  assert.ok(auditProtocol(p, [source]).warnings.some((warning) => warning.includes("reuses an entry question")));
  p.nodes[0].options[1].text = "Policy B: rate not supplied";
  assert.ok(auditProtocol(p, [source]).warnings.some((warning) => warning.includes("cannot score every option")));
});
