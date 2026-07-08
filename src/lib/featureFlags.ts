// Simple env-driven feature flags for things that might need a quick, no-code
// toggle at launch time (e.g. disabling email recovery while a sending domain
// isn't verified with the mail provider yet).

/**
 * Whether the optional email-recovery feature (bind/request/material/complete)
 * is available. Disabled by default: enable it only after a real mail provider
 * is configured and the zero-knowledge trade-off is acceptable.
 */
export function emailRecoveryEnabled(): boolean {
  return process.env.ENABLE_EMAIL_RECOVERY === "true";
}
