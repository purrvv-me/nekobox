import "server-only";

// Mail transport. No SMTP is configured in this project, so the default
// transport logs the message to the server console (dev-friendly: copy the
// link from the terminal). Swap `sendMail` for a real provider (Resend,
// SES, SMTP) in production — the call sites don't change.
//
// NOTE: the recovery link is a secret. It is deliberately never returned in
// any HTTP response — only delivered through this (out-of-band) channel.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `\n─── MAIL (dev transport) ───\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n────────────────────────────\n`,
  );
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
