export interface InvitationEmailProps {
  inviterName: string;
  tenantName: string;
  acceptUrl: string;
}

export function InvitationEmail({
  inviterName,
  tenantName,
  acceptUrl,
}: InvitationEmailProps) {
  return (
    <div style={wrapper}>
      <h1 style={h1}>You&apos;re invited to {tenantName} on Manuva</h1>
      <p style={p}>
        <strong>{inviterName}</strong> has invited you to join their team on
        Manuva — the operations workspace for manufacturers.
      </p>
      <p style={p}>
        Click the button below to accept the invite and create your account.
      </p>
      <p style={{ margin: "32px 0" }}>
        <a href={acceptUrl} style={button}>
          Accept invitation →
        </a>
      </p>
      <p style={small}>
        If the button doesn&apos;t work, copy and paste this link into your
        browser:
        <br />
        <span style={{ wordBreak: "break-all" }}>{acceptUrl}</span>
      </p>
      <p style={small}>
        This invite expires in 7 days. If you weren&apos;t expecting it, you can
        safely ignore this email.
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
  margin: "0 0 10px",
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
