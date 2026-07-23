CREATE POLICY "Temporary dev update" ON public.wallets FOR UPDATE TO authenticated USING (true);
