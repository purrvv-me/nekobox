import { parseMarkdown, parseInline, type InlineNode } from "@/lib/markdown";

// Renders our small trusted markdown subset (see lib/markdown.ts) as styled
// JSX. Not a general-purpose renderer — just enough for the legal document.
export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="legal-doc">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h1":
            return (
              <h1 key={i} className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.01em] text-ink">
                {renderInline(block.text)}
              </h1>
            );
          case "h2":
            return (
              <h2 key={i} className="mb-2.5 mt-8 text-[17px] font-semibold text-ink first:mt-0">
                {renderInline(block.text)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mb-2 mt-5 text-[14px] font-semibold text-ink">
                {renderInline(block.text)}
              </h3>
            );
          case "hr":
            return <hr key={i} className="my-7 border-line2" />;
          case "blockquote":
            return (
              <blockquote
                key={i}
                className="my-4 rounded-md border-l-[3px] border-line3 bg-field px-4 py-3 text-[13px] leading-[1.6] text-sub"
              >
                {renderInline(block.text)}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={i} className="my-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-[1.65] text-ink">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "p":
            return (
              <p key={i} className="my-3 text-[13.5px] leading-[1.7] text-ink">
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}

function renderInline(text: string) {
  return parseInline(text).map((node, i) => renderInlineNode(node, i));
}

function renderInlineNode(node: InlineNode, key: number) {
  switch (node.type) {
    case "bold":
      return (
        <strong key={key} className="font-semibold text-ink">
          {node.value}
        </strong>
      );
    case "italic":
      return (
        <em key={key} className="italic">
          {node.value}
        </em>
      );
    case "code":
      return (
        <code key={key} className="rounded bg-field px-1.5 py-0.5 font-mono text-[12px] text-ink">
          {node.value}
        </code>
      );
    case "text":
      return <span key={key}>{node.value}</span>;
  }
}
