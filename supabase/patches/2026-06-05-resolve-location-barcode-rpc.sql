-- Mobile scanner: look up any location entity by its 6-char short code.
-- Short code = last 6 chars of UUID with hyphens stripped, uppercased.
-- Encodes: upper(right(replace(id::text, '-', ''), 6))
-- Used by resolve_location_barcode server action in /app/scan.
--
-- Uses current_tenant_id() (profiles table lookup) rather than auth.jwt()
-- so that super-admin "view as" and stale JWTs are handled correctly.

CREATE OR REPLACE FUNCTION resolve_location_barcode(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT public.current_tenant_id() AS id
  ),
  matches AS (
    SELECT
      'bay'                        AS type,
      b.id::text                   AS id,
      b.name,
      a.warehouse_id::text         AS warehouse_id,
      concat_ws(' · ', l.name, sl.name, a.name, b.name) AS path
    FROM   bin_bay b
    JOIN   bin_aisle a ON a.id = b.aisle_id
    JOIN   location l  ON l.id = a.warehouse_id
    LEFT JOIN bin_sub_location sl ON sl.id = a.sub_location_id
    WHERE  upper(right(replace(b.id::text, '-', ''), 6)) = upper(p_code)
      AND  b.tenant_id = (SELECT id FROM t)

    UNION ALL

    SELECT
      'aisle'                      AS type,
      a.id::text                   AS id,
      a.name,
      a.warehouse_id::text         AS warehouse_id,
      concat_ws(' · ', l.name, sl.name, a.name) AS path
    FROM   bin_aisle a
    JOIN   location l ON l.id = a.warehouse_id
    LEFT JOIN bin_sub_location sl ON sl.id = a.sub_location_id
    WHERE  upper(right(replace(a.id::text, '-', ''), 6)) = upper(p_code)
      AND  a.tenant_id = (SELECT id FROM t)

    UNION ALL

    SELECT
      'sub_location'               AS type,
      sl.id::text                  AS id,
      sl.name,
      sl.warehouse_id::text        AS warehouse_id,
      concat_ws(' · ', l.name, sl.name) AS path
    FROM   bin_sub_location sl
    JOIN   location l ON l.id = sl.warehouse_id
    WHERE  upper(right(replace(sl.id::text, '-', ''), 6)) = upper(p_code)
      AND  sl.tenant_id = (SELECT id FROM t)

    UNION ALL

    SELECT
      'warehouse'                  AS type,
      loc.id::text                 AS id,
      loc.name,
      loc.id::text                 AS warehouse_id,
      loc.name                     AS path
    FROM   location loc
    WHERE  upper(right(replace(loc.id::text, '-', ''), 6)) = upper(p_code)
      AND  loc.tenant_id = (SELECT id FROM t)
  )
  SELECT row_to_json(m)::jsonb FROM matches m LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resolve_location_barcode(text) TO authenticated;
