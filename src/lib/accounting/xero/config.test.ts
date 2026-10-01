import { describe, expect, it } from "vitest";
import { buildXeroAuthorizeUrl, getXeroConfig, isXeroPilotTenant, XERO_SCOPES } from "./config";

const full = { XERO_CLIENT_ID: "cid", XERO_CLIENT_SECRET: "sec", XERO_REDIRECT_URI: "https://app.manuva.app/api/xero/callback", ACCOUNTING_TOKEN_KEY: "k" };

describe("xero config", () => {
  it("reports every missing variable", () => {
    expect(getXeroConfig({})).toEqual({ ok: false, reason: "missing-config", missing: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI", "ACCOUNTING_TOKEN_KEY"] });
  });

  it("returns config when complete", () => {
    expect(getXeroConfig(full)).toEqual({ ok: true, clientId: "cid", clientSecret: "sec", redirectUri: full.XERO_REDIRECT_URI });
  });

  it("requests granular scopes only", () => {
    expect(XERO_SCOPES).toBe("openid profile email offline_access accounting.invoices accounting.contacts accounting.settings.read");
    expect(XERO_SCOPES).not.toContain("accounting.transactions");
  });

  it("builds the authorize URL", () => {
    const cfg = getXeroConfig(full);
    if (!cfg.ok) throw new Error("expected ok");
    const url = new URL(buildXeroAuthorizeUrl(cfg, "st.ate"));
    expect(url.origin + url.pathname).toBe("https://login.xero.com/identity/connect/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe(full.XERO_REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe(XERO_SCOPES);
    expect(url.searchParams.get("state")).toBe("st.ate");
  });

  it("gates by pilot list or *", () => {
    expect(isXeroPilotTenant("t1", { XERO_PILOT_TENANTS: "t0, t1" })).toBe(true);
    expect(isXeroPilotTenant("t2", { XERO_PILOT_TENANTS: "t0,t1" })).toBe(false);
    expect(isXeroPilotTenant("t2", { XERO_PILOT_TENANTS: "*" })).toBe(true);
    expect(isXeroPilotTenant("t1", {})).toBe(false);
    expect(isXeroPilotTenant(null, { XERO_PILOT_TENANTS: "*" })).toBe(false);
  });
});
