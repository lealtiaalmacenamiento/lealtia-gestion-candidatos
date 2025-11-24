# Script para aplicar migración de materialización de vw_cancelaciones_indices
# Este script requiere tener instalado PostgreSQL client (psql)

param(
    [string]$Environment = "production"
)

Write-Host "📦 Aplicando migración para materializar vw_cancelaciones_indices..." -ForegroundColor Cyan
Write-Host ""

# Cargar variables de entorno
$envFile = ".env.local"
if (-not (Test-Path $envFile)) {
    Write-Host "❌ No se encontró archivo $envFile" -ForegroundColor Red
    exit 1
}

$envVars = Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        @{ Key = $matches[1]; Value = $matches[2] }
    }
} | Where-Object { $_ -ne $null }

$supabaseUrl = ($envVars | Where-Object { $_.Key -eq 'NEXT_PUBLIC_SUPABASE_URL' }).Value
$serviceKey = ($envVars | Where-Object { $_.Key -eq 'SUPABASE_SERVICE_ROLE_KEY' }).Value
$projectRef = ($envVars | Where-Object { $_.Key -eq 'SUPABASE_PROJECT_REF' }).Value

if (-not $supabaseUrl -or -not $projectRef) {
    Write-Host "❌ Variables de entorno no configuradas correctamente" -ForegroundColor Red
    exit 1
}

$migrationFile = "supabase\migrations\20251124_materialize_cancelaciones_indices.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ No se encontró el archivo de migración: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "📄 Archivo de migración: $migrationFile" -ForegroundColor Green
Write-Host "🌐 Proyecto: $projectRef" -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  ADVERTENCIA: Esta operación puede tardar varios minutos." -ForegroundColor Yellow
Write-Host "   La vista materializada se creará y refrescará con todos los datos históricos." -ForegroundColor Yellow
Write-Host ""

# Verificar si psql está instalado
$psqlExists = Get-Command psql -ErrorAction SilentlyContinue

if ($psqlExists) {
    Write-Host "✓ psql encontrado" -ForegroundColor Green
    Write-Host ""
    
    $confirm = Read-Host "¿Desea aplicar la migración usando psql? (s/n)"
    
    if ($confirm -eq 's' -or $confirm -eq 'S') {
        Write-Host ""
        Write-Host "🔐 Se solicitará la contraseña del usuario postgres de Supabase." -ForegroundColor Cyan
        Write-Host "   Obténgala desde: https://supabase.com/dashboard/project/$projectRef/settings/database" -ForegroundColor Cyan
        Write-Host ""
        
        $dbHost = "db.$projectRef.supabase.co"
        $dbUser = "postgres"
        $dbName = "postgres"
        
        # Ejecutar migración
        psql -h $dbHost -U $dbUser -d $dbName -f $migrationFile
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ Migración aplicada exitosamente" -ForegroundColor Green
            Write-Host ""
            Write-Host "Cambios realizados:" -ForegroundColor Cyan
            Write-Host "  ✓ vw_cancelaciones_indices convertida a vista materializada"
            Write-Host "  ✓ Índices creados en usuario_id, periodo_mes, asesor_id"
            Write-Host "  ✓ Función refresh_vw_cancelaciones_indices() creada"
            Write-Host ""
            Write-Host "⚠️  SIGUIENTE PASO: Configurar pg_cron para refrescar la vista" -ForegroundColor Yellow
            Write-Host "   Ejecutar en SQL Editor de Supabase:" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "   SELECT cron.schedule(" -ForegroundColor White
            Write-Host "     'refresh-cancelaciones-indices'," -ForegroundColor White
            Write-Host "     '*/10 * * * *',  -- cada 10 minutos" -ForegroundColor White
            Write-Host "     $" -NoNewline -ForegroundColor White
            Write-Host "$" -NoNewline -ForegroundColor White
            Write-Host "SELECT refresh_vw_cancelaciones_indices();$" -NoNewline -ForegroundColor White
            Write-Host "$" -ForegroundColor White
            Write-Host "   );" -ForegroundColor White
            Write-Host ""
        } else {
            Write-Host ""
            Write-Host "❌ Error aplicando migración" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "❌ psql no encontrado en el PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Opciones alternativas:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Instalar PostgreSQL client:" -ForegroundColor Cyan
    Write-Host "   https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Aplicar manualmente en Supabase Dashboard:" -ForegroundColor Cyan
    Write-Host "   https://supabase.com/dashboard/project/$projectRef/sql/new" -ForegroundColor White
    Write-Host ""
    Write-Host "   Copiar y pegar el contenido de:" -ForegroundColor White
    Write-Host "   $migrationFile" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Usar la extensión de PostgreSQL en VS Code" -ForegroundColor Cyan
    Write-Host ""
}
