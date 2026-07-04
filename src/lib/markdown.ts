// A tiny, dependency-free markdown subset parser for our own trusted, static
// legal document content (not user input). Supports exactly what that
// document uses: headings (#/##/###), horizontal rules (---), blockquotes
// (> ), unordered lists (- ), paragraphs (blank-line separated, soft-wrapped
// lines joined with a space), and inline bold/italic/code.
//
// Deliberately NOT a general-purpose CommonMark implementation — kept small
// and fully unit-testable as pure functions returning plain data (no JSX),
// so a separate render step can turn the parsed structure into React nodes.

export type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "hr" }
  | { type: "blockquote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "p"; text: string };

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "p", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push({ type: "blockquote", text: quote.join(" ").trim() });
      quote = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "ul", items: list.slice() });
      list = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed === "") {
      flushAll();
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      flushAll();
      blocks.push({ type: "hr" });
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(trimmed);
    if (h3) {
      flushAll();
      blocks.push({ type: "h3", text: h3[1].trim() });
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(trimmed);
    if (h2) {
      flushAll();
      blocks.push({ type: "h2", text: h2[1].trim() });
      continue;
    }
    const h1 = /^#\s+(.*)$/.exec(trimmed);
    if (h1) {
      flushAll();
      blocks.push({ type: "h1", text: h1[1].trim() });
      continue;
    }
    const quoteLine = /^>\s?(.*)$/.exec(trimmed);
    if (quoteLine) {
      flushParagraph();
      flushList();
      quote.push(quoteLine[1]);
      continue;
    }
    const listItem = /^[-*]\s+(.*)$/.exec(trimmed);
    if (listItem) {
      flushParagraph();
      flushQuote();
      list.push(listItem[1]);
      continue;
    }
    // Plain text line: continues the current paragraph (blockquotes/lists were
    // already flushed above when a non-matching line appears after them).
    flushQuote();
    flushList();
    paragraph.push(trimmed);
  }
  flushAll();
  return blocks;
}

// ─── Inline formatting ─────────────────────────────────────────────────
export type InlineNode =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string };

// Order matters: code first (so ** inside `code` isn't touched), then bold
// (**), then italic (_..._). Each pass only affects "text" nodes, so already
//-tagged spans are left alone.
export function parseInline(text: string): InlineNode[] {
  let nodes: InlineNode[] = [{ type: "text", value: text }];
  nodes = splitOn(nodes, /`([^`]+)`/g, "code");
  nodes = splitOn(nodes, /\*\*([^*]+)\*\*/g, "bold");
  nodes = splitOn(nodes, /_([^_]+)_/g, "italic");
  return nodes.filter((n) => n.value !== "");
}

function splitOn(nodes: InlineNode[], re: RegExp, type: InlineNode["type"]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const node of nodes) {
    if (node.type !== "text") {
      out.push(node);
      continue;
    }
    const src = node.value;
    let last = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      if (m.index > last) out.push({ type: "text", value: src.slice(last, m.index) });
      out.push({ type, value: m[1] } as InlineNode);
      last = m.index + m[0].length;
    }
    if (last < src.length) out.push({ type: "text", value: src.slice(last) });
  }
  return out;
}
