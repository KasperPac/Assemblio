import { Heading, Text } from "@react-email/components";
import { EmailShell } from "../components/email-shell";
import { BrandButton } from "../components/brand-button";
import { COLOR, FONT } from "../components/tokens";

export interface InvitationEmailProps {
  inviterName: string;
  tenantName: string;
  role: "admin" | "member";
  acceptUrl: string;
  logoBaseUrl: string;
}

function roleWithArticle(role: "admin" | "member"): string {
  return role === "admin" ? "an admin" : "a member";
}

export function InvitationEmail({
  inviterName,
  tenantName,
  role,
  acceptUrl,
  logoBaseUrl,
}: InvitationEmailProps) {
  return (
    <EmailShell logoBaseUrl={logoBaseUrl}>
      <Heading
        as="h1"
        style={{
          fontFamily: FONT.body,
          fontSize: 22,
          fontWeight: 700,
          color: COLOR.inkStrong,
          margin: "0 0 16px",
          lineHeight: 1.25,
        }}
      >
        You&apos;re invited to join {tenantName}
      </Heading>

      <Text
        style={{
          fontFamily: FONT.body,
          fontSize: 15,
          color: COLOR.inkStrong,
          margin: "0 0 14px",
          lineHeight: 1.55,
        }}
      >
        <strong>{inviterName}</strong> invited you to join{" "}
        <strong>{tenantName}</strong> on Manuva as {roleWithArticle(role)}.
      </Text>

      <Text
        style={{
          fontFamily: FONT.body,
          fontSize: 15,
          color: COLOR.inkStrong,
          margin: "0 0 24px",
          lineHeight: 1.55,
        }}
      >
        Manuva is the operations workspace for manufacturers — inventory,
        BOMs, production, and purchasing in one place.
      </Text>

      <div style={{ margin: "0 0 28px" }}>
        <BrandButton href={acceptUrl}>Accept invitation →</BrandButton>
      </div>

      <Text
        style={{
          fontFamily: FONT.body,
          fontSize: 12,
          color: COLOR.inkMuted,
          margin: "0 0 8px",
          lineHeight: 1.55,
        }}
      >
        This invite expires in 7 days. If the button doesn&apos;t work, paste
        this link into your browser:
      </Text>
      <Text
        style={{
          fontFamily: FONT.body,
          fontSize: 12,
          color: COLOR.inkMuted,
          margin: 0,
          lineHeight: 1.55,
          wordBreak: "break-all",
        }}
      >
        {acceptUrl}
      </Text>
    </EmailShell>
  );
}
