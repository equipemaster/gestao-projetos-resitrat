-- Enable RLS on all main tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable all access for projects" ON public.projects;
DROP POLICY IF EXISTS "Enable all access for tasks" ON public.tasks;
DROP POLICY IF EXISTS "Enable all access for users" ON public.users;
DROP POLICY IF EXISTS "Enable all access for activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "Enable all access for project_items" ON public.project_items;

-- Re-create permissive policies for ALL operations
CREATE POLICY "Enable all access for projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for tasks" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for activity_log" ON public.activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for project_items" ON public.project_items FOR ALL USING (true) WITH CHECK (true);
