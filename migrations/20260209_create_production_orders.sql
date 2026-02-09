-- Create production_orders table
CREATE TABLE IF NOT EXISTS public.production_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    project_id UUID REFERENCES public.projects(id),
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'Medium', -- Low, Medium, High, Urgent
    status TEXT DEFAULT 'Planning', -- Planning, Cutting, Welding, Assembly, Finishing, Quality Control, Completed
    due_date DATE,
    assigned_to UUID REFERENCES auth.users(id),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;

-- Create policies (Adjust based on your actual security requirements)
-- distinct policies for select, insert, update, delete usually better but for now allowing authenticated users to do everything
CREATE POLICY "Allow authenticated full access" ON public.production_orders
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create specific bucket for production if needed, or just use existing logic
