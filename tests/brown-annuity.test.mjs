import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfPageText } from "../lib/pdf-text.ts";
import { buildBrownProtocol } from "../lib/brown-annuity.ts";
import { auditProtocol, generatePersonas, nextTask } from "../lib/experiment.ts";

const paperPath = process.env.BROWN_PAPER_PDF;
const appendixPath = process.env.BROWN_APPENDIX_PDF;

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

test("the supplied paper and appendix produce executable paths for both waves and all amount starts", { skip: !paperPath || !appendixPath }, async () => {
  const sources = [await source(paperPath, "paper.pdf"), await source(appendixPath, "appendix.pdf")];
  const protocol = buildBrownProtocol(sources);
  assert.deepEqual(auditProtocol(protocol, sources).runBlockers, []);
  assert.equal(protocol.arms.length, 12);
  assert.equal(protocol.conditions.length, 15);
  const immediate = { ...protocol, waveGapDays: null };
  for (const arm of protocol.arms) for (const start of ["low", "medium", "high"]) for (const mask of [0, 1, 3, 5, 9, 15]) {
    const persona = generatePersonas(protocol, 1, `${arm.id}-${start}-${mask}`)[0];
    persona.armId = arm.id;
    persona.fields.ls_startvalue = start;
    persona.fields.benefit_monthly = "1000";
    persona.fields.age = "65";
    persona.fields.claim_age = "66";
    const trials = [];
    while (true) {
      const task = nextTask(immediate, persona, trials);
      if (!task) break;
      assert.ok(trials.length < 33, "a choice route must terminate");
      assert.ok(Number.isFinite(task.node.amount));
      const choice = (mask >> (trials.length % 4)) & 1 ? "1" : "2";
      assert.ok(task.node.options.some((option) => option.id === choice));
      trials.push({ personaId: persona.id, conditionId: task.condition.id, nodeId: task.node.id, choice, wave: task.condition.wave, at: new Date().toISOString() });
    }
    assert.equal(trials.length, 33);
    assert.ok(trials.some((trial) => trial.wave === 1));
    assert.ok(trials.some((trial) => trial.wave === 2));
  }
  const corrupted = structuredClone(sources);
  corrupted[1].text = corrupted[1].text.replace("500,000", "501,000");
  assert.throws(() => buildBrownProtocol(corrupted), /matrices/);
});
