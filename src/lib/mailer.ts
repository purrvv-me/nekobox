import "server-only";

// Pluggable mail transport.
//   • RESEND_API_KEY set  → send via the Resend HTTP API.
//   • otherwise (dev)     → log the message to the server console.
// Call sites (sendRecoveryEmail) don't change when you switch providers.
//
// The recovery link is a secret: it is only ever delivered through this
// out-of-band channel, never returned in an HTTP response.

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Whether a real provider (Resend) is configured. */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** The "from" identity for outbound mail. */
export function mailFrom(): string {
  return process.env.MAIL_FROM ?? "NekoBox <onboarding@resend.dev>";
}

export async function sendMail(mail: Mail): Promise<void> {
  return isResendConfigured() ? sendViaResend(mail) : sendViaConsole(mail);
}

async function sendViaConsole(mail: Mail): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `\n─── MAIL (dev transport) ───\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n────────────────────────────\n`,
  );
}

async function sendViaResend(mail: Mail): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      ...(mail.html ? { html: mail.html } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }
}

export async function sendRecoveryEmail(to: string, url: string): Promise<void> {
  await sendMail({
    to,
    subject: "NekoBox — restore access to your vault",
    text:
      `Someone (hopefully you) requested access recovery for the NekoBox vault linked to this email.\n\n` +
      `Open this link within 15 minutes to set a new password and receive a new recovery code:\n\n${url}\n\n` +
      `If this wasn't you, ignore this message — the link expires on its own and can only be used once.`,
  });
}
