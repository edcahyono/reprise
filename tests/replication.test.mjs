import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfPageText } from "../lib/pdf-text.ts";
import { buildBrownProtocol, withBrownPublishedResults } from "../lib/brown-annuity.ts";
import { sourceExhibits } from "../lib/source-exhibits.ts";

test("source exhibit inventory accepts a caption on the following PDF line", () => {
  const found = sourceExhibits([{ name: "paper.pdf", text: "[Page 3]\nFigure 1\nVisual salience\nFigure 2 displays the effect.\n[Page 4]\nTable 2\nExperimental studies summary" }], "paper.pdf");
  assert.deepEqual(found.map(({ kind, number, title }) => [kind, number, title]), [
    ["Figure", "1", "Figure 1. Visual salience"],
    ["Figure", "2", "Figure 2. Caption not found in readable PDF text"],
    ["Table", "2", "Table 2. Experimental studies summary"],
  ]);
});
import { auditProtocol, generatePersonas, nextTask, randomSeed, results, sourceQuoteMatches } from "../lib/experiment.ts";
import { constrainToLogic, harmonizeAges, logicalBounds } from "../lib/persona-sampling.ts";
import { buildPdf } from "../lib/pdf-report.ts";
import { aiReportBlocks, aiResultTables, comparisonReportBlocks, comparisonRows, agreementSummary, executiveSummary, formatValue } from "../lib/results-presentation.ts";

const paperPath = process.env.BROWN_PAPER_PDF;
const appendixPath = process.env.BROWN_APPENDIX_PDF;
const needPdfs = !paperPath || !appendixPath;

async function source(path, name) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await readFile(path)) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    pages.push(`[Page ${pageNumber}]\n${pdfPageText((await page.getTextContent()).items)}`);
  }
  await pdf.destroy();
  return { name, text: pages.join("\n\n") };
}

test("a plausible range is derived from an attribute's name, whatever the paper is", () => {
  assert.equal(logicalBounds("age").kind, "current_age");
  assert.equal(logicalBounds("age").min, 21);
  assert.equal(logicalBounds("respondent_age").min, 21);
  assert.equal(logicalBounds("claim_age").kind, "later_age");
  assert.equal(logicalBounds("retirement_age").kind, "later_age");
  assert.equal(logicalBounds("illness_probability").max, 1);
  assert.equal(logicalBounds("coinsurance_rate").max, 100);
  assert.equal(logicalBounds("monthly_benefit").min, 0);
  assert.equal(logicalBounds("favourite_colour").kind, "unknown");
  // A paper's own reported range is narrowed to what the attribute can be.
  assert.deepEqual(constrainToLogic("age", { min: 5, max: 200, integer: true }), { min: 21, max: 90, integer: true });
  assert.deepEqual(constrainToLogic("income", { min: -500, max: 90000 }), { min: 0, max: 90000, integer: false });
  // A range wholly outside the logical one means the name was read wrongly.
  assert.deepEqual(constrainToLogic("age", { min: 300, max: 400, integer: true }), { min: 300, max: 400, integer: true });
});

test("a respondent's ages stay consistent with each other", () => {
  assert.equal(harmonizeAges({ age: "72", claim_age: "64" }).claim_age, "72");
  assert.equal(harmonizeAges({ age: "60", claim_age: "67" }).claim_age, "67");
  assert.equal(harmonizeAges({ age: "40", onset_age: "55" }).onset_age, "40");
  assert.deepEqual(harmonizeAges({ height: "180" }), { height: "180" });
});

