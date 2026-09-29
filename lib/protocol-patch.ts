import { parseProtocol, type ExperimentProtocol } from "./experiment.ts";

const allowedRoots = new Set(["title", "sampleSize", "sampleSizeEvidence", "waveGapDays", "waveGapEvidence", "personaFields", "arms", "conditions", "nodes", "analysisRules", "benchmarks", "unresolved", "sourceNotes"]);
const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);

export function applyProtocolChanges(protocol: ExperimentProtocol, input: unknown): ExperimentProtocol {
  if (!Array.isArray(input) || !input.length || input.length > 80) throw new Error("The revision has no usable field changes.");
  const revised = structuredClone(protocol) as Record<string, unknown>;
  for (const change of input) {
    if (!change || typeof change !== "object" || !("path" in change) || !("value" in change)) throw new Error("A revision field is malformed.");
    const { path, value } = change as { path: unknown; value: unknown };
    if (!Array.isArray(path) || !path.length || path.length > 8 || typeof path[0] !== "string" || !allowedRoots.has(path[0]) || path.some((part) => typeof part !== "string" && (!Number.isInteger(part) || part < 0)) || path.some((part) => typeof part === "string" && forbiddenKeys.has(part))) throw new Error("A revision field path is invalid.");
    let target: Record<string, unknown> | unknown[] = revised;
    for (const part of path.slice(0, -1)) {
      const next = (target as Record<string | number, unknown>)[part as string | number];
      if (!next || typeof next !== "object") throw new Error("A revision field path does not exist.");
      target = next as Record<string, unknown> | unknown[];
    }
    const last = path[path.length - 1] as string | number;
    if (Array.isArray(target)) {
      if (!Number.isInteger(last) || typeof last !== "number" || last < 0 || last > target.length) throw new Error("A revision array position is invalid.");
      if (last === target.length) target.push(value);
      else target[last] = value;
    } else {
      if (typeof last !== "string") throw new Error("A revision field name is invalid.");
      target[last] = value;
    }
  }
  return parseProtocol(revised);
}
