// A minimal PDF writer. Reports are plain typeset text and ruled tables, so
// the standard Helvetica faces every reader already has are enough and no
// font embedding or third-party library is needed.

export type ReportBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "note"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; title?: string; columns: string[]; rows: string[][] }
  | { kind: "spacer" };

const PAGE_WIDTH = 595.28; // A4 at 72 dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type Style = { font: "F1" | "F2"; size: number; leading: number; gapBefore: number; gapAfter: number; gray?: number };
const STYLES: Record<string, Style> = {
  title: { font: "F2", size: 19, leading: 24, gapBefore: 0, gapAfter: 14 },
  heading: { font: "F2", size: 12.5, leading: 16, gapBefore: 16, gapAfter: 7 },
  paragraph: { font: "F1", size: 10, leading: 14.5, gapBefore: 0, gapAfter: 9 },
  note: { font: "F1", size: 8.6, leading: 12.5, gapBefore: 0, gapAfter: 9, gray: 0.38 },
  bullet: { font: "F1", size: 10, leading: 14.5, gapBefore: 0, gapAfter: 4 },
  tableTitle: { font: "F2", size: 10, leading: 14, gapBefore: 6, gapAfter: 5 },
  tableHead: { font: "F2", size: 8.4, leading: 12, gapBefore: 0, gapAfter: 0 },
  tableCell: { font: "F1", size: 8.4, leading: 12, gapBefore: 0, gapAfter: 0 },
};

// Helvetica advance widths (units/1000) for the printable ASCII range.
const WIDTHS = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD_WIDTHS = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function charWidth(code: number, bold: boolean): number {
  if (code === 32) return bold ? 278 : 278;
  if (code >= 32 && code <= 126) return (bold ? BOLD_WIDTHS : WIDTHS)[code - 32];
  return bold ? 611 : 556;
}
function textWidth(text: string, size: number, bold: boolean): number {
  let total = 0;
  for (const character of text) total += charWidth(character.codePointAt(0)!, bold);
  return total * size / 1000;
}

/** PDF's standard fonts are byte encodings, so unsupported characters are mapped to plain ASCII. */
function toLatin(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"')
    .replace(/—/g, " - ").replace(/[–−]/g, "-").replace(/…/g, "...")
    .replace(/[   ]/g, " ").replace(/→/g, "->").replace(/·/g, "-")
    .replace(/[^\x20-\x7e\n]/g, (character) => {
      const normalized = character.normalize("NFD").replace(/[̀-ͯ]/g, "");
      return /^[\x20-\x7e]+$/.test(normalized) ? normalized : "?";
    });
}
const escapeText = (text: string) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function wrap(text: string, width: number, size: number, bold: boolean): string[] {
  const lines: string[] = [];
  for (const paragraph of toLatin(text).split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(candidate, size, bold) <= width || !current) {
        // A single word longer than the column is broken at the character level.
        if (!current && textWidth(word, size, bold) > width) {
          let piece = "";
          for (const character of word) {
            if (textWidth(piece + character, size, bold) > width && piece) { lines.push(piece); piece = ""; }
            piece += character;
          }
          current = piece;
          continue;
        }
        current = candidate;
      } else { lines.push(current); current = word; }
    }
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

type Op = { text: string; x: number; y: number; font: "F1" | "F2"; size: number; gray: number } | { line: { x1: number; y1: number; x2: number; y2: number; gray: number } };

