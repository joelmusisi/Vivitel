# Vivitel Kubernetes layout

Browser → Cloudflare Pages (`us.vivitelematics.ca`)
→ Cloudflare Worker (api / same-origin) — auth, D1 credentials, KV edge
→ VPS Kubernetes Ingress (`vps.vivitelematics.ca`)

| Service | Role (`VIVI_SERVICE_ROLE`) | Owns |
|---------|----------------------------|------|
| **Track** | `track` | ingest, stream, device, assets, TCP ingest |
| **Control** | `control` | rbac, auth identity, kv/pat, alerts, support |
| **Analyse** | `analyse` | telemetry query/history, metrics |
| **Deliver** | `deliver` | `/deliver/*` |

## Preferred install (Helm = helmsman)

```bash
sudo mkdir -p /opt/vivitel/data
bash deploy/helm/apply-on-vps.sh
# or from Windows:
#   .\deploy-vps-k8s-helm.ps1 -IdentityFile $env:USERPROFILE\.ssh\<key>
```

Raw manifests (no Helm): `kubectl apply -f deploy/k8s/`

See [KUBERNETES_CONCEPTS.md](../KUBERNETES_CONCEPTS.md) for the six concepts and overload behaviour.

## Self-healing under load balancer pressure

- `/health/live` — process up (liveness; do not kill on temporary overload)
- `/health/ready` — 503 when in-flight or event-loop lag too high → LB drains pod
- Ingress `proxy-next-upstream` retries other replicas on 502/503
- HPA scales Control / Analyse / Deliver; Track stays 1 writer on single-node SQLite
- `preStop: sleep 5` avoids 502 during rolling updates
