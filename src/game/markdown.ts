// Renders the Markdown subset used by doc and mail bodies (docs/content-format.md)
// to HTML. Run after placeholder substitution: {{player.handle}} is user input,
// so every source character is HTML-escaped before any tag is added, and no raw
// HTML from the text ever reaches the output.
//
// Subset: paragraphs (blank line separates; single newlines become <br>, the
// docs are typewritten), # / ## / ### headings, > blockquotes, --- as <hr>,
// simple GFM tables (header, separator, rows), **bold** and *italic*.
// The output has no newlines between tags because .paper keeps white-space: pre-wrap.

const HR_RE = /^ {0,3}-{3,}\s*$/;
const HEADING_RE = /^(#{1,3})\s+(.*?)\s*#*\s*$/;
const QUOTE_RE = /^ {0,3}>/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

export function renderMarkdown(text: string): string {
  return blocks(text.replace(/\r\n?/g, "\n").split("\n"));
}

function blocks(lines: string[]): string {
  let out = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
    } else if (HR_RE.test(line)) {
      out += "<hr>";
      i++;
    } else if (HEADING_RE.test(line)) {
      const [, hashes, title] = line.match(HEADING_RE)!;
      out += `<h${hashes.length}>${inline(title)}</h${hashes.length}>`;
      i++;
    } else if (QUOTE_RE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) quoted.push(lines[i++].replace(/^ {0,3}> ?/, ""));
      out += `<blockquote>${blocks(quoted)}</blockquote>`;
    } else if (isTableStart(lines, i)) {
      const header = cells(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") rows.push(cells(lines[i++]));
      const tr = (row: string[], tag: "th" | "td") =>
        `<tr>${header.map((_, c) => `<${tag}>${inline(row[c] ?? "")}</${tag}>`).join("")}</tr>`;
      out += `<table><thead>${tr(header, "th")}</thead><tbody>${rows.map((r) => tr(r, "td")).join("")}</tbody></table>`;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines, i)) para.push(lines[i++]);
      out += `<p>${para.map(inline).join("<br>")}</p>`;
    }
  }
  return out;
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  return HR_RE.test(line) || HEADING_RE.test(line) || QUOTE_RE.test(line) || isTableStart(lines, i);
}

function isTableStart(lines: string[], i: number): boolean {
  return lines[i].includes("|") && i + 1 < lines.length && lines[i + 1].includes("|") && TABLE_SEP_RE.test(lines[i + 1]);
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "<em>$1</em>");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
