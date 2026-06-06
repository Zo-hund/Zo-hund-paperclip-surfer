param(
  [string]$Namespace = "amx-air-hubs-staging",
  [string]$Deployment = "amx-air-hubs-staging",
  [string]$Url = "https://staging.amx-air-hubs.cc",
  [string]$Timeout = "10m"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Status, [string]$Message)
  Write-Host ("[{0}] {1}" -f $Status, $Message)
}

function Fail {
  param([string]$Message)
  Write-Step "FAIL" $Message
  exit 1
}

function Run-Kubectl {
  param([string[]]$Arguments)

  $output = & kubectl @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }

  return $output
}

function Read-KubectlJson {
  param([string[]]$Arguments)

  $jsonText = Run-Kubectl $Arguments | Out-String
  return $jsonText | ConvertFrom-Json
}

function Get-IntOrZero {
  param($Value)

  if ($null -eq $Value) {
    return 0
  }

  return [int]$Value
}

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
  Fail "kubectl is not installed or is not on PATH."
}

Write-Step "INFO" "Validating namespace '$Namespace', deployment '$Deployment', URL '$Url'."

try {
  Run-Kubectl @("get", "namespace", $Namespace) | Out-Null
  Write-Step "OK" "Namespace is accessible: $Namespace"
} catch {
  Fail "Cannot access namespace '$Namespace'. Check kube context and permissions."
}

try {
  Run-Kubectl @("rollout", "status", "deployment/$Deployment", "-n", $Namespace, "--timeout=$Timeout")
  Write-Step "OK" "Rollout is healthy for deployment/$Deployment."
} catch {
  Fail "Rollout did not complete for deployment/$Deployment in namespace '$Namespace'."
}

try {
  $deploymentJson = Read-KubectlJson @("get", "deployment", $Deployment, "-n", $Namespace, "-o", "json")
  $desiredReplicas = Get-IntOrZero $deploymentJson.spec.replicas
  $availableReplicas = Get-IntOrZero $deploymentJson.status.availableReplicas
  $unavailableReplicas = Get-IntOrZero $deploymentJson.status.unavailableReplicas

  if ($desiredReplicas -lt 1) {
    Fail "Deployment '$Deployment' has no desired replicas."
  }

  if ($availableReplicas -lt $desiredReplicas -or $unavailableReplicas -gt 0) {
    Fail "Deployment '$Deployment' is not fully available. desired=$desiredReplicas available=$availableReplicas unavailable=$unavailableReplicas"
  }

  Write-Step "OK" "Deployment replicas are available. desired=$desiredReplicas available=$availableReplicas"
} catch {
  Fail "Unable to inspect deployment '$Deployment'. $($_.Exception.Message)"
}

try {
  Run-Kubectl @("get", "pods", "-n", $Namespace)
  Write-Step "OK" "Pods listed."
} catch {
  Fail "Unable to list pods in namespace '$Namespace'."
}

try {
  $podsJson = Read-KubectlJson @("get", "pods", "-n", $Namespace, "-o", "json")
  $badPods = @($podsJson.items | Where-Object {
      $_.status.phase -ne "Running" -and $_.status.phase -ne "Succeeded"
    })

  if ($badPods.Count -gt 0) {
    $badPodNames = ($badPods | ForEach-Object { $_.metadata.name }) -join ", "
    Fail "Pods are not ready/running: $badPodNames"
  }

  $nodes = @($podsJson.items | Where-Object { $_.spec.nodeName } | ForEach-Object { $_.spec.nodeName } | Sort-Object -Unique)
  if ($nodes.Count -lt 2) {
    Write-Step "WARN" "Pods are scheduled on fewer than two nodes. This is acceptable for small staging clusters."
  } else {
    Write-Step "OK" "Pods are spread across $($nodes.Count) nodes."
  }

  Run-Kubectl @("get", "pods", "-n", $Namespace, "-o", "wide")
} catch {
  Fail "Unable to inspect pod readiness or node spread. $($_.Exception.Message)"
}

try {
  $ingressJson = Read-KubectlJson @("get", "ingress", "-n", $Namespace, "-o", "json")
  if (@($ingressJson.items).Count -lt 1) {
    Fail "No ingress resources found in namespace '$Namespace'."
  }

  Run-Kubectl @("get", "ingress", "-n", $Namespace)
  Write-Step "OK" "Ingress is present."
} catch {
  Fail "Unable to inspect ingress resources in namespace '$Namespace'. $($_.Exception.Message)"
}

try {
  $hpaJson = Read-KubectlJson @("get", "hpa", "-n", $Namespace, "-o", "json")
  if (@($hpaJson.items).Count -lt 1) {
    Fail "No HPA resources found in namespace '$Namespace'."
  }

  Run-Kubectl @("get", "hpa", "-n", $Namespace)
  Write-Step "OK" "HPA is present."
} catch {
  Fail "Unable to inspect HPA resources in namespace '$Namespace'. $($_.Exception.Message)"
}

try {
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -MaximumRedirection 5
  if ($response.StatusCode -lt 200 -or $response.StatusCode -gt 399) {
    Fail "HTTP check failed for '$Url' with status $($response.StatusCode)."
  }

  Write-Step "OK" "HTTP check passed for '$Url' with status $($response.StatusCode)."
} catch {
  Fail "HTTP check failed for '$Url'. $($_.Exception.Message)"
}

Write-Step "OK" "AMX cluster smoke test passed."
