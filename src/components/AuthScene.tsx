// Shared Windows-logon-style backdrop for login/register: dark gradient,
// glowing constellation dots, centered brand mark + title + glass card.
import Link from "next/link";
import { BrandMark } from "./icons";

export function AuthScene({
  title,
  subtitle,
  width = 400,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  width?: number;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{ background: "linear-gradient(160deg, #2b2b2b 0%, #0a0a0a 100%)" }}
    >
      {/* paw constellation */}
      {[
        { r: "14%", t: "18%", s: 7, o: 0.85 },
        { r: "11%", t: "24%", s: 5, o: 0.7 },
        { r: "17%", t: "25%", s: 5, o: 0.7 },
        { r: "14%", t: "31%", s: 9, o: 0.8 },
      ].map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            right: d.r,
            top: d.t,
            width: d.s,
            height: d.s,
            opacity: d.o,
            boxShadow: "0 0 14px rgba(255,255,255,0.5)",
          }}
        />
      ))}

      <div className="w-full px-6" style={{ maxWidth: width }}>
        <div className="mb-5 flex flex-col items-center text-center">
          <div
            className="mb-[15px] flex h-[88px] w-[88px] items-center justify-center rounded-[22px] text-white"
            style={{
              background: "linear-gradient(160deg, #2a2a2a, #000)",
              boxShadow: "0 12px 34px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            <BrandMark size={44} />
          </div>
          <h1
            className="m-0 text-[26px] font-semibold tracking-[0.2px] text-white"
            style={{ textShadow: "0 1px 8px rgba(0,0,0,0.25)" }}
          >
            {title}
          </h1>
          <p
            className="m-0 mt-1.5 text-[13px] text-white/90"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.25)" }}
          >
            {subtitle}
          </p>
        </div>

        <div className="rounded-[14px] bg-white/[0.97] p-6 shadow-authcard">{children}</div>

        <p
          className="m-0 mt-4 text-center text-[12.5px] text-white/90"
          style={{ textShadow: "0 1px 6px rgba(0,0,0,0.25)" }}
        >
          {footer}
        </p>

        <p className="m-0 mt-3 text-center text-[11px] text-white/50">
          <Link href="/terms" className="underline underline-offset-2 hover:text-white/80">
            Terms
          </Link>
          <span className="mx-1.5">·</span>
          <Link href="/privacy" className="underline underline-offset-2 hover:text-white/80">
            Privacy
          </Link>
        </p>
      </div>
    </main>
  );
}
