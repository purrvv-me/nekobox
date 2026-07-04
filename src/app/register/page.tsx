import { RegisterForm } from "@/components/RegisterForm";
import { emailRecoveryEnabled } from "@/lib/featureFlags";

// Server Component: reads the (server-only) feature flag and hands it down as
// a prop, so ENABLE_EMAIL_RECOVERY=false hides the email-recovery UI without
// needing a NEXT_PUBLIC_ variable.
export default function RegisterPage() {
  return <RegisterForm emailRecoveryEnabled={emailRecoveryEnabled()} />;
}
