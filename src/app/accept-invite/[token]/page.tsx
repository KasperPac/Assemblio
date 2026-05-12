import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AcceptForm from "./accept-form";
import styles from "./accept-invite.module.css";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface InvitationData {
  id: string;
  tenant_id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
  accepted_at: string | null;
  token: string;
  tenant: { name: string } | { name: string }[] | null;
}

function readTenantName(
  rel: InvitationData["tenant"]
): string {
  if (!rel) return "this workspace";
  if (Array.isArray(rel)) return rel[0]?.name ?? "this workspace";
  return rel.name ?? "this workspace";
}

function ErrorShell({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{message}</p>
        <Link href="/login" className={styles.linkBtn}>
          Go to sign in →
        </Link>
      </div>
    </main>
  );
}

export default async function AcceptInvitePage({ params }: PageProps) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: inv } = await admin
    .from("tenant_invitation")
    .select(
      "id, tenant_id, email, role, expires_at, accepted_at, token, tenant:tenant_id(name)"
    )
    .eq("token", token)
    .maybeSingle();

  if (!inv) {
    return (
      <ErrorShell
        title="Invitation not found"
        message="This invitation link is invalid. Ask your admin to send a new one."
      />
    );
  }
  if (inv.accepted_at) {
    return (
      <ErrorShell
        title="Already accepted"
        message="This invitation has already been used. Sign in to access the workspace."
      />
    );
  }
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return (
      <ErrorShell
        title="Invitation expired"
        message="This invitation has expired. Ask your admin to send a new one."
      />
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  // Look up whether an auth user already exists for this email.
  const { data: usersList } = await admin.auth.admin.listUsers();
  const existingUser =
    usersList?.users.find(
      (u) => u.email?.toLowerCase() === (inv as InvitationData).email.toLowerCase()
    ) ?? null;

  const tenantName = readTenantName((inv as InvitationData).tenant);
  const invitation = inv as InvitationData;

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>
          Join <span className={styles.tenantName}>{tenantName}</span> on Manuva
        </h1>
        <p className={styles.subtitle}>
          You&apos;ve been invited as <strong>{invitation.role}</strong>. This
          invite is for <strong>{invitation.email}</strong>.
        </p>

        <AcceptForm
          token={token}
          email={invitation.email}
          mode={existingUser ? "existing" : "new"}
          alreadySignedIn={
            currentUser?.id === existingUser?.id && Boolean(existingUser)
          }
        />
      </div>
    </main>
  );
}
