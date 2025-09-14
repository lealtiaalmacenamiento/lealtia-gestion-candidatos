-- Simple RPC-exponible wrapper para is_super_role() para debugging desde el front
CREATE OR REPLACE FUNCTION public.is_super_role_wrapper()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_super_role();
$$;

GRANT EXECUTE ON FUNCTION public.is_super_role_wrapper() TO authenticated, service_role;
