ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS reference_number int;

CREATE OR REPLACE FUNCTION generate_appointment_reference()
RETURNS TRIGGER AS $$
BEGIN
  NEW.reference_number := (
    SELECT COALESCE(MAX(reference_number), 0) + 1
    FROM public.appointments
    WHERE salon_id = NEW.salon_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointment_reference_trigger
  BEFORE INSERT ON public.appointments
  FOR EACH ROW
  WHEN (NEW.reference_number IS NULL)
  EXECUTE FUNCTION generate_appointment_reference();
