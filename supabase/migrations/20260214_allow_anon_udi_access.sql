-- Permitir acceso público (anónimo) de LECTURA a valores UDI
-- Los valores UDI son datos públicos del Banco de México que deben
-- ser accesibles desde la landing page sin autenticación

-- Política: usuarios anónimos pueden leer valores UDI
CREATE POLICY "udi_values_select_anon" ON public.udi_values
  FOR SELECT
  TO anon
  USING (true);

-- Comentario
COMMENT ON POLICY "udi_values_select_anon" ON public.udi_values 
IS 'Permite acceso de lectura anónimo a valores UDI (datos públicos de Banxico)';
