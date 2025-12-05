-- Add completed_at column to projects
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add completed_at column to tasks
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