export function buildPdf(blocks: ReportBlock[], meta: { title: string; subtitle?: string }): Blob {
  const pages: Op[][] = [];
  let page: Op[] = [];
  let cursor = PAGE_HEIGHT - MARGIN;
  const newPage = () => { pages.push(page); page = []; cursor = PAGE_HEIGHT - MARGIN; };
  const room = (height: number) => { if (cursor - height < MARGIN + 24) newPage(); };
  const write = (text: string, style: Style, x = MARGIN, width = CONTENT_WIDTH) => {
    const bold = style.font === "F2";
    for (const line of wrap(text, width, style.size, bold)) {
      room(style.leading);
      cursor -= style.leading;
      page.push({ text: line, x, y: cursor, font: style.font, size: style.size, gray: style.gray ?? 0 });
    }
  };

  write(meta.title, STYLES.title);
  if (meta.subtitle) write(meta.subtitle, STYLES.note);

  for (const block of blocks) {
    if (block.kind === "spacer") { cursor -= 8; continue; }
    if (block.kind === "title") { cursor -= STYLES.heading.gapBefore; write(block.text, STYLES.title); continue; }
    if (block.kind === "heading") { cursor -= STYLES.heading.gapBefore; room(STYLES.heading.leading * 2); write(block.text, STYLES.heading); cursor -= STYLES.heading.gapAfter; continue; }
    if (block.kind === "paragraph") { write(block.text, STYLES.paragraph); cursor -= STYLES.paragraph.gapAfter; continue; }
    if (block.kind === "note") { write(block.text, STYLES.note); cursor -= STYLES.note.gapAfter; continue; }
    if (block.kind === "bullets") {
      for (const item of block.items) {
        room(STYLES.bullet.leading);
        const lines = wrap(item, CONTENT_WIDTH - 14, STYLES.bullet.size, false);
        lines.forEach((line, index) => {
          room(STYLES.bullet.leading);
          cursor -= STYLES.bullet.leading;
          if (index === 0) page.push({ text: "-", x: MARGIN, y: cursor, font: "F1", size: STYLES.bullet.size, gray: 0.3 });
          page.push({ text: line, x: MARGIN + 14, y: cursor, font: "F1", size: STYLES.bullet.size, gray: 0 });
        });
        cursor -= STYLES.bullet.gapAfter;
      }
      cursor -= 5;
      continue;
    }
    // Tables: the first column takes the space the others do not need.
    if (block.title) { cursor -= STYLES.tableTitle.gapBefore; write(block.title, STYLES.tableTitle); cursor -= STYLES.tableTitle.gapAfter; }
    const columnCount = block.columns.length;
    const otherWidth = Math.min(96, (CONTENT_WIDTH - 150) / Math.max(1, columnCount - 1));
    const widths = block.columns.map((_, index) => index === 0 ? CONTENT_WIDTH - otherWidth * (columnCount - 1) : otherWidth);
    const offsets = widths.map((_, index) => MARGIN + widths.slice(0, index).reduce((sum, value) => sum + value, 0));
    const row = (cells: string[], style: Style) => {
      const wrapped = cells.map((cell, index) => wrap(cell, widths[index] - 7, style.size, style.font === "F2"));
      const height = Math.max(...wrapped.map((lines) => lines.length)) * style.leading + 4;
      room(height + 4);
      const top = cursor;
      wrapped.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => {
          page.push({ text: line, x: offsets[index], y: top - style.leading * (lineIndex + 1), font: style.font, size: style.size, gray: style.gray ?? 0 });
        });
      });
      cursor = top - height;
      page.push({ line: { x1: MARGIN, y1: cursor + 2, x2: MARGIN + CONTENT_WIDTH, y2: cursor + 2, gray: 0.82 } });
    };
    row(block.columns, STYLES.tableHead);
    for (const cells of block.rows) row(cells.map((cell) => cell || "-"), STYLES.tableCell);
    cursor -= 12;
  }
  pages.push(page);

  const streams = pages.map((operations, index) => {
    const parts = ["0.12 0.12 0.12 rg"];
    let gray = 0;
    for (const operation of operations) {
      if ("line" in operation) {
        parts.push(`q ${operation.line.gray} G 0.6 w ${operation.line.x1} ${operation.line.y1} m ${operation.line.x2} ${operation.line.y2} l S Q`);
        continue;
      }
      if (operation.gray !== gray) { parts.push(`${operation.gray + 0.12} ${operation.gray + 0.12} ${operation.gray + 0.12} rg`); gray = operation.gray; }
      parts.push(`BT /${operation.font} ${operation.size} Tf ${operation.x} ${operation.y} Td (${escapeText(operation.text)}) Tj ET`);
    }
    parts.push(`q 0.45 0.45 0.45 rg BT /F1 8 Tf ${MARGIN} ${MARGIN - 18} Td (${escapeText(`Page ${index + 1} of ${pages.length}`)}) Tj ET Q`);
    return parts.join("\n");
  });

  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  // Each page contributes a content stream object and a page object, and the
  // shared /Pages node is written straight after them.
  const pagesId = objects.length + streams.length * 2 + 1;
  const pageIds: number[] = [];
  for (const stream of streams) {
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  const pagesNode = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesNode} 0 R >>`);

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((content, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${content}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([body], { type: "application/pdf" });
}
