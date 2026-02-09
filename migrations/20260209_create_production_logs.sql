-- Create production_logs table
CREATE TABLE IF NOT EXISTS public.production_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    order_id UUID REFERENCES public.production_orders(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('TIME', 'MATERIAL')), -- 'TIME' or 'MATERIAL'
    description TEXT NOT NULL, -- Material name or "Trabalho de Solda", etc.
    quantity NUMERIC NOT NULL, -- Hours (for TIME) or Qty (for MATERIAL)
    unit TEXT, -- 'h', 'min', 'kg', 'm', 'un', etc.
    unit_cost NUMERIC DEFAULT 0, -- Cost per unit
    total_cost NUMERIC DEFAULT 0, -- quantity * unit_cost
    is_waste BOOLEAN DEFAULT FALSE, -- If true, it's considered waste/loss
    user_id UUID REFERENCES auth.users(id) -- Who logged this
);

-- RLS Policies
ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON public.production_logs
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON public.production_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON public.production_logs
    FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON public.production_logs
    FOR DELETE
    TO authenticated
    USING (true);
