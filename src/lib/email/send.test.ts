import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { sendEmail, __resetEmailClient } from "./send";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: class Resend {
    emails = { send: sendMock };
  },
}));

beforeEach(() => {
  sendMock.mockReset();
  __resetEmailClient();
  vi.stubEnv("RESEND_API_KEY", "rk_test");
  vi.stubEnv("RESEND_FROM", "no-reply@manuva.app");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendEmail", () => {
  it("returns {ok:true,id} on Resend success", async () => {
    sendMock.mockResolvedValueOnce({
      data: { id: "msg_123" },
      error: null,
    });

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Hello",
      react: { type: "div", props: { children: "hi" } } as never,
    });

    expect(result).toEqual({ ok: true, id: "msg_123" });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "no-reply@manuva.app",
        to: "user@example.com",
        subject: "Hello",
      })
    );
  });

  it("returns {ok:false,error} when Resend returns an error", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "bad recipient" },
    });

    const result = await sendEmail({
      to: "broken",
      subject: "x",
      react: null as never,
    });

    expect(result).toEqual({ ok: false, error: "bad recipient" });
  });

  it("returns {ok:false,error} when Resend throws", async () => {
    sendMock.mockRejectedValueOnce(new Error("network down"));

    const result = await sendEmail({
      to: "user@example.com",
      subject: "x",
      react: null as never,
    });

    expect(result).toEqual({ ok: false, error: "network down" });
  });

  it("returns {ok:false} when RESEND_FROM is missing — never throws", async () => {
    vi.stubEnv("RESEND_FROM", "");

    const result = await sendEmail({
      to: "user@example.com",
      subject: "x",
      react: null as never,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/RESEND_FROM/);
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns {ok:false} when RESEND_API_KEY is missing — never throws", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    const result = await sendEmail({
      to: "user@example.com",
      subject: "x",
      react: null as never,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/RESEND_API_KEY/);
    }
  });
});
