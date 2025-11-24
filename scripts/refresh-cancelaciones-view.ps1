# Script para refrescar manualmente la vista materializada vw_cancelaciones_indices
# Util para testing o cuando se necesita un refresco inmediato

param(
    [ValidateSet("Dev", "Main", "Both")]
    [string]$Environment = "Both"
)

$ErrorActionPreference = "Stop"

Write-Host "Refrescando vista materializada vw_cancelaciones_indices..." -ForegroundColor Cyan
Write-Host ""

function Refresh-MaterializedView {
    param(
        [string]$DbHost,
        [string]$EnvName
    )
    
    Write-Host "Refrescando en ${EnvName} (${DbHost})..." -ForegroundColor Yellow
    
    $psqlPath = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
    $cmd = "SELECT refresh_vw_cancelaciones_indices();"
    
    try {
        $ErrorActionPreference = "Continue"
        $result = & $psqlPath -h $DbHost -U postgres -d postgres -c $cmd 2>&1
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
        
        if ($exitCode -eq 0 -or ($result -match "refrescada")) {
            Write-Host "[OK] ${EnvName}: Vista refrescada exitosamente" -ForegroundColor Green
            return $true
        } else {
            Write-Host "[ERROR] ${EnvName}: Error refrescando vista" -ForegroundColor Red
            Write-Host $result -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "[ERROR] ${EnvName}: Excepcion al ejecutar comando" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        return $false
    }
}

$devHost = "db.wqutrjnxvcgmyyiyjmsd.supabase.co"
$mainHost = "db.oooyuomshachmmblmpvd.supabase.co"

$success = $true

switch ($Environment) {
    "Dev" {
        $success = Refresh-MaterializedView -DbHost $devHost -EnvName "Dev"
    }
    "Main" {
        $success = Refresh-MaterializedView -DbHost $mainHost -EnvName "Main"
    }
    "Both" {
        $devSuccess = Refresh-MaterializedView -DbHost $devHost -EnvName "Dev"
        Write-Host ""
        $mainSuccess = Refresh-MaterializedView -DbHost $mainHost -EnvName "Main"
        $success = $devSuccess -and $mainSuccess
    }
}

Write-Host ""
if ($success) {
    Write-Host "Operacion completada exitosamente" -ForegroundColor Green
} else {
    Write-Host "Hubo errores durante la operacion" -ForegroundColor Yellow
    exit 1
}
