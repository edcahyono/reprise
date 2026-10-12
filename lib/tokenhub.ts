export const modelChoices = [
  { id: "glm45", label: "GLM 4.5 Flash", premium: false, thinking: false },
  { id: "glm4v", label: "GLM 4V Flash", premium: false, thinking: false },
  { id: "qwen", label: "Qwen 3.8 Max", premium: true, thinking: true },
  { id: "deepseek", label: "DeepSeek V4 Pro", premium: true, thinking: true },
] as const;
export type ModelFamily = (typeof modelChoices)[number]["id"];
export type ModelMode = "thinking" | "nonThinking";
export type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number | null };

export function isModelFamily(value: unknown): value is ModelFamily {
  return modelChoices.some((choice) => choice.id === value);
}
export function modelChoice(value: ModelFamily) {
  return modelChoices.find((choice) => choice.id === value)!;
}

function setting(name: string): string {
  return String(process.env[name] || "").trim();
}

export function tokenHubConfig() {
  return {
    baseUrl: setting("PARATERA_BASE_URL").replace(/\/+$/, ""),
    apiKey: setting("PARATERA_API_KEY"),
    models: {
      qwen: {
        thinking: setting("PARATERA_QWEN_THINKING_MODEL"),
        nonThinking: setting("PARATERA_QWEN_NONTHINKING_MODEL"),
      },
      deepseek: {
        thinking: setting("PARATERA_DEEPSEEK_THINKING_MODEL"),
        nonThinking: setting("PARATERA_DEEPSEEK_NONTHINKING_MODEL"),
      },
      glm45: { thinking: "", nonThinking: setting("PARATERA_GLM_45_FLASH_MODEL") },
      glm4v: { thinking: "", nonThinking: setting("PARATERA_GLM_4V_FLASH_MODEL") },
    },
    premiumConfigured: !!setting("PREMIUM_ACCESS_CODE"),
  };
}

/** This code is never returned by /api/config and stays in memory only in the browser. */
export function premiumAccessError(model: ModelFamily, code: unknown): string | null {
  if (!modelChoice(model).premium) return null;
  const expected = setting("PREMIUM_ACCESS_CODE");
  if (!expected) return "Premium access is not configured on the server.";
  if (typeof code !== "string" || code.length > 256) return "Enter a valid premium access code.";
  const supplied = code.trim();
  if (supplied.length !== expected.length) return "The premium access code is incorrect.";
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return difference ? "The premium access code is incorrect." : null;
}

function tokenRate(model: ModelFamily, direction: "INPUT" | "OUTPUT"): number | null {
  const names: Record<ModelFamily, string> = { glm45: "GLM_45_FLASH", glm4v: "GLM_4V_FLASH", qwen: "QWEN", deepseek: "DEEPSEEK" };
  const raw = setting(`PARATERA_${names[model]}_${direction}_USD_PER_MILLION`);
  const rate = Number(raw);
  return raw && Number.isFinite(rate) && rate >= 0 ? rate : null;
}

export function tokenUsage(value: unknown, model: ModelFamily): TokenUsage | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as Record<string, unknown>;
  const count = (item: unknown) => typeof item === "number" && Number.isInteger(item) && item >= 0 ? item : null;
  const promptTokens = count(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = count(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = count(usage.total_tokens) ?? (promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null);
  if (totalTokens == null || promptTokens == null || completionTokens == null) return null;
  const inputRate = tokenRate(model, "INPUT");
  const outputRate = tokenRate(model, "OUTPUT");
  return { promptTokens, completionTokens, totalTokens, estimatedCostUsd: inputRate == null || outputRate == null ? null : (promptTokens * inputRate + completionTokens * outputRate) / 1_000_000 };
}

export function chatEndpoint(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/v1")) return null;
    return `${url.toString().replace(/\/+$/, "")}/chat/completions`;
  } catch { return null; }
}

/** OpenAI-compatible gateways may return plain text or an array of text parts. */
export function completionText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    const text = (part as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }).join("").trim();
}

export function responseTokenLimit(model: ModelFamily, requested: number): number {
  // GLM Flash can spend a short budget before producing any visible answer.
  return model === "glm45" || model === "glm4v" ? Math.max(requested, 1024) : requested;
}
