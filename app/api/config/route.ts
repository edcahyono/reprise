import { NextResponse } from "next/server";
import { chatEndpoint, tokenHubConfig } from "@/lib/tokenhub";

export const runtime = "edge";
export function GET() {
  const config = tokenHubConfig();
  return NextResponse.json({
    connected: !!(config.apiKey && chatEndpoint(config.baseUrl)),
    models: config.models,
  }, { headers: { "cache-control": "no-store" } });
}
