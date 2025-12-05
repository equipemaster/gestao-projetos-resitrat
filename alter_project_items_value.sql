-- Add value column to project_items
ALTER TABLE public.project_items 
ADD COLUMN value NUMERIC(10,2) DEFAULT 0.00;
