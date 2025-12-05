-- Create table for Project Items
CREATE TABLE public.project_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit TEXT DEFAULT 'un'
);

-- RLS Policies
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.project_items FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.project_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.project_items FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.project_items FOR DELETE USING (true);
