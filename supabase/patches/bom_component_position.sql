-- Add position column for manual ordering of BOM components
ALTER TABLE product_bom_component
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- Backfill: assign position by created_at ascending within each BOM
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY product_bom_id ORDER BY created_at) AS rn
  FROM product_bom_component
)
UPDATE product_bom_component
SET position = ranked.rn
FROM ranked
WHERE product_bom_component.id = ranked.id;
