ALTER TABLE public.salon_config
  ADD COLUMN IF NOT EXISTS fy_start_month int DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS supervisor_view_financials boolean DEFAULT false;
