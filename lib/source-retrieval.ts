import type { ExperimentProtocol, SourceFile } from "./experiment";

export type SourcePassage = { source: string; page: number | null; text: string };
const normalize = (value: string) => value.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) || [];

export function sourcePassages(sources: SourceFile[], size = 2600, overlap = 250): SourcePassage[] {
  const passages: SourcePassage[] = [];
  for (const source of sources) {
    const markers = [...source.text.matchAll(/\[Page (\d+)\]/g)];
    const pages = markers.length ? markers.map((marker, index) => ({
      page: Number(marker[1]),
      text: source.text.slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? source.text.length),
    })) : [{ page: null, text: source.text }];
    for (const page of pages) {
      // Printed table rows need their line boundaries for a model to match a
      // row label to the right column. Collapse spaces, but keep those rows.
      const clean = page.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      const step = Math.max(1, size - overlap);
      for (let start = 0; start < clean.length; start += step) {
        const text = clean.slice(start, start + size).trim();
        if (text.length >= 80) passages.push({ source: source.name, page: page.page, text });
        if (start + size >= clean.length) break;
      }
    }
  }
  return passages;
}

export function issueQuery(issue: string, protocol: ExperimentProtocol): string {
  const nodeId = issue.match(/Question ([^ ]+)/)?.[1];
  const conditionId = issue.match(/Condition ([^ ]+)/)?.[1];
  const armId = issue.match(/Arm ([^ ]+)/)?.[1];
  const node = protocol.nodes.find((item) => item.id === nodeId);
  const condition = protocol.conditions.find((item) => item.id === (conditionId || node?.conditionId));
  const arm = protocol.arms.find((item) => item.id === armId);
  return [issue, node?.prompt, node?.options.map((option) => option.text).join(" "), condition?.label, arm?.label, "questionnaire survey instrument branching randomization assignment instructions"].filter(Boolean).join(" ").slice(0, 1800);
}

export function keywordRank(passages: SourcePassage[], query: string, limit = 4): number[] {
  const terms = new Set(normalize(query).filter((word) => word.length > 3));
  return passages.map((passage, index) => {
    const words = normalize(passage.text);
    const counts = new Map<string, number>();
    for (const word of words) if (terms.has(word)) counts.set(word, Math.min(4, (counts.get(word) || 0) + 1));
    const score = [...counts.values()].reduce((sum, count) => sum + 1 + Math.log(count), 0) / Math.sqrt(Math.max(1, words.length));
    return { index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(({ index }) => index);
}

export function decisionPassages(sources: SourceFile[], query: string, conditionLabels: string): SourcePassage[] {
  const passages = sourcePassages(sources);
  const appendix = sources.find((source) => /Online Appendix B[\s\S]{0,100}Survey Instrument/i.test(source.text) && /LS_LOW/.test(source.text) && /LS_MED/.test(source.text));
  const taskPages = /CV[\s_-]*(?:sell|plus)/i.test(conditionLabels) ? [44, 45, 46]
    : /(?:CV|EV)[\s_-]*(?:buy|sell|minus|plus)/i.test(conditionLabels) ? [54, 55, 56] : [];
  const relevantPages = [...taskPages, 31, 32, 33, 34, 35];
  const required = appendix ? relevantPages.flatMap((page) => passages.filter((passage) => passage.source === appendix.name && passage.page === page)) : [];
  const ranked = keywordRank(passages, query, 12).map((index) => passages[index]);
  return [...new Set([...required, ...ranked])];
}

export function decisionEvidence(passages: SourcePassage[], maxCharacters = 30000): string {
  const selected: string[] = [];
  let used = 0;
  for (const passage of passages) {
    const item = `SOURCE: ${passage.source}${passage.page ? `, PDF page ${passage.page}` : ""}\n${passage.text}`;
    if (used + item.length + 2 > maxCharacters) continue;
    selected.push(item);
    used += item.length + 2;
  }
  return selected.join("\n\n");
}

export function vectorRank(vectors: number[][], query: number[], limit = 4): number[] {
  return vectors.map((vector, index) => ({ index, score: vector.reduce((sum, value, offset) => sum + value * (query[offset] || 0), 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(({ index }) => index);
}