test("personas are randomly drawn and every draw stays inside its logical range", () => {
  const evidence = { source: "study.txt", quote: "respondents" };
  const protocol = {
    title: "Fixture", sampleSize: 100, sampleSizeEvidence: null, waveGapDays: null, waveGapEvidence: null,
    personaFields: [{ key: "education", values: [{ value: "degree", weight: 1 }, { value: "no degree", weight: 1 }], evidence }],
    simulatedFields: [{ key: "age", mean: 55, sd: 40, min: 0, max: 200, integer: true, evidence, assumption: "Truncated normal" }],
    requiredNumericFields: [{ key: "monthly_benefit", min: 400, max: 3200, integer: true }, { key: "claim_age", min: 62, max: 70, integer: true }],
    arms: [{ id: "a", label: "A", weight: 1, conditionOrder: ["c"], evidence }],
    conditions: [{ id: "c", label: "C", wave: 1, entryNodeId: "q", evidence }],
    nodes: [{ id: "q", conditionId: "c", prompt: "?", options: [{ id: "x", text: "X" }, { id: "y", text: "Y" }], nextByChoice: { x: null, y: null }, evidence, routeEvidence: evidence }],
    analysisRules: [], benchmarks: [], unresolved: [], sourceNotes: "",
  };
  const personas = generatePersonas(protocol, 200, randomSeed());
  for (const persona of personas) {
    const age = Number(persona.fields.age);
    assert.ok(age >= 21 && age <= 90, `age ${age} must be a plausible adult age`);
    assert.ok(Number.isInteger(age));
    const benefit = Number(persona.fields.monthly_benefit);
    assert.ok(benefit >= 400 && benefit <= 3200, `benefit ${benefit} must sit in the declared range`);
    assert.ok(Number(persona.fields.claim_age) >= age || Number(persona.fields.claim_age) >= 62);
    assert.ok(["degree", "no degree"].includes(persona.fields.education));
  }
  assert.ok(new Set(personas.map((persona) => persona.fields.age)).size > 5, "ages must vary across the sample");
  // Two generations are independent draws, not the same sample twice.
  const again = generatePersonas(protocol, 200, randomSeed());
  assert.notDeepEqual(personas.map((persona) => persona.fields.age), again.map((persona) => persona.fields.age));
  // A named seed still reproduces a sample exactly, for an auditable run.
  assert.deepEqual(generatePersonas(protocol, 20, "fixed"), generatePersonas(protocol, 20, "fixed"));
  assert.notEqual(randomSeed(), randomSeed());
});

test("a report renders as a readable PDF with a valid cross-reference table", () => {
  const blocks = [
    { kind: "heading", text: "Executive summary" },
    { kind: "paragraph", text: "A paragraph with an em dash — a quote “like this” and a long unbroken token ".repeat(12) },
    { kind: "bullets", items: ["First limitation", "Second limitation"] },
    { kind: "table", title: "Table 1. Valuations", columns: ["Measure", "AI result", "Published", "Diff", "Obs."], rows: Array.from({ length: 60 }, (_, index) => [`Median valuation for a long measure name ${index}`, "$32,500", "$27,000", "+$5,500", "20"]) },
  ];
  const blob = buildPdf(blocks, { title: "AI replication results", subtitle: "Fixture study" });
  assert.equal(blob.type, "application/pdf");
  return blob.text().then((pdf) => {
    assert.ok(pdf.startsWith("%PDF-1.4"));
    assert.ok(pdf.trimEnd().endsWith("%%EOF"));
    const objectCount = Number(pdf.match(/\/Size (\d+)/)[1]) - 1;
    assert.equal(pdf.match(/ obj\n/g).length, objectCount);
    assert.equal(pdf.match(/00000 n /g).length, objectCount);
    // The /Pages node must point at page objects that point back at it.
    const pagesId = Number(pdf.match(/\/Type \/Catalog \/Pages (\d+) 0 R/)[1]);
    const kids = pdf.match(new RegExp(`${pagesId} 0 obj\\n<< /Type /Pages /Kids \\[([^\\]]+)\\]`))[1].trim().split(" 0 R").filter(Boolean);
    assert.ok(kids.length > 1, "a 60-row table must break across pages");
    for (const kid of kids) assert.ok(pdf.includes(`${kid.trim()} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R`));
    // Every stream length must match the bytes actually written.
    for (const [, length, body] of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) assert.equal(body.length, Number(length));
    assert.ok(pdf.includes("Executive summary"));
    assert.ok(!/[^\x00-\x7f]/.test(pdf), "the standard fonts only carry ASCII");
  });
});

