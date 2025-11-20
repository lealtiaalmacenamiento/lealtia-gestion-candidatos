# Test del endpoint de limpieza de cache de campañas

Write-Host "🧹 Testeando endpoint de limpieza de cache..." -ForegroundColor Cyan

# URL del endpoint (ajustar según entorno)
$url = "http://localhost:3000/api/cron/clean-campaign-cache"

# Token de seguridad (si está configurado en .env.local)
$token = $env:CRON_SECRET

Write-Host "`n📍 URL: $url" -ForegroundColor Gray

try {
    # Hacer request con token si existe
    if ($token) {
        Write-Host "🔐 Usando token de autenticación" -ForegroundColor Gray
        $response = Invoke-WebRequest -Uri "$url`?token=$token" -Method GET -UseBasicParsing
    } else {
        Write-Host "⚠️  Sin token de autenticación (CRON_SECRET no configurado)" -ForegroundColor Yellow
        $response = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing
    }
    
    # Mostrar respuesta
    $json = $response.Content | ConvertFrom-Json
    
    Write-Host "`n✅ Respuesta exitosa:" -ForegroundColor Green
    Write-Host "   Registros eliminados: $($json.deletedCount)" -ForegroundColor White
    Write-Host "   Antigüedad máxima: $($json.maxAgeMinutes) minutos" -ForegroundColor White
    Write-Host "   Cutoff time: $($json.cutoffTime)" -ForegroundColor White
    
} catch {
    Write-Host "`n❌ Error al ejecutar endpoint:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $responseBody = $reader.ReadToEnd()
        Write-Host "`nRespuesta del servidor:" -ForegroundColor Yellow
        Write-Host $responseBody -ForegroundColor Gray
    }
}

Write-Host "`n💡 Nota: El servidor Next.js debe estar corriendo (npm run dev)" -ForegroundColor Cyan
