import Link from "next/link";
import { BrandMark } from "./icons";
import { Markdown } from "./Markdown";

export function LegalPage({ active, source }: { active: "terms" | "privacy"; source: string }) {
  return (
    <div className="h-screen overflow-y-auto bg-wbg">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-mica/90 px-5 py-3 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-accent text-white">
            <BrandMark size={16} />
          </span>
          <span className="text-[13px] font-semibold">NekoBox</span>
        </Link>
        <nav className="ml-2 flex items-center gap-1 text-[12.5px]">
          <Link
            href="/terms"
            className={`rounded-md px-2.5 py-1 ${active === "terms" ? "bg-accent text-white" : "text-sub hover:text-ink"}`}
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className={`rounded-md px-2.5 py-1 ${active === "privacy" ? "bg-accent text-white" : "text-sub hover:text-ink"}`}
          >
            Privacy Policy
          </Link>
        </nav>
        <div className="flex-1" />
        <Link href="/login" className="text-[12.5px] text-sub hover:text-ink">
          Back to app
        </Link>
      </header>

      <main className="mx-auto max-w-[720px] px-6 pb-24 pt-8">
        <Markdown source={source} />
      </main>
    </div>
  );
}
