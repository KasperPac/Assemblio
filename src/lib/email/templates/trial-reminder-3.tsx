export interface TrialReminder3Props {
  tenantName: string;
  paywallUrl: string;
}

export function TrialReminder3({
  tenantName,
  paywallUrl,
}: TrialReminder3Props) {
  return (
    <div style={wrapper}>
      <h1 style={h1}>3 days left in your Manuva trial</h1>
      <p style={p}>
        Your free trial for <strong>{tenantName}</strong> ends in 3 days. Add a
        payment method to keep your workspace running without interruption.
      </p>
      <p style={{ margin: "28px 0" }}>
        <a href={paywallUrl} style={button}>
          Choose a plan →
        </a>
      </p>
      <p style={small}>
        Questions? Reply to this email and we&apos;ll help you pick the right
        plan.
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
