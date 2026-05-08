import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WidgetId } from "@/lib/dashboard/types";
import { OpenOrdersQueue } from "./widgets/open-orders-queue";
import { OnTimeFulfillment } from "./widgets/on-time-fulfillment";
import { ProductionThroughput } from "./widgets/production-throughput";
import { PurchasingSignals } from "./widgets/purchasing-signals";
import { OrderTrendChartWidget } from "./widgets/order-trend-chart";
import { InventoryValueSnapshot } from "./widgets/inventory-value-snapshot";
import { LowStockAlerts } from "./widgets/low-stock-alerts";
import { InventoryTurnover } from "./widgets/inventory-turnover";
import { DaysInventoryRemaining } from "./widgets/days-inventory-remaining";
import { TopProductsDemand } from "./widgets/top-products-demand";
import { BomHealth } from "./widgets/bom-health";
import { QuickActions } from "./widgets/quick-actions";
import {
  RevenueTrendWidget,
  GrossMarginWidget,
  AvgOrderValueWidget,
  GmroiWidget,
  SellThroughRateWidget,
} from "./widgets/finance-gated";

type Ctx = { supabase: SupabaseClient; tenantId: string };

export function renderWidget(id: WidgetId, ctx: Ctx): ReactNode {
  switch (id) {
    case "open-orders-queue":
      return <OpenOrdersQueue {...ctx} />;
    case "on-time-fulfillment":
      return <OnTimeFulfillment {...ctx} />;
    case "production-throughput":
      return <ProductionThroughput {...ctx} />;
    case "purchasing-signals":
      return <PurchasingSignals {...ctx} />;
    case "order-trend-chart":
      return <OrderTrendChartWidget {...ctx} />;
    case "inventory-value-snapshot":
      return <InventoryValueSnapshot {...ctx} />;
    case "low-stock-alerts":
      return <LowStockAlerts {...ctx} />;
    case "inventory-turnover":
      return <InventoryTurnover {...ctx} />;
    case "days-inventory-remaining":
      return <DaysInventoryRemaining {...ctx} />;
    case "top-products-demand":
      return <TopProductsDemand {...ctx} />;
    case "bom-health":
      return <BomHealth {...ctx} />;
    case "quick-actions":
      return <QuickActions {...ctx} />;
    case "revenue-trend":
      return <RevenueTrendWidget />;
    case "gross-margin":
      return <GrossMarginWidget />;
    case "avg-order-value":
      return <AvgOrderValueWidget />;
    case "gmroi":
      return <GmroiWidget />;
    case "sell-through-rate":
      return <SellThroughRateWidget />;
  }
}
