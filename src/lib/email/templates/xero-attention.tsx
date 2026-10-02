export interface XeroAttentionProps {
  tenantName: string;
  orgName: string;
  kind: "reconnect" | "failed";
  problemCount: number;
  settingsUrl: string;
}

export function XeroAttention({ tenantName, orgName, kind, problemCount, settingsUrl }: XeroAttentionProps) {
  return (
    <div style={wrapper}>
      <h1 style={h1}>{kind === "reconnect" ? "Xero needs reconnecting" : "Some bills didn’t reach Xero"}</h1>
      <p style={p}>
        {kind === "reconnect" ? (
          <>Manuva can no longer post to <strong>{orgName}</strong> for <strong>{tenantName}</strong>. Bills are paused, and nothing is lost: they send as soon as an admin reconnects.</>
        ) : (
          <>{problemCount} item{problemCount === 1 ? "" : "s"} for <strong>{tenantName}</strong> couldn&apos;t be sent to <strong>{orgName}</strong>. Each one says what to fix.</>
        )}
      </p>
      <p style={{ margin: "28px 0" }}>
        <a href={settingsUrl} style={button}>Open Integrations →</a>
      </p>
      <p style={small}>You&apos;re receiving this because you connected Xero to Manuva. We send at most one of these a day.</p>
    </div>
  );
}

const wrapper: React.CSSProperties = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  maxWidth: 560, margin: "0 auto", padding: "32px 20px", color: "#0F172A", lineHeight: 1.55,
};
const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, margin: "0 0 16px" };
const p: React.CSSProperties = { fontSize: 15, margin: "0 0 14px" };
const button: React.CSSProperties = { display: "inline-block", padding: "10px 18px", background: "#6366F1", color: "#FFFFFF", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 15 };
const small: React.CSSProperties = { fontSize: 12, color: "#475569", margin: 0 };
