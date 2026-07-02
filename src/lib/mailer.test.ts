import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMail, isResendConfigured, mailFrom } from "./mailer";

const MAIL = { to: "user@example.com", subject: "hi", text: "body" };

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  vi.restoreAllMocks();
});

describe("mailer transport selection", () => {
  it("dev mode (no key): logs to console and does not call the HTTP API", async () => {
    expect(isResendConfigured()).toBe(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await sendMail(MAIL);
    expect(log).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resend mode: POSTs to the Resend API with auth + payload", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "NekoBox <no-reply@nekobox.app>";
    expect(isResendConfigured()).toBe(true);
    expect(mailFrom()).toBe("NekoBox <no-reply@nekobox.app>");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "x" }), { status: 200 }));

    await sendMail(MAIL);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      from: "NekoBox <no-reply@nekobox.app>",
      to: ["user@example.com"],
      subject: "hi",
      text: "body",
    });
  });

  it("resend mode: throws on a non-2xx response", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 422 }));
    await expect(sendMail(MAIL)).rejects.toThrow(/Resend send failed \(422\)/);
  });
});
