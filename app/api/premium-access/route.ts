import { NextRequest, NextResponse } from "next/server";
import { premiumAccessError } from "@/lib/tokenhub";

export const runtime = "edge";
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { code?: unknown };
  const error = premiumAccessError("deepseek", body.code);
  return NextResponse.json(error ? { error } : { unlocked: true }, { status: error ? 403 : 200, headers: { "cache-control": "no-store" } });
}
