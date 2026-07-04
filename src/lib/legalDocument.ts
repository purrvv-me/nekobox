import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

// The published Terms of Service & Privacy Policy live as a single markdown
// document under legal/ (source of truth, easy to edit without touching
// component code). Both /terms and /privacy render the same document — the
// current draft genuinely combines the two, and splitting them into separate
// legal documents is an editorial decision for whoever finalizes the policy,
// not something to invent here.
//
// NOTE: an internal engineering draft with a "not legal advice" banner and
// notes for counsel lives at legal/TERMS-AND-PRIVACY.draft.md — that file is
// intentionally NOT read here; it's for internal reference only.

const DOC_PATH = path.join(process.cwd(), "legal", "terms-and-privacy.md");

let cached: string | null = null;

/** Raw markdown source of the published legal document. */
export function loadLegalMarkdown(): string {
  cached ??= readFileSync(DOC_PATH, "utf8");
  return cached;
}
