{{- define "amx-air-hubs.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "amx-air-hubs.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := include "amx-air-hubs.name" . -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "amx-air-hubs.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "amx-air-hubs.labels" -}}
helm.sh/chart: {{ include "amx-air-hubs.chart" . }}
app.kubernetes.io/name: {{ include "amx-air-hubs.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "amx-air-hubs.selectorLabels" -}}
app.kubernetes.io/name: {{ include "amx-air-hubs.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "amx-air-hubs.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "amx-air-hubs.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "amx-air-hubs.secretName" -}}
{{- if .Values.secrets.create -}}
{{- printf "%s-secrets" (include "amx-air-hubs.fullname" .) -}}
{{- else -}}
{{- .Values.secrets.existingSecretName -}}
{{- end -}}
{{- end -}}

{{- define "amx-air-hubs.persistenceClaimName" -}}
{{- if .Values.persistence.existingClaim -}}
{{- .Values.persistence.existingClaim -}}
{{- else -}}
{{- printf "%s-paperclip" (include "amx-air-hubs.fullname" .) -}}
{{- end -}}
{{- end -}}
