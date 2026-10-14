import type { SourceFile } from "./experiment.ts";
import { keywordRank, sourcePassages } from "./source-retrieval.ts";

const queries = [
  "participants sample recruitment eligibility demographic characteristics",
  "experimental treatment control arms random assignment order waves timing",
  "survey questions decisions choices options instructions questionnaire",
  "probability premium price loss benefit annuity amount lottery",
  "adaptive branching follow up choice starting value stopping rule matrix",
  "outcome calculation analysis results table benchmark mean median",
];

/** Exact source excerpts for a fast, local first read; no model claims are added. */
export function indexedSourceNotes(sources: SourceFile[], maxCharactersPerFile = 18000): string[] {
  return sources.map((source) => {
    const passages = sourcePassages([source], 1700, 120);
    if (!passages.length) return `SOURCE: ${source.name}\n${source.text.slice(0, Math.max(0, maxCharactersPerFile - source.name.length - 9))}`;
    const selected: number[] = [];
    const seen = new Set<number>();
    const add = (index: number) => { if (index >= 0 && !seen.has(index)) { seen.add(index); selected.push(index); } };
    add(0);
    for (const query of queries) keywordRank(passages, query, 2).forEach(add);
    add(passages.length - 1);
    const excerpts: string[] = [];
    let used = 0;
    for (const index of selected) {
      const passage = passages[index];
      const item = `SOURCE: ${passage.source}${passage.page ? `, PDF page ${passage.page}` : ""}\n${passage.text}`;
      if (used + item.length > maxCharactersPerFile) continue;
      excerpts.push(item);
      used += item.length + 2;
    }
    return excerpts.join("\n\n");
  });
}
