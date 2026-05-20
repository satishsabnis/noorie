ALTER TABLE clients ADD COLUMN IF NOT EXISTS pin_changed boolean DEFAULT false;
