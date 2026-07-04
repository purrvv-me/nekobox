import { describe, it, expect } from "vitest";
import { parseMarkdown, parseInline } from "./markdown";

describe("parseMarkdown — block structure", () => {
  it("parses heading levels", () => {
    expect(parseMarkdown("# Title")).toEqual([{ type: "h1", text: "Title" }]);
    expect(parseMarkdown("## Section")).toEqual([{ type: "h2", text: "Section" }]);
    expect(parseMarkdown("### Sub")).toEqual([{ type: "h3", text: "Sub" }]);
  });

  it("detects a horizontal rule on its own line", () => {
    expect(parseMarkdown("---")).toEqual([{ type: "hr" }]);
  });

  it("joins soft-wrapped lines into one paragraph, splits on blank lines", () => {
    const src = "Line one\nLine two continues.\n\nA new paragraph.";
    expect(parseMarkdown(src)).toEqual([
      { type: "p", text: "Line one Line two continues." },
      { type: "p", text: "A new paragraph." },
    ]);
  });

  it("collects consecutive dash items into one unordered-list block", () => {
    const src = "- first\n- second\n- third";
    expect(parseMarkdown(src)).toEqual([{ type: "ul", items: ["first", "second", "third"] }]);
  });

  it("ends a list when a non-list line follows", () => {
    const src = "- a\n- b\nplain text";
    expect(parseMarkdown(src)).toEqual([
      { type: "ul", items: ["a", "b"] },
      { type: "p", text: "plain text" },
    ]);
  });

  it("collects consecutive blockquote lines into one block", () => {
    const src = "> line one\n> line two";
    expect(parseMarkdown(src)).toEqual([{ type: "blockquote", text: "line one line two" }]);
  });

  it("handles a realistic mixed document", () => {
    const src = [
      "# Doc Title",
      "",
      "_byline text_",
      "",
      "## 1. Section",
      "1.1. First sentence spans",
      "two lines here.",
      "",
      "## 2. Another",
      "- item one",
      "- item two",
      "",
      "---",
      "",
      "## 3. Last",
      "Final paragraph.",
    ].join("\n");
    const blocks = parseMarkdown(src);
    expect(blocks[0]).toEqual({ type: "h1", text: "Doc Title" });
    expect(blocks[1]).toEqual({ type: "p", text: "_byline text_" });
    expect(blocks[2]).toEqual({ type: "h2", text: "1. Section" });
    expect(blocks[3]).toEqual({ type: "p", text: "1.1. First sentence spans two lines here." });
    expect(blocks[4]).toEqual({ type: "h2", text: "2. Another" });
    expect(blocks[5]).toEqual({ type: "ul", items: ["item one", "item two"] });
    expect(blocks[6]).toEqual({ type: "hr" });
    expect(blocks[7]).toEqual({ type: "h2", text: "3. Last" });
    expect(blocks[8]).toEqual({ type: "p", text: "Final paragraph." });
  });

  it("ignores leading/trailing blank lines", () => {
    expect(parseMarkdown("\n\n# Title\n\n\n")).toEqual([{ type: "h1", text: "Title" }]);
  });
});

describe("parseInline — inline formatting", () => {
  it("returns a single text node for plain text", () => {
    expect(parseInline("hello world")).toEqual([{ type: "text", value: "hello world" }]);
  });

  it("extracts bold spans", () => {
    expect(parseInline("a **bold** word")).toEqual([
      { type: "text", value: "a " },
      { type: "bold", value: "bold" },
      { type: "text", value: " word" },
    ]);
  });

  it("extracts italic spans", () => {
    expect(parseInline("an _italic_ word")).toEqual([
      { type: "text", value: "an " },
      { type: "italic", value: "italic" },
      { type: "text", value: " word" },
    ]);
  });

  it("extracts inline code spans", () => {
    expect(parseInline("run `.exe` files")).toEqual([
      { type: "text", value: "run " },
      { type: "code", value: ".exe" },
      { type: "text", value: " files" },
    ]);
  });

  it("handles multiple mixed markers in one string", () => {
    const nodes = parseInline("**Bold** and _italic_ and `code` together");
    expect(nodes.map((n) => n.type)).toEqual([
      "bold",
      "text",
      "italic",
      "text",
      "code",
      "text",
    ]);
    expect(nodes.map((n) => n.value)).toEqual([
      "Bold",
      " and ",
      "italic",
      " and ",
      "code",
      " together",
    ]);
  });

  it("does not let bold-splitting corrupt an inline code span containing asterisks", () => {
    // code is processed first, so ** inside backticks is protected.
    const nodes = parseInline("`a**b`");
    expect(nodes).toEqual([{ type: "code", value: "a**b" }]);
  });

  it("leaves an unmatched marker as literal text without crashing", () => {
    expect(parseInline("a * lone star")).toEqual([{ type: "text", value: "a * lone star" }]);
  });
});
