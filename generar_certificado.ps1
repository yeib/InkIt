$cert = New-SelfSignedCertificate -Subject "CN=Yeib" -Type CodeSigningCert -CertStoreLocation "Cert:\CurrentUser\My"
$pwd = ConvertTo-SecureString -String "Yeib2026" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "Yeib.pfx" -Password $pwd
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "✅ Certificado Yeib.pfx generado con exito en la carpeta!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Cuando vayas a exportar el programa, corre estos 3 comandos en PowerShell (uno por uno):" -ForegroundColor Cyan
Write-Host '$env:TAURI_SIGN_USER_FILE="Yeib.pfx"' -ForegroundColor Yellow
Write-Host '$env:TAURI_SIGN_USER_PASSWORD="Yeib2026"' -ForegroundColor Yellow
Write-Host 'npm run tauri build' -ForegroundColor Yellow
