# PowerShell script to deploy update-research-agents.sql directly to Hostinger VPS database
# Usage: .\update-research-agents.ps1

$vpsHost = "82.29.197.221"
$sshKey = "c:/Users/Techa/.ssh/amx_hostinger_ed25519"
$sqlFile = "c:/Users/Techa/.paperclip/tmp_surfers/packages/db/update-research-agents.sql"

Write-Host "=== Deploying SQL Updates to Hostinger VPS Database ===" -ForegroundColor Cyan
Write-Host "Connecting to VPS $vpsHost and piping $sqlFile..." -ForegroundColor Yellow

# Pipe the SQL file contents directly into the PostgreSQL container
Get-Content $sqlFile | ssh -o StrictHostKeyChecking=no -i $sshKey root@$vpsHost "docker exec -i paperclip-db-1 psql -U paperclip -d paperclip"

Write-Host "=== SQL Update Deployment Done ===" -ForegroundColor Green
