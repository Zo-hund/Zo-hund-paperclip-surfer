$headers = @{'Authorization'='Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'}
$uri = 'http://127.0.0.1:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/issues?status=todo,in_progress&limit=100'
try {
    $resp = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 30
    $issues = $resp.value
    Write-Host "Total open issues: $($issues.Count)"
    foreach ($i in $issues) {
        if ($i.title -match 'audit|verify|AMX|V3|certif|deliverable|work.*product|sign.*off') {
            Write-Host "MATCH: [$($i.identifier)] $($i.title) | status=$($i.status) | assignee=$($i.assigneeAgentId)"
        }
    }
} catch {
    Write-Host "Error: $_"
}
