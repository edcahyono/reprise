import test from "node:test";
import assert from "node:assert/strict";
import { completionText, modelChoices, premiumAccessError, responseTokenLimit, tokenUsage } from "../lib/tokenhub.ts";

test("GLM Flash decisions get enough output room and text parts are read", () => {
  assert.equal(responseTokenLimit("glm45", 120), 1024);
  assert.equal(responseTokenLimit("glm4v", 120), 1024);
  assert.equal(responseTokenLimit("qwen", 120), 120);
  assert.equal(completionText([{ type: "text", text: '{"choice":' }, { type: "text", text: '"yes"}' }]), '{"choice":"yes"}');
  assert.equal(completionText(null), "");
});
import { addRunUsage } from "../lib/run-usage.ts";

test("premium choices need the configured server code", () => {
  const previous = process.env.PREMIUM_ACCESS_CODE;
  process.env.PREMIUM_ACCESS_CODE = "sample-secret-123";
  try {
    assert.equal(modelChoices.filter((choice) => choice.premium).map((choice) => choice.id).join(","), "qwen,deepseek");
    assert.equal(premiumAccessError("glm45", ""), null);
    assert.match(premiumAccessError("deepseek", "wrong"), /incorrect/);
    assert.equal(premiumAccessError("deepseek", "sample-secret-123"), null);
    assert.equal(premiumAccessError("qwen", "sample-secret-123"), null);
    assert.match(premiumAccessError("qwen", "wrong"), /incorrect/);
  } finally {
    if (previous === undefined) delete process.env.PREMIUM_ACCESS_CODE;
    else process.env.PREMIUM_ACCESS_CODE = previous;
  }
});

test("a run totals reported tokens and only prices configured rates", () => {
  const inName = "PARATERA_GLM_45_FLASH_INPUT_USD_PER_MILLION";
  const outName = "PARATERA_GLM_45_FLASH_OUTPUT_USD_PER_MILLION";
  const previous = [process.env[inName], process.env[outName]];
  process.env[inName] = "0.2";
  process.env[outName] = "0.8";
  try {
    const usage = tokenUsage({ prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 }, "glm45");
    assert.equal(usage?.estimatedCostUsd, 0.0006);
    const run = addRunUsage(addRunUsage(undefined, usage), null);
    assert.equal(run.calls, 2);
    assert.equal(run.totalTokens, 1500);
    assert.equal(run.unreportedCalls, 1);
  } finally {
    for (const [name, value] of [[inName, previous[0]], [outName, previous[1]]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
