import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { loadLegalMarkdown } from "@/lib/legalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy — NekoBox",
  description: "NekoBox Privacy Policy.",
};

export default function PrivacyPage() {
  return <LegalPage active="privacy" source={loadLegalMarkdown()} />;
}
