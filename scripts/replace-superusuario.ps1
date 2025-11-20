# Script para reemplazar 'superusuario' por 'supervisor' en archivos TypeScript

$files = @(
    "src\app\(private)\agenda\page.tsx",
    "src\app\(private)\gestion\page.tsx",
    "src\app\(private)\home\page.tsx",
    "src\app\api\agenda\citas\cancel\route.ts",
    "src\app\api\agenda\citas\route.ts",
    "src\app\api\agenda\desarrolladores\route.ts",
    "src\app\api\agenda\prospectos\route.ts",
    "src\app\api\agenda\slots\route.ts",
    "src\app\api\agentes\route.ts",
    "src\app\api\cedula_a1\[id]\route.ts",
    "src\app\api\clientes\route.ts",
    "src\app\api\debug\role\route.ts",
    "src\app\api\efc\[id]\route.ts"
)

$totalChanges = 0

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $originalContent = $content
        
        $content = $content -replace "'superusuario'", "'supervisor'"
        $content = $content -replace '"superusuario"', '"supervisor"'
        $content = $content -replace '\bsuperusuario\b', 'supervisor'
        $content = $content -replace '\bsuperusuarios\b', 'supervisores'
        $content = $content -replace '\bSuperusuario\b', 'Supervisor'
        $content = $content -replace '\bSuperusuarios\b', 'Supervisores'
        
        if ($content -ne $originalContent) {
            Set-Content -Path $file -Value $content -NoNewline
            Write-Host "OK: $file" -ForegroundColor Green
            $totalChanges++
        }
    }
}

Write-Host "`nTotal archivos actualizados: $totalChanges" -ForegroundColor Cyan
