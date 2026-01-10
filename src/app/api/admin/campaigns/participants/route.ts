import { NextRequest, NextResponse } from 'next/server';
import { ensureSuper } from '@/lib/apiGuards';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  // Verificar autenticación y permisos de admin
  const guard = await ensureSuper(request);
  if (guard.kind === 'error') return guard.response;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') as 'eligible' | 'completed' | null;
    const campaignIdsParam = searchParams.get('campaignIds');

    if (!type || !campaignIdsParam) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const campaignIds = campaignIdsParam.split(',').filter(Boolean);
    if (campaignIds.length === 0) {
      return NextResponse.json([]);
    }

    // Construir la consulta base
    let query = supabase
      .from('campaign_progress')
      .select(`
        usuario_id,
        campaign_id,
        status,
        progress,
        usuarios!inner(id, nombre, email, rol),
        campaigns!inner(id, name, slug)
      `)
      .in('campaign_id', campaignIds);

    // Filtrar por tipo
    if (type === 'eligible') {
      query = query.in('status', ['eligible', 'completed']);
    } else if (type === 'completed') {
      query = query.eq('status', 'completed');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching participants:', error);
      return NextResponse.json({ error: 'Error al cargar participantes' }, { status: 500 });
    }

    // Transformar los datos
    const participants = (data || []).map((row: any) => ({
      usuario_id: row.usuario_id,
      nombre: row.usuarios?.nombre || 'Sin nombre',
      email: row.usuarios?.email || 'Sin email',
      rol: row.usuarios?.rol || 'Sin rol',
      campaign_id: row.campaign_id,
      campaign_name: row.campaigns?.name || 'Sin nombre',
      campaign_slug: row.campaigns?.slug || 'sin-slug',
      status: row.status,
      progress: row.progress || 0
    }));

    return NextResponse.json(participants);
  } catch (error) {
    console.error('Error in participants API:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
