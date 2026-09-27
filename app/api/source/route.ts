import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "cache-control": "no-store" } });
function plain(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
function doiFrom(input: string) {
  const cleaned = input.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
  return /^(10\.\d{4,9}\/\S+)$/i.test(cleaned) ? cleaned : null;
}
export async function POST(request: NextRequest) {
  let citation = "";
  try { const body = await request.json() as { citation?: unknown }; citation = String(body.citation || "").trim().slice(0, 500); } catch { return json({ error: "Enter a paper title, citation, or DOI." }, 400); }
  if (!citation) return json({ error: "Enter a paper title, citation, or DOI." }, 400);
  const doi = doiFrom(citation);
  try {
    const url = doi ? `https://api.crossref.org/works/${encodeURIComponent(doi)}` : `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(citation)}&rows=1`;
    const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("lookup unavailable");
    const data = await response.json() as { message?: Record<string, unknown> };
    const raw = doi ? data.message : (data.message?.items as Record<string, unknown>[] | undefined)?.[0];
    if (!raw) throw new Error("no match");
    const title = Array.isArray(raw.title) ? String(raw.title[0] || "") : "";
    const abstract = typeof raw.abstract === "string" ? plain(raw.abstract).slice(0, 18000) : "";
    return json({ source: { citation, title: plain(title) || citation, doi: String(raw.DOI || doi || ""), abstract, note: doi ? (abstract ? "Paper metadata and abstract found. Upload the full text for a stronger reconstruction." : "Paper metadata found. Upload the full text; this record has no abstract.") : "Likely paper match found. Verify the title and DOI, then upload the full text." } });
  } catch {
    if (doi) return json({ source: { citation, doi, note: "DOI lookup is unavailable. You can continue from the DOI, but upload the paper for source-grounded work." } });
    return json({ source: { citation, note: "Paper lookup is unavailable. You can continue from the citation, but upload the paper for source-grounded work." } });
  }
}
