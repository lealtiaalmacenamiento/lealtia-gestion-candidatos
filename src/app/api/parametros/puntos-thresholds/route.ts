import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getServiceClient();
    
    const { data, error } = await supabase
      .from('puntos_thresholds')
      .select('*')
      .order('tipo_producto', { ascending: true })
      .order('orden', { ascending: true });
    
    if (error) throw error;
    
    return NextResponse.json(
      { success: true, data: data || [] },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  } catch (error) {
    console.error('GET /api/parametros/puntos-thresholds error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getServiceClient();
    
    const { data, error } = await supabase
      .from('puntos_thresholds')
      .insert([body])
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(
      { success: true, data },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  } catch (error) {
    console.error('POST /api/parametros/puntos-thresholds error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID requerido' },
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    
    const supabase = getServiceClient();
    
    const { data, error } = await supabase
      .from('puntos_thresholds')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(
      { success: true, data },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  } catch (error) {
    console.error('PATCH /api/parametros/puntos-thresholds error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID requerido' },
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    
    const supabase = getServiceClient();
    
    const { error } = await supabase
      .from('puntos_thresholds')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    return NextResponse.json(
      { success: true },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  } catch (error) {
    console.error('DELETE /api/parametros/puntos-thresholds error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}
