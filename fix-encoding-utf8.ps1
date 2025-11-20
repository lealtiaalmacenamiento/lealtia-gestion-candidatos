# Script para corregir encoding UTF-8 mal interpretado
$ErrorActionPreference = 'Stop'

$files = @(
    'src\app\api\polizas\route.ts',
    'src\app\(private)\pendientes\page.tsx',
    'src\app\(private)\parametros\ParametrosClient.tsx',
    'src\app\(private)\clientes\updates\page.tsx',
    'src\app\(private)\polizas\updates\page.tsx'
)

$utf8 = [System.Text.Encoding]::UTF8
$count = 0

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "Procesando: $file" -ForegroundColor Cyan
        
        # Leer archivo
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $content = $utf8.GetString($bytes)
        
        $originalContent = $content
        
        # Reemplazar secuencias problematicas (usando escape codes para evitar problemas de encoding)
        $content = $content -replace ([char]0xC3 + [char]0xB1), 'ñ'
        $content = $content -replace ([char]0xC3 + [char]0xB3), 'ó'
        $content = $content -replace ([char]0xC3 + [char]0xA1), 'á'
        $content = $content -replace ([char]0xC3 + [char]0xA9), 'é'
        $content = $content -replace ([char]0xC3 + [char]0xAD), 'í'
        $content = $content -replace ([char]0xC3 + [char]0xBA), 'ú'
        $content = $content -replace ([char]0xC3 + [char]0x93), 'Ó'
        $content = $content -replace ([char]0xC3 + [char]0x89), 'É'
        $content = $content -replace ([char]0xC3 + [char]0x8D), 'Í'
        $content = $content -replace ([char]0xC3 + [char]0x91), 'Ñ'
        $content = $content -replace ([char]0xC3 + [char]0x81), 'Á'
        $content = $content -replace ([char]0xC3 + [char]0x9A), 'Ú'
        
        if ($content -ne $originalContent) {
            # Guardar con UTF-8 sin BOM
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText((Resolve-Path $file).Path, $content, $utf8NoBom)
            Write-Host "  Corregido" -ForegroundColor Green
            $count++
        } else {
            Write-Host "  Sin cambios" -ForegroundColor Gray
        }
    } else {
        Write-Host "  No encontrado" -ForegroundColor Red
    }
}

Write-Host "`nTotal: $count archivos corregidos" -ForegroundColor Yellow
