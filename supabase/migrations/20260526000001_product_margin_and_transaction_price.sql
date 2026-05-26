ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS margin_pct numeric DEFAULT 0;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS price_sold numeric DEFAULT 0;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS margin_retained numeric DEFAULT 0;
