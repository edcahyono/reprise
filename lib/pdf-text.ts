type PdfTextItem = { str?: string; hasEOL?: boolean };

// Keep the text layer's reading order and line breaks. PDF.js may split a word
// across items or end a printed line with a hyphen.
export function pdfPageText(items: readonly unknown[]): string {
  const lines: string[] = [];
  let line = "";
  let joinNext = false;
  for (const value of items) {
    const item: PdfTextItem = value && typeof value === "object" ? value as PdfTextItem : {};
    const fragment = typeof item.str === "string" ? item.str.normalize("NFKC").replace(/\u00ad/g, "").replace(/\s+/g, " ").trim() : "";
    if (fragment) {
      line += `${line && !joinNext ? " " : ""}${fragment}`;
      joinNext = false;
    }
    if (item.hasEOL) {
      if (/\p{L}-$/u.test(line)) {
        line = line.slice(0, -1);
        joinNext = true;
      } else {
        if (line.trim()) lines.push(line.trim());
        line = "";
      }
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}
