import { describe, expect, it, vi } from "vitest";
import { decryptToken } from "@/lib/security/token-crypto";
import { getSquareAccessToken, sealSquareTokens, type SquareCredentialStore } from "./tokens";

const key = { key: Buffer.alloc(32, 1), version: 1 };
const now = Date.now();
const tokens = { accessToken: "test-only-new-access", refreshToken: "test-only-refresh", merchantId: "Pac-Technologies", expiresAt: new Date(now + 30 * 86_400_000).toISOString() };
function setup(expiryDays: number) {
  const row = { connection_id: "test-connection", ...sealSquareTokens({ ...tokens, accessToken: "test-only-old-access", expiresAt: new Date(now + expiryDays * 86_400_000).toISOString() }, key), version: 1, refresh_lease_until: null };
  const store: SquareCredentialStore = { read: vi.fn().mockResolvedValue(row), claimLease: vi.fn().mockResolvedValue(row), writeRefreshed: vi.fn().mockResolvedValue(true), releaseLease: vi.fn().mockResolvedValue(undefined), markNeedsReconnect: vi.fn().mockResolvedValue(undefined) };
  const refresh = vi.fn().mockResolvedValue({ ok: true, data: tokens });
  return { row, store, refresh, deps: { store, key, merchantId: tokens.merchantId, refresh, now: () => now, sleep: async () => {}, waitTimeoutMs: 500 } };
}
describe("Square encrypted credential renewal", () => {
  it("encrypts credentials and uses a current access token without refresh", async () => {
    const f = setup(30);
    expect(f.row.access_token_enc).not.toContain("test-only-old-access");
    expect(await getSquareAccessToken(f.row.connection_id, f.deps)).toBe("test-only-old-access");
    expect(f.refresh).not.toHaveBeenCalled();
  });
  it("renews before seven days and saves an encrypted CAS update", async () => {
    const f = setup(22);
    expect(await getSquareAccessToken(f.row.connection_id, f.deps)).toBe(tokens.accessToken);
    expect(f.refresh).toHaveBeenCalledWith(tokens.refreshToken);
    const next = vi.mocked(f.store.writeRefreshed).mock.calls[0][2];
    expect(decryptToken(next.access_token_enc, key)).toBe(tokens.accessToken);
    expect(f.store.releaseLease).toHaveBeenCalledWith(f.row.connection_id, 1, null);
  });
  it("waits for another worker and uses its refreshed version without duplicate refresh", async () => {
    const f = setup(22);
    vi.mocked(f.store.claimLease).mockResolvedValue(null);
    vi.mocked(f.store.read).mockResolvedValueOnce(f.row).mockResolvedValue({ ...f.row, ...sealSquareTokens(tokens, key), version: 2 });
    expect(await getSquareAccessToken(f.row.connection_id, f.deps)).toBe(tokens.accessToken);
    expect(f.refresh).not.toHaveBeenCalled();
  });
  it("rejects refresh failure, changed merchant and failed CAS while releasing lease", async () => {
    for (const mode of ["auth", "merchant", "cas", "throw"] as const) {
      const f = setup(22);
      if (mode === "auth") f.refresh.mockResolvedValue({ ok: false, status: 401, errorClass: "auth", code: "UNAUTHORIZED" });
      if (mode === "merchant") f.refresh.mockResolvedValue({ ok: true, data: { ...tokens, merchantId: "other" } });
      if (mode === "cas") vi.mocked(f.store.writeRefreshed).mockResolvedValue(false);
      if (mode === "throw") f.refresh.mockRejectedValue(new Error("network failed"));
      await expect(getSquareAccessToken(f.row.connection_id, f.deps)).rejects.toThrow();
      expect(f.store.releaseLease).toHaveBeenCalledWith(f.row.connection_id, 1, null);
      if (mode === "auth" || mode === "merchant") expect(f.store.markNeedsReconnect).toHaveBeenCalled();
    }
  });
  it("bounds lease waits even when the clock is frozen", async () => {
    const f = setup(22);
    vi.mocked(f.store.claimLease).mockResolvedValue(null);
    await expect(getSquareAccessToken(f.row.connection_id, f.deps)).rejects.toThrow("busy");
    expect(f.store.read).toHaveBeenCalledTimes(3);
  });
});
