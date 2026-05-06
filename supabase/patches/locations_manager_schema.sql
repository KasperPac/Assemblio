-- supabase/patches/locations_manager_schema.sql

-- bin_sub_location: sub-areas within a warehouse (e.g. Mezzanine)
CREATE TABLE IF NOT EXISTS bin_sub_location (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  warehouse_id  UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, warehouse_id, name)
);
ALTER TABLE bin_sub_location ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_iso" ON bin_sub_location
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- bin_aisle: aisles within a warehouse, optionally tagged to a sub-location
CREATE TABLE IF NOT EXISTS bin_aisle (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  warehouse_id     UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
  sub_location_id  UUID REFERENCES bin_sub_location(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, warehouse_id, name)
);
ALTER TABLE bin_aisle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_iso" ON bin_aisle
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- bin_bay: bays within an aisle
CREATE TABLE IF NOT EXISTS bin_bay (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  aisle_id   UUID NOT NULL REFERENCES bin_aisle(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, aisle_id, name)
);
ALTER TABLE bin_bay ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_iso" ON bin_bay
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Migrate component table: drop old text fields, add FK references
ALTER TABLE component
  DROP COLUMN IF EXISTS bin_sub_location,
  DROP COLUMN IF EXISTS bin_row,
  DROP COLUMN IF EXISTS bin_bay;

ALTER TABLE component
  ADD COLUMN IF NOT EXISTS bin_sub_location_id UUID REFERENCES bin_sub_location(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bin_aisle_id        UUID REFERENCES bin_aisle(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bin_bay_id          UUID REFERENCES bin_bay(id) ON DELETE SET NULL;
