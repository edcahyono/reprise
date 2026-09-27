import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";

export const runtime = "edge";
export function GET() {
  return NextResponse.json({
    qwen: !!(env.QWEN_API_KEY || process.env.QWEN_API_KEY),
    deepseek: !!(env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY),
  }, { headers: { "cache-control": "no-store" } });
}
