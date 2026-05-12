import { notFound } from "next/navigation";
import { InvitationEmail } from "@/lib/email/templates/invitation";

export default function InvitationPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <InvitationEmail
      inviterName="Kasper Simonsen"
      tenantName="Acme Industries"
      role="member"
      acceptUrl={`${baseUrl}/accept-invite/preview-token`}
      logoBaseUrl={baseUrl}
    />
  );
}