test("a measure comparison labels agreement and summarises it without a model", () => {
  const outcomes = [
    { id: "a", label: "Median CV-Sell", value: 27500, count: 20, unit: "$", note: null, choiceBreakdown: [], comparisonNote: null, benchmark: { id: "b1", label: "Published", value: 27000, unit: "$", evidence: { source: "p", quote: "q" } } },
    { id: "b", label: "Median CV-Buy", value: 9000, count: 20, unit: "$", note: null, choiceBreakdown: [], comparisonNote: null, benchmark: { id: "b2", label: "Published", value: 3000, unit: "$", evidence: { source: "p", quote: "q" } } },
    { id: "c", label: "Mean spread", value: 1.1, count: 18, unit: "", note: null, choiceBreakdown: [], comparisonNote: null, benchmark: null },
    { id: "benchmark:d", label: "Regression coefficient", value: null, count: 0, unit: "", note: null, choiceBreakdown: [], comparisonNote: "No executable calculation", benchmark: { id: "b4", label: "Published", value: -0.64, unit: "", evidence: { source: "p", quote: "q" } } },
  ];
  const rows = comparisonRows(outcomes);
  assert.equal(rows[0].agreement, "close");
  assert.equal(rows[0].difference, "+$500");
  assert.equal(rows[1].agreement, "divergent");
  assert.equal(rows[2].published, "Not extracted");
  assert.equal(rows[2].agreement, "unavailable");
  assert.equal(rows[3].ai, "—");
  const summary = agreementSummary(rows);
  assert.deepEqual([summary.compared, summary.close, summary.divergent, summary.missingBenchmark, summary.noAiValue], [2, 1, 1, 1, 1]);
  const protocol = { title: "Fixture", analysisRules: [], conditions: [], benchmarks: [], unresolved: [] };
  const text = executiveSummary(protocol, rows, 20, 120);
  assert.match(text, /20 synthetic respondents produced 120 recorded choices/);
  assert.match(text, /2 measures could be compared/);
  assert.match(text, /not observations from the original participants/);
  assert.equal(formatValue(null, "$"), "—");
  assert.equal(formatValue(32500, "$"), "$32,500");
  assert.equal(formatValue(12.5, "%"), "12.5%");
});

test("comparison does not score numbers with incompatible units", () => {
  const rows = comparisonRows([{ id: "rate", label: "Take-up", value: 0.25, count: 10, unit: "proportion", note: null, choiceBreakdown: [], comparisonNote: null, benchmark: { id: "human", label: "Published take-up", value: 25, unit: "%", evidence: { source: "paper.pdf", quote: "25%" } } }]);
  assert.equal(rows[0].published, "25%");
  assert.equal(rows[0].difference, "—");
  assert.equal(rows[0].agreement, "unavailable");
  assert.match(rows[0].note, /Unit mismatch/);
});

