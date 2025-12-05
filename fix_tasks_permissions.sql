-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON public.tasks;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.tasks;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.tasks;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.tasks;

-- Create permissive policies
CREATE POLICY "Enable read access for all users" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.tasks FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.tasks FOR DELETE USING (true);
