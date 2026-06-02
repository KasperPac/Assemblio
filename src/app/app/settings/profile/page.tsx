import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) redirect("/app/auth/login");

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="Profile"
        description="Your display name and account security."
      />
      <ProfileForm
        fullName={profile?.full_name ?? null}
        avatarUrl={profile?.avatar_url ?? null}
        email={user.email ?? ""}
        role={ctx.role}
      />
    </>
  );
}
