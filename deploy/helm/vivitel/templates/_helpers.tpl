{{- /*
Reusable Deployment for a Vivitel module (Track / Control / Analyse / Deliver).
Applies: replicas, probes, preStop drain, HPA-friendly resources, PDB.
*/ -}}
{{- define "vivitel.moduleLabels" -}}
app.kubernetes.io/name: vivitel
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
vivitel.io/service: {{ .role }}
{{- end -}}
