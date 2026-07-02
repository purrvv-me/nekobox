# ⚠️ DRAFT — NOT LEGAL ADVICE — DO NOT PUBLISH AS-IS

> **This is an engineering-generated draft, not a finished legal document.**
> It exists to capture the product's real behaviour and honest limitations so a
> qualified lawyer can turn it into binding Terms of Service and a Privacy
> Policy for your jurisdiction. **Have a licensed attorney review and adapt it
> before publishing or relying on it.** Bracketed `[PLACEHOLDERS]` must be filled
> in. Nothing here is legal advice.

---

# NekoBox — Terms of Service & Privacy Policy (Draft)

_Last updated: [DATE] · Operator: [LEGAL ENTITY / NAME] · Contact: [CONTACT EMAIL]_

## 0. Summary (plain language, non-binding)
NekoBox is an end-to-end encrypted file vault. Your files are encrypted **on your
device** before they reach us. We store only ciphertext and cannot read, index,
or recover your files. Because of this design, **if you lose your password and
your recovery code, your data is permanently and irretrievably lost — we cannot
help you, technically or otherwise.** You are responsible for what you upload and
share. The sections below state this precisely.

## 1. The service & the zero-knowledge model
1.1. Files, file names, and folder structure are encrypted in your browser with
keys derived from your password. The Operator's servers receive and store only
encrypted data and non-content metadata (see §6).

1.2. The Operator **cannot** decrypt your content, reset your password, or
reconstruct your keys. This is an intentional security property, not a
limitation we can waive on request — including in response to your own support
request, a court order, or any other demand.

## 2. Anonymity & the optional email
2.1. An account requires only a password (and a recovery code we show once). We
do not require your real name or phone number.

2.2. **Optional email recovery** is off by default. If you enable it, you accept
that:
- it reduces your anonymity and weakens the strict "we can never recover your
  vault" guarantee;
- we store a **keyed hash** of your email (not the address in clear) plus key
  material that, combined with control of that mailbox, can restore access to
  your vault key;
- anyone who controls the linked mailbox — or a compromised/compelled Operator —
  could use it to gain access. Leave it disabled if this trade-off is
  unacceptable to you.

2.3. If you provide an email, we use it solely for the recovery flow and
security/service notices (e.g. inactivity warnings, §5). We do not sell it.

## 3. Irrecoverability (read this)
3.1. Your password and your recovery code are the **only** ways to decrypt your
vault (plus the optional email path in §2 if you enabled it).

3.2. **If you lose all of them, your data is gone forever.** The Operator has no
backdoor, master key, or recovery mechanism and will not be able to restore your
files under any circumstances. You are solely responsible for safeguarding your
password and recovery code.

## 4. Your content & acceptable use
4.1. **You are solely responsible** for all content you upload, store, or share,
and for having the legal right to do so.

4.2. Because content is encrypted client-side, the Operator does **not** and
**cannot** pre-screen, scan, or moderate content. You agree not to use NekoBox
to store or share content that is unlawful in [JURISDICTION], including (without
limitation) child sexual abuse material, content that infringes others' rights,
or material whose possession or distribution is prohibited.

4.3. **Executable and active content.** You may upload any file type, including
executables (`.exe`, scripts, archives, etc.). The Operator does not scan for or
remove malware and provides no warranty that any stored or shared file is safe.
**Downloading and running files — including files received via a share link — is
entirely at your own risk.** You are responsible for scanning anything you
download before opening it.

4.4. Because the Operator cannot see content, enforcement is limited to acting on
verified reports and legal process against **accounts/links** (e.g. disabling a
share link or account), not on decrypting or inspecting files. The Operator may
suspend or terminate accounts or links that are the subject of valid legal
demands or abuse reports.

## 5. Inactive vaults & data retention
5.1. **Proposed policy (confirm with counsel):** a vault with **no sign-in or
activity for 12 consecutive months** may be scheduled for deletion.

5.2. Before deletion, the Operator will make reasonable effort to warn in
advance — **only** if you enabled email recovery — by sending a notice to the
linked email at least [30] days before deletion. If no email is linked, **no
warning is possible** and the vault may be deleted after the inactivity period
without further notice.

5.3. Deleted vaults (ciphertext + metadata) are removed and are **not
recoverable**. Backups, if any, are purged within [X] days.

## 6. What the server stores (data we process)
- **Never:** plaintext files, file/folder names in clear, your password, your
  encryption keys.
- **Stored ciphertext / wrapped material:** encrypted file blobs; encrypted file
  and folder names; the vault master key wrapped under your password key and
  under your recovery-code key (and, if enabled, under an email-recovery key);
  a keyed hash of a linked recovery email.
- **Non-content metadata (visible to the server):** encrypted-blob sizes, MIME
  type, timestamps, and, for share links, expiry/open-limit counters. These are
  necessary for storage, quotas, and link expiry and are **not** file contents.
- **Operational:** IP addresses and request logs may be processed transiently
  for security, rate-limiting, and abuse prevention as described by counsel in
  the final Privacy Policy; retention: [X].

## 7. Sharing links & the limits of technical protection
7.1. Share links carry the decryption key in the URL **fragment** (`#…`), which
is never transmitted to the server. Anyone with a link can decrypt the file
until the link expires, reaches its open limit, or you revoke it.

7.2. **Honest limits — no copy protection.** Once someone can view a file, they
can copy it. NekoBox cannot prevent a recipient from saving, re-sharing, or
photographing decrypted content (the "analog hole"). Any visible **watermark**
on a shared view is a **record that a view occurred at a given time — a
deterrent and a trace, not a technical barrier to copying.** Do not share
anything with someone you would not trust to keep it.

7.3. Revoking a link stops **future** access; it cannot recall or delete copies a
recipient already decrypted or downloaded.

## 8. Security, "as is", and limitation of liability
8.1. The software is provided **"AS IS"**, without warranties of any kind, to the
maximum extent permitted by law. No system is perfectly secure.

8.2. To the maximum extent permitted by [JURISDICTION] law, the Operator is not
liable for data loss (including loss from a forgotten password/recovery code),
for content uploaded or shared by users, or for indirect or consequential
damages. [Counsel to insert liability cap / carve-outs.]

## 9. Changes, termination, contact
9.1. These terms may change; material changes will be posted at [URL] and, where
email is linked, notified by email.

9.2. You may delete your vault at any time from the app. Deletion is permanent.

9.3. Questions: [CONTACT EMAIL].

## 10. Governing law & jurisdiction
These terms are governed by the laws of **[JURISDICTION — YOU WILL SPECIFY]**,
and disputes are subject to the courts of **[VENUE]**. [Consider consumer-law
carve-outs, arbitration clause, EU/UK GDPR + data-controller details, CCPA, and
DMCA/host-liability safe-harbour language — all to be drafted by counsel.]

---

### Engineering notes for counsel (delete before publishing)
- The zero-knowledge / no-backdoor claims in §1–§3 are literally true in the
  current implementation (client-side AES-256-GCM; server holds only wrapped
  keys). Wording should not accidentally promise recovery we cannot perform.
- §5 (inactivity) needs a concrete, implemented deletion job before the policy
  is published; the 12-month figure is a proposal, not yet enforced in code.
- §6 metadata list reflects exactly what the schema stores today.
- §7 watermark language must stay "trace/deterrent," never "prevents copying."
