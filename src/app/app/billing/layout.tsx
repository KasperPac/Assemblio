import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Bypasses the app-shell chrome; src/app/app/layout.tsx short-circuits for
// /app/billing/* so the paywall and past-due pages render without sidebar.
export default async function BillingLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <div data-billing-shell>{children}</div>;
}