test("AI results fall back to a stage grouping and follow the paper's layout when one was extracted", () => {
  const outcomes = [
    { id: "r1", label: "Median CV-Sell", value: 27500, count: 20, unit: "$", note: null, choiceBreakdown: [], comparisonNote: null, benchmark: null },
    { id: "r2", label: "Median CV-Buy", value: 9000, count: 20, unit: "$", note: null, choiceBreakdown: [], comparisonNote: null, benchmark: null },
  ];
  const base = {
    title: "Fixture", unresolved: [], benchmarks: [],
    analysisRules: [{ id: "r1", label: "Median CV-Sell", kind: "median_valuation", stage: "valuation" }, { id: "r2", label: "Median CV-Buy", kind: "median_valuation", stage: "valuation" }],
    conditions: [],
  };
  const grouped = aiResultTables(base, outcomes);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].title, "valuation");
  assert.deepEqual(grouped[0].rows[0].values, ["$27,500", "20"]);
  // The paper's own layout fixes the columns, so each cell holds one value and
  // the observation count is not spliced in between them.
  const laidOut = aiResultTables({
    ...base,
    resultTables: [{ id: "t1", title: "Table 2. Elicited valuations", columnHeaders: ["Measure", "Sell", "Buy"], rows: [{ header: "Median", cells: [{ ruleId: "r1" }, { ruleId: "r2" }] }] }],
  }, outcomes);
  assert.equal(laidOut[0].title, "Table 2. Elicited valuations");
  assert.deepEqual(laidOut[0].columns, ["Measure", "Sell", "Buy"]);
  assert.deepEqual(laidOut[0].rows[0].values, ["$27,500", "$9,000"]);
  // A layout that named too few columns still gets a header for every value.
  const short = aiResultTables({
    ...base,
    resultTables: [{ id: "t2", title: "Short", columnHeaders: ["Measure", "Only"], rows: [{ header: "Median", cells: [{ ruleId: "r1" }, { ruleId: "r2" }] }] }],
  }, outcomes);
  assert.equal(short[0].columns.length, short[0].rows[0].values.length + 1);
  const publishedOnly = aiResultTables({
    ...base,
    resultTables: [{ id: "appendix", title: "Table A.3", columnHeaders: ["Measure", "Published"], rows: [{ header: "Correlation", cells: [{ text: "0.72***" }] }] }],
  }, outcomes);
  assert.equal(publishedOnly.some((table) => table.title === "Table A.3"), false, "a printed human value cannot appear as an AI result");
  // A paper that writes its units out in prose still renders as a table would.
  assert.equal(formatValue(38.2, "percent"), "38.2%");
  assert.equal(formatValue(18.5, "percentage points"), "18.5%");
  assert.equal(formatValue(78500, "dollars"), "$78,500");
  assert.equal(formatValue(52.4, "years"), "52.4 years");
  assert.ok(aiReportBlocks(base, grouped, 20, 120, ["A departure"]).some((block) => block.kind === "table"));
  assert.ok(comparisonReportBlocks(base, comparisonRows(outcomes), "Summary", ["Detail"], []).some((block) => block.kind === "table"));
});

