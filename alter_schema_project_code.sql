-- Add code column to projects
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS code VARCHAR(50);
