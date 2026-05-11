export interface TrialExpiredProps {
  tenantName: string;
  paywallUrl: string;
}

export function TrialExpired({ tenantName, paywallUrl }: TrialExpiredProps) {
  return (
    <div style={wrapper}>
      <h1 style={h1}>Your Manuva trial has ended</h1>
      <p style={p}>
        The free trial for <strong>{tenantName}</strong> has ended. Your data
        is safe — pick a plan to pick up where you left off.
      </p>
      <p style={{ margin: "28px 0" }}>
        <a href={paywallUrl} style={button}>
          Reactivate your workspace →
        </a>
      </p>
      <p style={small}>
        Not sure which plan? Reply to this email and we&apos;ll help you choose.
      </p>
    </div>
  );
}

const wrapper: React.CSSProperties = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  maxWidth: 560,
  margin: "0 auto",
  padding: "32px 20px",
  color: "#0F172A",
  lineHeight: 1.55,
};

const h1: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  margin: "0 0 16px",
};

const p: React.CSSProperties = {
  fontSize: 15,
  margin: "0 0 14px",
};

const small: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  margin: 0,
};

const button: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px",
  background: "#6366F1",
  color: "#FFFFFF",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 15,
};
