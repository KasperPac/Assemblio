-- Add soft-delete support to components
ALTER TABLE public.component
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
