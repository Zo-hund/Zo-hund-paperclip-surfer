# Full GitHub setup script for AMX Air Hubs
# Repo: Zo-hund/Zo-hund-paperclip-surfer
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$REPO = "Zo-hund/Zo-hund-paperclip-surfer"

Write-Host "`n==> Generating cryptographic secrets..." -ForegroundColor Cyan
$AUTH_SECRET    = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$JWT_SECRET     = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$PG_PASSWORD    = node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
$SMOKE_SECRET   = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
Write-Host "  Secrets generated." -ForegroundColor Green

# ── Parse local .env for Resend/Email settings ──────────────────────────────────
$RESEND_API_KEY = ""
$EMAIL_FROM = ""
$EMAIL_REPLY_TO = ""

if (Test-Path ".env") {
    $envLines = Get-Content ".env"
    foreach ($line in $envLines) {
        $line = $line.Trim()
        if ($line -like "RESEND_API_KEY=*") {
            $RESEND_API_KEY = $line.Substring("RESEND_API_KEY=".Length).Trim("'`" ")
        }
        if ($line -like "PAPERCLIP_EMAIL_FROM=*") {
            $EMAIL_FROM = $line.Substring("PAPERCLIP_EMAIL_FROM=".Length).Trim("'`" ")
        }
        if ($line -like "PAPERCLIP_EMAIL_REPLY_TO=*") {
            $EMAIL_REPLY_TO = $line.Substring("PAPERCLIP_EMAIL_REPLY_TO=".Length).Trim("'`" ")
        }
    }
}

# ── Repo-level variables ───────────────────────────────────────────────────────
Write-Host "`n==> Setting repository variables..." -ForegroundColor Cyan
gh variable set REGISTRY_IMAGE      --body "ghcr.io/zo-hund/amx-air-hubs"         --repo $REPO
gh variable set PAPERCLIP_PUBLIC_URL --body "https://amx-air-hubs.cc"             --repo $REPO
Write-Host "  Repo variables done." -ForegroundColor Green

# ── Repo-level secrets ────────────────────────────────────────────────────────
Write-Host "`n==> Setting repository secrets..." -ForegroundColor Cyan
$GH_TOKEN = gh auth token
$GH_TOKEN | gh secret set REGISTRY_TOKEN    --repo $REPO
"zo-hund"  | gh secret set REGISTRY_USERNAME --repo $REPO
$SMOKE_SECRET | gh secret set BETTER_AUTH_SECRET --repo $REPO
Write-Host "  Repo secrets done." -ForegroundColor Green

# ── Create environments ───────────────────────────────────────────────────────
Write-Host "`n==> Creating GitHub environments..." -ForegroundColor Cyan

# Get repo node ID for protection rules
$repoData = gh api "repos/$REPO" | ConvertFrom-Json
$repoId   = $repoData.id

# Create hostinger-prod environment (manual approval gate)
gh api --method PUT "repos/$REPO/environments/hostinger-prod" `
  --field "wait_timer=0" `
  --field "prevent_self_review=false" `
  -f "reviewers=[]" | Out-Null

# Create staging environment (auto, no gate)
gh api --method PUT "repos/$REPO/environments/staging" | Out-Null

# Create production environment (manual approval gate)
gh api --method PUT "repos/$REPO/environments/production" `
  --field "wait_timer=0" `
  --field "prevent_self_review=false" `
  -f "reviewers=[]" | Out-Null

Write-Host "  Environments created: hostinger-prod, staging, production" -ForegroundColor Green

# ── hostinger-prod secrets ────────────────────────────────────────────────────
Write-Host "`n==> Setting hostinger-prod environment secrets..." -ForegroundColor Cyan
$AUTH_SECRET  | gh secret set AMX_BETTER_AUTH_SECRET       --env hostinger-prod --repo $REPO
$JWT_SECRET   | gh secret set PAPERCLIP_AGENT_JWT_SECRET   --env hostinger-prod --repo $REPO
$PG_PASSWORD  | gh secret set POSTGRES_PASSWORD             --env hostinger-prod --repo $REPO
""            | gh secret set VPS_HOST                      --env hostinger-prod --repo $REPO
""            | gh secret set VPS_SSH_USER                  --env hostinger-prod --repo $REPO
"22"          | gh secret set VPS_SSH_PORT                  --env hostinger-prod --repo $REPO
""            | gh secret set VPS_SSH_PRIVATE_KEY           --env hostinger-prod --repo $REPO
""            | gh secret set TRAEFIK_ACME_EMAIL            --env hostinger-prod --repo $REPO
""            | gh secret set ANTHROPIC_API_KEY             --env hostinger-prod --repo $REPO
""            | gh secret set OPENAI_API_KEY                --env hostinger-prod --repo $REPO
""            | gh secret set GOOGLE_API_KEY                --env hostinger-prod --repo $REPO
"zo-hund"     | gh secret set GHCR_PULL_USERNAME            --env hostinger-prod --repo $REPO
$GH_TOKEN     | gh secret set GHCR_PULL_TOKEN               --env hostinger-prod --repo $REPO
if ($RESEND_API_KEY) { $RESEND_API_KEY | gh secret set RESEND_API_KEY --env hostinger-prod --repo $REPO }
if ($EMAIL_FROM) { $EMAIL_FROM | gh secret set PAPERCLIP_EMAIL_FROM --env hostinger-prod --repo $REPO }
if ($EMAIL_REPLY_TO) { $EMAIL_REPLY_TO | gh secret set PAPERCLIP_EMAIL_REPLY_TO --env hostinger-prod --repo $REPO }
Write-Host "  hostinger-prod secrets done." -ForegroundColor Green

# ── hostinger-prod variables ──────────────────────────────────────────────────
Write-Host "`n==> Setting hostinger-prod environment variables..." -ForegroundColor Cyan
gh variable set VPS_LAYOUT               --body "hostinger-shared-traefik" --env hostinger-prod --repo $REPO
gh variable set VPS_DOMAIN               --body "amx-air-hubs.cc"          --env hostinger-prod --repo $REPO
gh variable set VPS_DEPLOY_DIR           --body "/root/paperclip"          --env hostinger-prod --repo $REPO
gh variable set VPS_COMPOSE_PROJECT_NAME --body "paperclip"                --env hostinger-prod --repo $REPO
Write-Host "  hostinger-prod variables done." -ForegroundColor Green

# ── staging environment secrets ───────────────────────────────────────────────
Write-Host "`n==> Setting staging environment secrets..." -ForegroundColor Cyan
$AUTH_SECRET | gh secret set AMX_BETTER_AUTH_SECRET     --env staging --repo $REPO
$JWT_SECRET  | gh secret set PAPERCLIP_AGENT_JWT_SECRET --env staging --repo $REPO
""           | gh secret set AMX_DATABASE_URL           --env staging --repo $REPO
""           | gh secret set KUBE_CONFIG_DATA           --env staging --repo $REPO
""           | gh secret set ANTHROPIC_API_KEY          --env staging --repo $REPO
""           | gh secret set OPENAI_API_KEY             --env staging --repo $REPO
""           | gh secret set GOOGLE_API_KEY             --env staging --repo $REPO
$GH_TOKEN    | gh secret set GHCR_PULL_TOKEN            --env staging --repo $REPO
"zo-hund"    | gh secret set GHCR_PULL_USERNAME         --env staging --repo $REPO
if ($RESEND_API_KEY) { $RESEND_API_KEY | gh secret set RESEND_API_KEY --env staging --repo $REPO }
if ($EMAIL_FROM) { $EMAIL_FROM | gh secret set PAPERCLIP_EMAIL_FROM --env staging --repo $REPO }
if ($EMAIL_REPLY_TO) { $EMAIL_REPLY_TO | gh secret set PAPERCLIP_EMAIL_REPLY_TO --env staging --repo $REPO }
Write-Host "  staging secrets done." -ForegroundColor Green

# ── production environment secrets ───────────────────────────────────────────
Write-Host "`n==> Setting production environment secrets..." -ForegroundColor Cyan
$AUTH_SECRET | gh secret set AMX_BETTER_AUTH_SECRET     --env production --repo $REPO
$JWT_SECRET  | gh secret set PAPERCLIP_AGENT_JWT_SECRET --env production --repo $REPO
""           | gh secret set AMX_DATABASE_URL           --env production --repo $REPO
""           | gh secret set KUBE_CONFIG_DATA           --env production --repo $REPO
""           | gh secret set ANTHROPIC_API_KEY          --env production --repo $REPO
""           | gh secret set OPENAI_API_KEY             --env production --repo $REPO
""           | gh secret set GOOGLE_API_KEY             --env production --repo $REPO
$GH_TOKEN    | gh secret set GHCR_PULL_TOKEN            --env production --repo $REPO
"zo-hund"    | gh secret set GHCR_PULL_USERNAME         --env production --repo $REPO
if ($RESEND_API_KEY) { $RESEND_API_KEY | gh secret set RESEND_API_KEY --env production --repo $REPO }
if ($EMAIL_FROM) { $EMAIL_FROM | gh secret set PAPERCLIP_EMAIL_FROM --env production --repo $REPO }
if ($EMAIL_REPLY_TO) { $EMAIL_REPLY_TO | gh secret set PAPERCLIP_EMAIL_REPLY_TO --env production --repo $REPO }
Write-Host "  production secrets done." -ForegroundColor Green

# ── Generate SSH deploy key ───────────────────────────────────────────────────
Write-Host "`n==> Generating SSH deploy key for Hostinger..." -ForegroundColor Cyan
$keyPath = "deploy\keys\amx-deploy-key"
New-Item -ItemType Directory -Force -Path "deploy\keys" | Out-Null
if (Test-Path "$keyPath") { Remove-Item "$keyPath","$keyPath.pub" -Force }
ssh-keygen -t ed25519 -C "github-actions-deploy@amx-air-hubs" -f $keyPath -N '""' 2>&1 | Out-Null
$privKey = Get-Content $keyPath -Raw
$pubKey  = Get-Content "$keyPath.pub" -Raw
$privKey | gh secret set VPS_SSH_PRIVATE_KEY --env hostinger-prod --repo $REPO
Write-Host "  SSH key generated and set." -ForegroundColor Green
Write-Host ""
Write-Host "  PUBLIC KEY (add this to your Hostinger VPS ~/.ssh/authorized_keys):" -ForegroundColor Yellow
Write-Host "  $pubKey" -ForegroundColor White

# ── Branch protection on main ─────────────────────────────────────────────────
Write-Host "`n==> Setting branch protection on 'main'..." -ForegroundColor Cyan
$protection = @{
  required_status_checks = @{
    strict = $true
    contexts = @("smoke", "build and test", "helm validate", "docker")
  }
  enforce_admins = $false
  required_pull_request_reviews = @{
    required_approving_review_count = 1
    dismiss_stale_reviews = $true
  }
  restrictions = $null
  allow_force_pushes = $false
  allow_deletions = $false
} | ConvertTo-Json -Depth 5

$protection | gh api --method PUT "repos/$REPO/branches/main/protection" --input - | Out-Null
Write-Host "  Branch protection set on 'main'." -ForegroundColor Green

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " SETUP COMPLETE" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Generated secrets (save these securely):" -ForegroundColor Yellow
Write-Host "   AMX_BETTER_AUTH_SECRET:     $AUTH_SECRET"
Write-Host "   PAPERCLIP_AGENT_JWT_SECRET: $JWT_SECRET"
Write-Host "   POSTGRES_PASSWORD:          $PG_PASSWORD"
Write-Host ""
Write-Host " What's DONE:" -ForegroundColor Green
Write-Host "   [x] Repo variables: REGISTRY_IMAGE, PAPERCLIP_PUBLIC_URL"
Write-Host "   [x] Repo secrets:   REGISTRY_TOKEN, REGISTRY_USERNAME, BETTER_AUTH_SECRET"
Write-Host "   [x] Environment:    hostinger-prod (with secrets + variables)"
Write-Host "   [x] Environment:    staging"
Write-Host "   [x] Environment:    production"
Write-Host "   [x] SSH deploy key: generated + set as VPS_SSH_PRIVATE_KEY"
Write-Host "   [x] Branch protection on 'main'"
Write-Host ""
Write-Host " What still needs YOUR input (fill in GitHub > Environments > hostinger-prod):" -ForegroundColor Yellow
Write-Host "   [ ] VPS_HOST              - your Hostinger VPS IP address"
Write-Host "   [ ] VPS_SSH_USER          - SSH user (usually 'root')"
Write-Host "   [ ] TRAEFIK_ACME_EMAIL    - your email for Let's Encrypt"
Write-Host "   [ ] ANTHROPIC_API_KEY     - if using Claude agents"
Write-Host "   [ ] OPENAI_API_KEY        - if using Codex agents"
Write-Host "   [ ] GOOGLE_API_KEY        - if using Gemini agents"
Write-Host "   [ ] AMX_DATABASE_URL      - Postgres URL (staging + production envs)"
Write-Host "   [ ] KUBE_CONFIG_DATA      - run: bash deploy/scripts/create-deploy-token.sh"
Write-Host ""
Write-Host " Add the SSH public key to your Hostinger VPS:" -ForegroundColor Yellow
Write-Host "   ssh root@<VPS_IP> `"echo '$pubKey' >> ~/.ssh/authorized_keys`""
Write-Host ""
Write-Host " Open GitHub Environments:" -ForegroundColor Cyan
Write-Host "   https://github.com/$REPO/settings/environments"
Write-Host ""
