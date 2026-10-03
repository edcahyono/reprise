export type ModelFamily = "qwen" | "deepseek";
export type ModelMode = "thinking" | "nonThinking";

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
    },
  };
}

export function chatEndpoint(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/v1")) return null;
    return `${url.toString().replace(/\/+$/, "")}/chat/completions`;
  } catch { return null; }
}
