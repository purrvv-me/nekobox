// Simple env-driven feature flags for things that might need a quick, no-code
// toggle at launch time (e.g. disabling email recovery while a sending domain
// isn't verified with the mail provider yet).

/**
 * Whether the optional email-recovery feature (bind/request/material/complete)
 * is available. Enabled by default (matches prior behaviour); set
 * ENABLE_EMAIL_RECOVERY=false to hide the UI and reject the API routes —
 * e.g. while your Resend sending domain is still pending verification.
 */
export function emailRecoveryEnabled(): boolean {
  return process.env.ENABLE_EMAIL_RECOVERY !== "false";
}
