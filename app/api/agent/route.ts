import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";

export const runtime = "edge";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "cache-control": "no-store" } });
const prompts: Record<string, string> = {
  coordinate: "Coordinate the replication. Name the exact study and experiment, original versus proposed setting, target claim, research roles, handoff gates, decision log, unresolved questions, and who must decide them. Do not claim an empirical replication has happened.",
  "source-map": "Build a source ledger. Identify the study version, article, appendix, registration, instrument, data, code, errata, and corrections. For each fact give a precise location if available, or mark it unverified. Extract insurance contract, risk, assignment, recruitment, incentives, outcomes, and sample details. End with blockers.",
  protocol: "Draft a runnable protocol and analysis plan from verified sources. Specify assignment and observation units, arms, probabilities, participant path, contract parameter table, payout rule, incentives, outcomes, exclusions, estimand, uncertainty, and deviations. Distinguish original facts from proposed assumptions. Flag decisions required before implementation.",
  fidelity: "Review whether the proposed design preserves the original causal contrast and insurance mechanism. Give a side-by-side matrix for population, recruitment, assignment, wording, order, timing, premiums, deductibles, limits, exclusions, loss probability, stakes, outcome, and follow-up. Label each difference held constant, changed, extension, or unresolved. Recommend a replication classification and explain limits.",
  build: "Specify the participant-facing instrument and implementation logic grounded in the protocol. Include a condition matrix, screen order, randomization persistence, one payoff function, validation cases, data dictionary, accessible export, and deviation log. Do not state that code or an instrument was built unless actually supplied.",
  reproduce: "Audit reproducibility only to the extent data and code are actually supplied. Map data provenance, sample filters, variables, estimand, standard errors, and target tables. Provide a reported-versus-reproduced table with blank/unverified entries where execution is impossible, plus steps needed to run the analysis. Never fabricate estimates or simulated findings.",
  "field-data": "Prepare a field data preflight and audit plan. Check assignment persistence, arm delivery, display versus approved terms, exports, recruitment, eligibility, exposure, completion, attrition, contamination, and deviations. If no field data are supplied, explicitly mark observed checks unavailable. Do not propose autonomous participant contact or coverage changes.",
  "independent-review": "Perform a separate critical review of the preceding artifacts. Reconstruct the primary estimand from the cited source and protocol, challenge assumptions, counts, coding, payoffs, uncertainty, and claims. Provide an independent check table, unresolved discrepancies, and strongest supported conclusion. If locked data are absent, mark empirical results unverified.",
};
const models: Record<string, string[]> = { qwen: ["qwen3.7-plus", "qwen3.7-flash"], deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"] };
const qwenEndpoints: Record<string, string> = {
  singapore: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
  beijing: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  virginia: "https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions",
};
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const stage = String(body.stage || "");
  const provider = String(body.provider || "");
  const model = String(body.model || "");
  const apiKey = (provider === "qwen" ? env.QWEN_API_KEY || process.env.QWEN_API_KEY : env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY)?.trim() || "";
  const thinking = body.thinking === true;
  if (!prompts[stage] || !models[provider]?.includes(model)) return json({ error: "Choose a supported role and model." }, 400);
  if (!apiKey) return json({ error: `${provider === "qwen" ? "QWEN_API_KEY" : "DEEPSEEK_API_KEY"} is not configured on the server.` }, 503);
  const source = body.source as Record<string, unknown> | undefined;
  if (!source || typeof source.citation !== "string") return json({ error: "Add a paper first." }, 400);
  const sourceText = typeof source.text === "string" ? source.text.slice(0, 90000) : "";
  const abstract = typeof source.abstract === "string" ? source.abstract.slice(0, 18000) : "";
  const previous = Array.isArray(body.previous) ? body.previous.slice(0, 8).map((item: Record<string, unknown>) => `${String(item.stage || "")}: ${String(item.content || "").slice(0, 3500)}`).join("\n\n") : "";
  const context = `CITATION: ${String(source.citation).slice(0, 500)}\nTITLE: ${String(source.title || "").slice(0, 500)}\nDOI: ${String(source.doi || "").slice(0, 200)}\nABSTRACT: ${abstract || "Not supplied"}\nFULL TEXT EXCERPT: ${sourceText || "Not supplied"}\n\nPRIOR ROLE OUTPUTS (drafts, not evidence):\n${previous || "None"}`;
  const messages = [
    { role: "system", content: "You are a specialist research assistant for behavioral insurance experiment replication. Use only supplied source material as evidence. You cannot browse, inspect external files, execute code, contact participants, or verify data in this call. Cite source sections/pages only if visible in the provided text. Mark every missing fact and empirical result as unverified. Separate original-study facts, proposed adaptations, and next actions. Write a concise, structured handoff in plain English. Do not reveal private reasoning." },
    { role: "user", content: `${prompts[stage]}\n\n${context}` },
  ];
  const endpoint = provider === "deepseek" ? "https://api.deepseek.com/chat/completions" : qwenEndpoints[String(body.qwenRegion || "singapore")];
  if (!endpoint) return json({ error: "Choose a supported Qwen region." }, 400);
  const payload: Record<string, unknown> = { model, messages, max_tokens: 2800, stream: false };
  if (provider === "deepseek") payload.thinking = { type: thinking ? "enabled" : "disabled" };
  else payload.enable_thinking = thinking;
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120000) });
    const data = await response.json() as { error?: { message?: string }; choices?: { message?: { content?: string } }[] };
    if (!response.ok) return json({ error: data.error?.message || `Provider returned ${response.status}. Check your key, model, and region.` }, response.status >= 500 ? 502 : 400);
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return json({ error: "The provider returned no final answer. Try again or switch modes." }, 502);
    return json({ content, model });
  } catch (error) {
    return json({ error: error instanceof Error && error.name === "TimeoutError" ? "The model call timed out. Try again." : "Could not reach the provider. Check the key and region, then try again." }, 502);
  }
}
