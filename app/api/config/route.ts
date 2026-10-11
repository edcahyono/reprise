import { NextResponse } from "next/server";
import { chatEndpoint, tokenHubConfig } from "@/lib/tokenhub";
import { voyageConfig } from "@/lib/voyage";

export const runtime = "edge";
export function GET() {
  const config = tokenHubConfig();
  return NextResponse.json({
    connected: !!(config.apiKey && chatEndpoint(config.baseUrl)),
    semanticSearch: !!voyageConfig().apiKey && process.env.VOYAGE_SEMANTIC_SEARCH === "true",
    models: config.models,
    premiumConfigured: config.premiumConfigured,
  }, { headers: { "cache-control": "no-store" } });
}
