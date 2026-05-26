ALTER TABLE payments ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff(id);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS commission_pct numeric DEFAULT 0;
