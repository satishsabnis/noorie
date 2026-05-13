ALTER TABLE public.competitor_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read own salon competitor reports"
  ON public.competitor_reports FOR SELECT
  USING (
    salon_id = (
      SELECT salon_id FROM staff
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "Staff insert own salon competitor reports"
  ON public.competitor_reports FOR INSERT
  WITH CHECK (
    salon_id = (
      SELECT salon_id FROM staff
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
  );
