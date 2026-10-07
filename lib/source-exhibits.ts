import type { SourceFile } from "./experiment.ts";

export type SourceExhibit = { id: string; kind: "Table" | "Figure"; number: string; title: string; source: string; page: number | null; main: boolean };

/** Read printed captions from every uploaded source, without a model or a cap. */
export function sourceExhibits(sources: SourceFile[], mainSourceName: string): SourceExhibit[] {
  const found: SourceExhibit[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const pages = source.text.split(/(?=\[Page \d+\])/).filter(Boolean);
    for (const pageText of pages) {
      const page = Number(pageText.match(/^\[Page (\d+)\]/)?.[1]) || null;
      for (const line of pageText.split("\n")) {
        const match = line.trim().match(/^(T\s*ABLE|F\s*IGURE)\s+((?:A\s*\.\s*)?\d+)\s*[.:]\s*(.+)$/i);
        if (!match) continue;
        const kind = /^T/i.test(match[1]) ? "Table" : "Figure";
        const number = match[2].replace(/\s+/g, "");
        const key = `${source.name}:${kind}:${number.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ id: key, kind, number, title: `${kind} ${number}. ${match[3].trim()}`.slice(0, 230), source: source.name, page, main: source.name === mainSourceName });
      }
    }
  }
  return found.sort((a, b) => Number(b.main) - Number(a.main) || a.source.localeCompare(b.source) || (a.page ?? 0) - (b.page ?? 0));
}
