import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // NekoBox "Windows 11 Fluent" palette — Mica surfaces, ink accent.
        wbg: "#eef1f6", // desktop background
        mica: "#f7f8fb", // tab strip / status bar
        nav: "#fafbfc", // nav pane
        field: "#f6f7fa", // address bar / search fields
        win: "#ffffff",
        line: "#eceef3",
        line2: "#e0e3ea",
        line3: "#e3e6ec",
        ink: "#1b1b1b", // body text
        accent: "#1a1a1a", // primary action
        "accent-hover": "#000000",
        sub: "#6a6a6a",
        sub2: "#9aa0a8",
        faint: "#a3a8b0",
        danger: "#c42b1c",
      },
      fontFamily: {
        sans: [
          "'Segoe UI Variable Text'",
          "'Segoe UI'",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        win: "0 24px 60px rgba(20,30,60,0.22)",
        dialog: "0 30px 70px rgba(0,0,0,0.32)",
        ctx: "0 16px 44px rgba(0,0,0,0.22)",
        authcard: "0 18px 50px rgba(20,30,60,0.3)",
      },
      keyframes: {
        "nb-stripes": { from: { backgroundPosition: "0 0" }, to: { backgroundPosition: "28px 0" } },
        "nb-ctx": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        "nb-dialog": { from: { opacity: "0", transform: "scale(0.94)" }, to: { opacity: "1", transform: "scale(1)" } },
        "nb-overlay": { from: { opacity: "0" }, to: { opacity: "1" } },
        "nb-page": { from: { opacity: "0.4", transform: "translateY(9px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "nb-ctx": "nb-ctx 0.12s ease",
        "nb-dialog": "nb-dialog 0.16s ease",
        "nb-overlay": "nb-overlay 0.14s ease",
        "nb-page": "nb-page 0.26s cubic-bezier(.2,.8,.25,1)",
      },
    },
  },
  plugins: [],
};

export default config;
