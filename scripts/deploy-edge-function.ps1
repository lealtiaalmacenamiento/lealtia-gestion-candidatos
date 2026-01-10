# Script: Configurar Edge Function en Supabase
# Manual de deployment de la Edge Function actualizar-pagos-vencidos

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Fase 6: Configuración de Edge Function" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 Pasos para completar el deployment:" -ForegroundColor Yellow
Write-Host ""

Write-Host "1. Instalar Supabase CLI (si no lo tienes):" -ForegroundColor White
Write-Host "   https://github.com/supabase/cli#install-the-cli" -ForegroundColor Gray
Write-Host "   - Windows: scoop install supabase" -ForegroundColor Gray
Write-Host "   - macOS: brew install supabase/tap/supabase" -ForegroundColor Gray
Write-Host "   - Linux: consulta documentación" -ForegroundColor Gray
Write-Host ""

Write-Host "2. Hacer login en Supabase:" -ForegroundColor White
Write-Host "   supabase login" -ForegroundColor Gray
Write-Host ""

Write-Host "3. Link al proyecto:" -ForegroundColor White
Write-Host "   supabase link --project-ref wqutrjnxvcgmyyiyjmsd" -ForegroundColor Gray
Write-Host ""

Write-Host "4. Configurar el secret:" -ForegroundColor White
Write-Host "   supabase secrets set CRON_SECRET=Trotamundos100$" -ForegroundColor Gray
Write-Host ""

Write-Host "5. Deploy de la Edge Function:" -ForegroundColor White
Write-Host "   supabase functions deploy actualizar-pagos-vencidos" -ForegroundColor Gray
Write-Host ""

Write-Host "6. Verificar deployment:" -ForegroundColor White
Write-Host '   $headers = @{' -ForegroundColor Gray
Write-Host '       "Authorization" = "Bearer Trotamundos100$"' -ForegroundColor Gray
Write-Host '       "Content-Type" = "application/json"' -ForegroundColor Gray
Write-Host '   }' -ForegroundColor Gray
Write-Host '   Invoke-RestMethod -Uri "https://wqutrjnxvcgmyyiyjmsd.supabase.co/functions/v1/actualizar-pagos-vencidos" -Method POST -Headers $headers' -ForegroundColor Gray
Write-Host ""

Write-Host "7. Verificar GitHub Secrets (ya configurados):" -ForegroundColor White
Write-Host "   - REPORTES_CRON_SECRET = Trotamundos100$ ✓" -ForegroundColor Green
Write-Host "   - SUPABASE_URL = https://wqutrjnxvcgmyyiyjmsd.supabase.co ✓" -ForegroundColor Green
Write-Host ""

Write-Host "8. Habilitar Realtime en Supabase Dashboard:" -ForegroundColor White
Write-Host "   - Ir a: https://supabase.com/dashboard/project/wqutrjnxvcgmyyiyjmsd" -ForegroundColor Gray
Write-Host "   - Database -> Replication" -ForegroundColor Gray
Write-Host "   - Buscar tabla notificaciones" -ForegroundColor Gray
Write-Host "   - Activar el toggle de Realtime" -ForegroundColor Green
Write-Host ""

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Una vez completados estos pasos, Fase 6" -ForegroundColor Cyan
Write-Host " estará 100% funcional!" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📚 Documentación completa en:" -ForegroundColor Yellow
Write-Host "   docs/FASE6_IMPLEMENTACION_COMPLETA.md" -ForegroundColor Gray
