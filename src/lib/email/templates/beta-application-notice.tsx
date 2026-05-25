export interface BetaApplicationNoticeProps {
  fullName: string;
  email: string;
  companyName: string;
  teamSize?: string | null;
  useCase?: string | null;
  applicationId: string;
}

export function BetaApplicationNotice({
  fullName,
  email,
  companyName,
  teamSize,
  useCase,
  applicationId,
}: BetaApplicationNoticeProps) {
  return (
    <div style={wrapper}>
      <h1 style={h1}>New beta application</h1>
      <p style={p}>
        Someone has applied for early access to Manuva.
      </p>
      <table style={table} cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td style={tdLabel}>Name</td>
            <td style={tdValue}>{fullName}</td>
          </tr>
          <tr>
            <td style={tdLabel}>Email</td>
            <td style={tdValue}>{email}</td>
          </tr>
          <tr>
            <td style={tdLabel}>Company</td>
            <td style={tdValue}>{companyName}</td>
          </tr>
          {teamSize ? (
            <tr>
              <td style={tdLabel}>Team size</td>
              <td style={tdValue}>{teamSize}</td>
            </tr>
          ) : null}
          {useCase ? (
            <tr>
              <td style={tdLabel}>Use case</td>
              <td style={tdValueMultiline}>{useCase}</td>
            </tr>
          ) : null}
          <tr>
            <td style={tdLabel}>App ID</td>
            <td style={tdValueMono}>{applicationId}</td>
          </tr>
        </tbody>
      </table>
      <p style={small}>
        Approve in Supabase by setting <code>status=&apos;approved&apos;</code> and{" "}
        <code>signup_token</code> to a new uuid, then send the applicant a link to{" "}
        <code>/signup?token=…</code>.
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
  margin: "0 0 16px",
  fontWeight: 600,
  letterSpacing: "-0.01em",
};

const p: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 15,
};

const small: React.CSSProperties = {
  margin: "24px 0 0",
  fontSize: 13,
  color: "#475569",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 8,
};

const tdLabel: React.CSSProperties = {
  padding: "10px 12px 10px 0",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#64748B",
  width: 110,
  verticalAlign: "top",
  borderBottom: "1px solid #E2E8F0",
};

const tdValue: React.CSSProperties = {
  padding: "10px 0",
  fontSize: 14,
  color: "#0F172A",
  borderBottom: "1px solid #E2E8F0",
};

const tdValueMultiline: React.CSSProperties = {
  ...tdValue,
  whiteSpace: "pre-wrap",
};

const tdValueMono: React.CSSProperties = {
  ...tdValue,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  color: "#475569",
};
