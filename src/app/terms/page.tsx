import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { loadLegalMarkdown } from "@/lib/legalDocument";

export const metadata: Metadata = {
  title: "Terms of Service — NekoBox",
  description: "NekoBox Terms of Service.",
};

export default function TermsPage() {
  return <LegalPage active="terms" source={loadLegalMarkdown()} />;
}
