import { describe, it, expect } from "vitest";
import { loadLegalMarkdown } from "./legalDocument";
import { parseMarkdown } from "./markdown";

describe("published legal document", () => {
  const md = loadLegalMarkdown();

  it("loads a non-trivial document", () => {
    expect(md.length).toBeGreaterThan(1000);
  });

  it("does not contain the internal draft warning banner", () => {
    expect(md).not.toMatch(/DO NOT PUBLISH/i);
    expect(md).not.toMatch(/not a finished legal document/i);
    expect(md).not.toMatch(/have a licensed attorney review/i);
  });

  it("does not contain the internal engineering notes section", () => {
    expect(md).not.toMatch(/Engineering notes for counsel/i);
  });

  it("title has no '(Draft)' suffix", () => {
    expect(md).toMatch(/^# NekoBox — Terms of Service & Privacy Policy\s*$/m);
    expect(md).not.toMatch(/Terms of Service & Privacy Policy \(Draft\)/);
  });

  it("still leaves jurisdiction as an explicit placeholder for the operator to fill in", () => {
    expect(md).toMatch(/\[JURISDICTION/);
  });

  it("still states irrecoverability and the client-side encryption model plainly", () => {
    expect(md).toMatch(/data is (permanently and )?irretrievably lost/i);
    expect(md).toMatch(/zero-knowledge/i);
  });

  it("parses cleanly into a substantial block structure (no parser blow-ups)", () => {
    const blocks = parseMarkdown(md);
    expect(blocks.length).toBeGreaterThan(20);
    expect(blocks.filter((b) => b.type === "h2").length).toBeGreaterThanOrEqual(10);
  });
});
