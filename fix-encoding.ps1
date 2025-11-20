# Script para corregir problemas de encoding en archivos TypeScript/React
# Convierte caracteres mal codificados a UTF-8 correctamente

$files = @(
    "src\app\api\polizas\route.ts",
    "src\app\api\admin\users\[usuarioId]\segments\route.ts",
    "src\app\(private)\pendientes\page.tsx",
    "src\app\(private)\parametros\ParametrosClient.tsx",
    "src\app\(private)\clientes\updates\page.tsx",
    "src\app\(private)\polizas\updates\page.tsx"
)

# Mapa de reemplazos
$replacements = @{
    # ñ y Ñ
    'Ã±' = 'ñ'
    'Ã'' = 'Ñ'
    
    # vocales con acento
    'Ã¡' = 'á'
    'Ã©' = 'é'
    'Ã­' = 'í'
    'Ã³' = 'ó'
    'Ãº' = 'ú'
    'Ã' = 'Á'
    'Ã‰' = 'É'
    'Ã' = 'Í'
    'Ã"' = 'Ó'
    'Ãš' = 'Ú'
    
    # Otros caracteres especiales
    'Ã±o' = 'año'
    'ÃÂ­' = 'í'
    'Ã¡' = 'á'
}

$count = 0

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "Procesando: $file" -ForegroundColor Cyan
        
        # Leer contenido como bytes para manejar encoding mixto
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $content = [System.Text.Encoding]::UTF8.GetString($bytes)
        
        $changed = $false
        foreach ($key in $replacements.Keys) {
            if ($content.Contains($key)) {
                $content = $content.Replace($key, $replacements[$key])
                $changed = $true
            }
        }
        
        if ($changed) {
            # Guardar como UTF-8 sin BOM
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($file, $content, $utf8NoBom)
            Write-Host "  ✓ Corregido" -ForegroundColor Green
            $count++
        } else {
            Write-Host "  - Sin cambios" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ✗ No encontrado: $file" -ForegroundColor Red
    }
}

Write-Host "`n$count archivos corregidos" -ForegroundColor Yellow
