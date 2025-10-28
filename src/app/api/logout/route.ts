import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logAccion } from '@/lib/logger';
import { SESSION_COOKIE_NAME } from '@/lib/sessionExpiration';

// Derivar projectRef sin hardcode: 1) SUPABASE_PROJECT_REF explícito 2) parse de NEXT_PUBLIC_SUPABASE_URL 3) fallback simbólico
const projectRef = process.env.SUPABASE_PROJECT_REF
  || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https:\/\//,'').split('.')[0]
  || 'missing_project_ref';
if (projectRef === 'missing_project_ref') {
  // No lanzamos error para no romper logout; sólo avisamos en build/runtime server
  console.warn('[logout] SUPABASE_PROJECT_REF no definido; usando fallback (puede impedir limpiar cookies correctamente)');
}

async function performLogout() {
  const cookieStore = await cookies();
  const prefix = `sb-${projectRef}-auth-token`;
  const namesToClear = new Set<string>(['sb-access-token', 'sb-refresh-token', SESSION_COOKIE_NAME]);
  for (const c of cookieStore.getAll()) {
    if (c.name === prefix || c.name.startsWith(prefix + '.')) namesToClear.add(c.name);
    // Supabase helpers generan variantes adicionales con sufijos -user / -code-verifier
    if (c.name.startsWith(prefix + '-')) namesToClear.add(c.name);
  }
  const expired = { path: '/', expires: new Date(0) } as const;
  namesToClear.forEach(name => cookieStore.set(name, '', expired));
}

export async function GET() {
  await performLogout();
  logAccion('logout_ok');
  return NextResponse.json({ message: 'Sesión cerrada' });
}

export async function POST() {
  await performLogout();
  logAccion('logout_ok');
  return NextResponse.json({ message: 'Sesión cerrada' });
}
