// Helper para obtener el usuario autenticado desde el header
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function getCurrentUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null

  const token = authHeader.replace('Bearer ', '')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) return null
  
  return user
}
