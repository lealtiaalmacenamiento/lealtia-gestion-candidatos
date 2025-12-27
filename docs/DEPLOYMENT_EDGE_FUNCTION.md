# Deployment de Edge Function - Fase 6

## Pasos para completar el deployment

### 1. Instalar Supabase CLI

Elige el método según tu SO:
- **Windows**: `scoop install supabase`
- **macOS**: `brew install supabase/tap/supabase`
- **Linux**: https://github.com/supabase/cli#install-the-cli

### 2. Login en Supabase

```bash
supabase login
```

### 3. Link al proyecto

```bash
supabase link --project-ref wqutrjnxvcgmyyiyjmsd
```

### 4. Configurar el secret

```bash
supabase secrets set CRON_SECRET=Trotamundos100$
```

### 5. Deploy de la Edge Function

```bash
supabase functions deploy actualizar-pagos-vencidos
```

### 6. Verificar deployment (PowerShell)

```powershell
$headers = @{
    "Authorization" = "Bearer Trotamundos100$"
    "Content-Type" = "application/json"
}
Invoke-RestMethod -Uri "https://wqutrjnxvcgmyyiyjmsd.supabase.co/functions/v1/actualizar-pagos-vencidos" -Method POST -Headers $headers
```

### 7. GitHub Secrets (ya configurados)

- ✅ `REPORTES_CRON_SECRET` = `Trotamundos100$`
- ✅ `SUPABASE_URL` = `https://wqutrjnxvcgmyyiyjmsd.supabase.co`

### 8. Habilitar Realtime

✅ **Ya está habilitado en la tabla `notificaciones`**

---

## Verificación Final

Estado actual:

1. **Base de datos**: ✅ Migraciones ejecutadas
2. **Edge Function**: ⏳ **PENDIENTE DEPLOYMENT** (pasos 1-6 arriba)
3. **GitHub Actions**: ✅ Workflow creado
4. **Frontend**: ✅ Componentes integrados
5. **Realtime**: ✅ **Ya habilitado**

## Documentación completa

Ver: `docs/FASE6_IMPLEMENTACION_COMPLETA.md`
