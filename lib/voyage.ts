function setting(name: string): string {
  return String(process.env[name] || "").trim();
}

export function voyageConfig() {
  return { apiKey: setting("VOYAGE_API_KEY"), model: setting("VOYAGE_EMBEDDING_MODEL") || "voyage-4-lite" };
}

export async function voyageEmbeddings(texts: string[], inputType: "document" | "query", config = voyageConfig()): Promise<number[][]> {
  if (!config.apiKey) throw new Error("Voyage API key is not configured.");
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += 64) {
    const batch = texts.slice(start, start + 64);
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ input: batch, model: config.model, input_type: inputType, truncation: false }),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json() as { data?: { index: number; embedding: number[] }[]; detail?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || payload.detail || `Voyage request failed (${response.status}).`);
    if (!Array.isArray(payload.data) || payload.data.length !== batch.length) throw new Error("Voyage returned an incomplete embedding batch.");
    const sorted = [...payload.data].sort((a, b) => a.index - b.index);
    if (sorted.some((item, index) => item.index !== index || !Array.isArray(item.embedding) || !item.embedding.length)) throw new Error("Voyage returned invalid embeddings.");
    vectors.push(...sorted.map((item) => item.embedding));
  }
  return vectors;
}
