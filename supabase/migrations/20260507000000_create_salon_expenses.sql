-- Create salon_expenses table
CREATE TABLE public.salon_expenses (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id    uuid          NOT NULL REFERENCES public.salons(id),
  category    text          NOT NULL CHECK (category IN ('fixed', 'variable', 'one_time')),
  name        text          NOT NULL,
  amount      numeric       NOT NULL,
  month       integer       NOT NULL CHECK (month BETWEEN 1 AND 12),
  year        integer       NOT NULL,
  created_at  timestamptz   DEFAULT now(),
  updated_at  timestamptz   DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.salon_expenses ENABLE ROW LEVEL SECURITY;

-- SELECT: any staff member belonging to the salon
CREATE POLICY "salon staff can read expenses"
  ON public.salon_expenses FOR SELECT
  USING (
    salon_id IN (
      SELECT staff.salon_id FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
    )
  );

-- INSERT: any staff member belonging to the salon
CREATE POLICY "salon staff can insert expenses"
  ON public.salon_expenses FOR INSERT
  WITH CHECK (
    salon_id IN (
      SELECT staff.salon_id FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
    )
  );

-- UPDATE: any staff member belonging to the salon
CREATE POLICY "salon staff can update expenses"
  ON public.salon_expenses FOR UPDATE
  USING (
    salon_id IN (
      SELECT staff.salon_id FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
    )
  );

-- DELETE: any staff member belonging to the salon
CREATE POLICY "salon staff can delete expenses"
  ON public.salon_expenses FOR DELETE
  USING (
    salon_id IN (
      SELECT staff.salon_id FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
    )
  );