test("the uploaded paper and appendix run end to end with no manual persona setup", { skip: needPdfs && "set BROWN_PAPER_PDF and BROWN_APPENDIX_PDF" }, async () => {
  const sources = [await source(paperPath, "paper.pdf"), await source(appendixPath, "appendix.pdf")];
  const protocol = buildBrownProtocol(sources);
  const benchmarkByRule = new Map(protocol.benchmarks.map((benchmark) => [benchmark.ruleId, benchmark.value]));
  for (const [ruleId, value] of [
    ["median_cv_sell_100", 13750], ["median_cv_buy_100", 3000],
    ["median_ev_sell_100", 12500], ["median_ev_buy_100", 3000],
    ["brown_cv_sell_buy_mean_log_spread", 2.58],
    ["brown_a3_cv_sell_ev_sell", 0.32], ["brown_a3_cv_sell_cv_buy", -0.10],
    ["brown_a3_ev_sell_cv_buy", -0.16], ["brown_a3_cv_sell_ev_buy", -0.10],
    ["brown_a3_ev_sell_ev_buy", -0.14], ["brown_a3_cv_buy_ev_buy", 0.72],
  ]) assert.equal(benchmarkByRule.get(ruleId), value, ruleId);
  for (const benchmark of protocol.benchmarks) assert.ok(sourceQuoteMatches(benchmark.evidence, sources), `${benchmark.id} must have a verified source quote`);
  assert.equal(withBrownPublishedResults(protocol, sources).benchmarks.length, protocol.benchmarks.length, "refreshing a saved run must not duplicate published values");
  const inventory = sourceExhibits(sources, "paper.pdf");
  for (const title of ["Table 1.", "Table 2.", "Table 6.", "Figure 1.", "Figure 2.", "Figure 3.", "Table A.7.", "Table A.8.", "Figure A.5."]) {
    assert.ok(inventory.some((exhibit) => exhibit.title.startsWith(title)), `${title} must appear in the source inventory`);
  }
  const audit = auditProtocol(protocol, sources);
  // The complaint this fixes: a complete upload must not report a run blocker.
  assert.deepEqual(audit.runBlockers, [], "a paper with its appendix must be runnable");
  assert.deepEqual(audit.personaBlockers, []);

  // Nothing is typed in: every respondent attribute is drawn for this sample.
  const personas = generatePersonas(protocol, 40, randomSeed());
  for (const persona of personas) {
    const benefit = Number(persona.fields.benefit_monthly);
    const age = Number(persona.fields.age);
    const claimAge = Number(persona.fields.claim_age);
    assert.ok(benefit >= 400 && benefit <= 3200, `benefit ${benefit} out of range`);
    assert.ok(age >= 50 && age <= 75, `age ${age} out of range`);
    assert.ok(age >= 21, "no respondent may be a minor");
    assert.ok(claimAge >= age || claimAge >= 62, `claim age ${claimAge} precedes age ${age}`);
    assert.ok(["current", "expected"].includes(persona.fields.ss_status));
    assert.ok(["yes", "no"].includes(persona.fields.married));
  }
  assert.ok(new Set(personas.map((persona) => persona.fields.benefit_monthly)).size > 10, "benefits must vary across the sample");
  assert.ok(new Set(personas.map((persona) => persona.armId)).size > 1, "arms must vary across the sample");

  const immediate = { ...protocol, waveGapDays: null };
  const trials = [];
  for (const [index, persona] of personas.slice(0, 12).entries()) {
    // A respondent with a consistent reservation value: they accept the lump
    // sum once it exceeds what the benefit is worth to them. That brackets the
    // value from both sides, which is what the ladder is designed to elicit.
    const reservation = 15000 + index * 6000;
    let guard = 0;
    while (true) {
      const task = nextTask(immediate, persona, trials);
      if (!task) break;
      assert.ok(++guard < 60, `${persona.id} must terminate`);
      assert.ok(Number.isFinite(task.node.amount), "every offer must carry an amount");
      assert.equal(task.node.options.length, 2);
      const choice = task.node.amount >= reservation ? task.node.upperBoundOptionId : "1";
      trials.push({ runId: "t", personaId: persona.id, armId: persona.armId, conditionId: task.condition.id, nodeId: task.node.id, wave: task.condition.wave, prompt: task.node.prompt, options: task.node.options, scenario: { lump_sum: task.node.amount, valuation_group: task.node.valuationGroup }, choice, rawResponse: "", model: "t", at: new Date().toISOString() });
    }
    assert.ok(guard > 0, `${persona.id} must have at least one question`);
  }
  const report = results(protocol, personas.slice(0, 12), trials);
  assert.equal(report.completedPersonas, 12);
  assert.ok(report.outcomes.length > 0);
  assert.ok(report.outcomes.some((outcome) => outcome.value != null), "a completed run must produce a scored measure");
  assert.equal(report.outcomes.find((outcome) => outcome.id === "brown_a3_cv_sell_ev_sell")?.benchmark?.value, 0.32);
  assert.ok(report.outcomes.some((outcome) => outcome.id === "brown_cv_sell_buy_mean_log_spread" && outcome.value != null), "the paired AI spread must be calculated");

  // Both result views render from the same run.
  const tables = aiResultTables(protocol, report.outcomes);
  assert.ok(tables.length > 0 && tables.every((table) => table.rows.length > 0));
  const rows = comparisonRows(report.outcomes);
  assert.equal(rows.length, report.outcomes.length);
  const aiPdf = await buildPdf(aiReportBlocks(protocol, tables, 12, trials.length, audit.fidelityWarnings), { title: "AI replication results", subtitle: protocol.title }).text();
  const comparePdf = await buildPdf(comparisonReportBlocks(protocol, rows, executiveSummary(protocol, rows, 12, trials.length), [], audit.fidelityWarnings), { title: "Comparison", subtitle: protocol.title }).text();
  for (const pdf of [aiPdf, comparePdf]) {
    assert.ok(pdf.startsWith("%PDF-1.4") && pdf.trimEnd().endsWith("%%EOF"));
    assert.equal(pdf.match(/ obj\n/g).length, Number(pdf.match(/\/Size (\d+)/)[1]) - 1);
  }
  assert.notEqual(aiPdf, comparePdf, "the two reports are separate documents");
});
