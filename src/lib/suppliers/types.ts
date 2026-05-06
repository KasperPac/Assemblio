export type Supplier = {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  address: string | null;
  payment_terms: string | null;
  default_currency: string | null;
  default_lead_time_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export type SupplierContact = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  created_at: string;
};

export type SupplierComponent = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  component_id: string;
  supplier_part_number: string | null;
  unit_cost: number | null;
  currency: string | null;
  lead_time_days: number | null;
  moq: number | null;
  is_preferred: boolean;
  notes: string | null;
  created_at: string;
};

export type SupplierComponentPriceBreak = {
  id: string;
  tenant_id: string;
  supplier_component_id: string;
  min_quantity: number;
  unit_cost: number;
  created_at: string;
};

// Lead time status derived from avg actual vs. promised
export type LeadTimeStatus = "on-time" | "late" | "insufficient-data";

// Avg actual lead time for one supplier-component pair
export type AvgLeadTime = {
  componentId: string;
  avgDays: number;
  sampleCount: number;
  status: LeadTimeStatus;
};
