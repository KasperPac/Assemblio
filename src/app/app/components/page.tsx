import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./components.module.css";
import ComponentCreateForm from "./component-create-form";
import { createComponent } from "./actions";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";

type ComponentRow = {
  id: string;
  name: string;
  sku: string | null;
  reorder_point: number | null;
};

type BalanceRow = {
  component_id: string;
  on_hand: number;
  in_prod: number;
};

type Props = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function ComponentsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim().toLowerCase();
  const supabase = await createSupabaseServerClient();

  const [
    { data: components, error },
    { data: balances },
    { data: suppliers },
    { data: locations },
    { data: groups },
  ] = await Promise.all([
    supabase.from("component").select("id,name,sku,reorder_point").order("name"),
    supabase.from("inventory_balance").select("component_id,on_hand,in_prod"),
    supabase.from("suppliers").select("id,name").order("name"),
    supabase.from("location").select("id,name").order("name"),
    supabase.from("component_group").select("id,name").order("name"),
  ]);

  const balanceMap = (balances ?? []).reduce<Record<string, BalanceRow>>((acc, row) => {
    acc[row.component_id] = row;
    return acc;
  }, {});

  const allComponents = (components ?? []) as ComponentRow[];
  const filtered =
    q.length > 0
      ? allComponents.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.sku ?? "").toLowerCase().includes(q)
        )
      : allComponents;

  const lookups = {
    suppliers: (suppliers ?? []) as Array<{ id: string; name: string }>,
    locations: (locations ?? []) as Array<{ id: string; name: string }>,
    groups: (groups ?? []) as Array<{ id: string; name: string }>,
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Components"
        title="Component catalog"
        description={`${filtered.length} of ${allComponents.length} components in the current catalog.`}
        actions={<ComponentCreateForm action={createComponent} lookups={lookups} />}
      />

      <form className={styles.filters} method="get">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search by name or SKU"
          aria-label="Search by name or SKU"
        />
      </form>

      <ListPanel
        eyebrow="Catalog"
        title="Stocked components"
        description="Open a component to inspect balances, movement history, and BOM usage."
        columns={["Component", "SKU", "On hand", "In prod", "Reorder"]}
        columnsTemplate="1.6fr 1fr 0.8fr 0.8fr 0.8fr"
      >
        {error ? (
          <EmptyState
            title="Failed to load components"
            message="The component catalog could not be loaded from Supabase."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={q.length > 0 ? "No matching components" : "No components yet"}
            message={
              q.length > 0
                ? "Try a broader search term or clear the filter."
                : "Create a component to start tracking stocked parts."
            }
          />
        ) : (
          filtered.map((component) => {
            const balance = balanceMap[component.id];
            return (
              <Link
                key={component.id}
                href={`/app/components/${component.id}`}
                className={styles.rowLink}
              >
                <ListRow
                  columnsTemplate="1.6fr 1fr 0.8fr 0.8fr 0.8fr"
                  className={styles.row}
                >
                  <strong>{component.name}</strong>
                  <span className={styles.meta}>{component.sku ?? "--"}</span>
                  <span>{balance?.on_hand ?? 0}</span>
                  <span>{balance?.in_prod ?? 0}</span>
                  <span>{component.reorder_point ?? 0}</span>
                </ListRow>
              </Link>
            );
          })
        )}
      </ListPanel>
    </div>
  );
}
