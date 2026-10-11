import type { TokenUsage } from "./tokenhub";

export type RunUsage = {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  unpricedCalls: number;
  unreportedCalls: number;
};

export function addRunUsage(current: RunUsage | undefined, usage: TokenUsage | null | undefined): RunUsage {
  const initial = current || { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0, unpricedCalls: 0, unreportedCalls: 0 };
  return {
    calls: initial.calls + 1,
    promptTokens: initial.promptTokens + (usage?.promptTokens || 0),
    completionTokens: initial.completionTokens + (usage?.completionTokens || 0),
    totalTokens: initial.totalTokens + (usage?.totalTokens || 0),
    estimatedCostUsd: initial.estimatedCostUsd + (usage?.estimatedCostUsd || 0),
    unpricedCalls: initial.unpricedCalls + (usage && usage.estimatedCostUsd == null ? 1 : 0),
    unreportedCalls: initial.unreportedCalls + (usage ? 0 : 1),
  };
}
