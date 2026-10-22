# Kubernetes concepts → Vivitel

Research mapping (CNCF / Kubernetes docs / IBM / industry HA practices):

| # | Phrase | Meaning | Applied in Vivitel |
|---|--------|---------|-------------------|
| 1 | Container / orchestration problem | Hundreds of containers need scheduling, networking, failover | Four module Deployments + Services (`Track` / `Control` / `Analyse` / `Deliver`) |
| 2 | Meet the helmsman | **Kubernetes** = Greek *helmsman*; **Helm** is the package manager | `deploy/helm/vivitel` chart + `helm upgrade --install` |
| 3 | Control plane brain | API server, scheduler, controller-manager, etcd | Provided by **k3s** on the VPS (`apply-on-vps.sh`) |
| 4 | Worker node muscle | Nodes that run Pods (kubelet + kube-proxy) | Same VPS as worker; pods scheduled there |
| 5 | Scaling & self-healing | HPA, restarts, readiness drain, PDBs | HPA on Control/Analyse/Deliver; `/health/ready` overload 503; liveness; preStop sleep; Ingress retries |
| 6 | Industry standard | CNCF Kubernetes + Helm + Ingress-NGINX | Chart + Ingress annotations (`proxy-next-upstream`, EWMA LB) |

## How overload is handled

1. Pod under load → event-loop lag / in-flight ≥ `VPS_MAX_IN_FLIGHT`
2. `/health/ready` returns **503** → removed from Service endpoints
3. Ingress retries next healthy pod (`proxy-next-upstream`)
4. HPA adds replicas when CPU/memory high
5. Dead process → liveness fails → kubelet restarts container
6. Module isolation → Track failure does not take down Control/Deliver

## Apply on VPS

```powershell
# From Windows (needs a working SSH key for root@162.35.186.103)
.\deploy-vps-k8s-helm.ps1 -IdentityFile $env:USERPROFILE\.ssh\YOUR_KEY
```

Or on the server:

```bash
bash /opt/Vivitel/deploy/helm/apply-on-vps.sh
```

Until k8s is live, options without full cluster:

```bash
# Docker Compose HA (nginx LB + 4 roles + Valkey)
docker compose -f vivi_telematic/deploy/docker-compose.modules.yml up -d --build
```

```bash
# systemd multi-instance + nginx
sudo cp backend/vps@.service /etc/systemd/system/
# set PORT=8781..8784 per instance, then:
sudo systemctl enable --now vps@track vps@control vps@analyse vps@deliver
# use deploy/nginx/systemd-modules-gateway.conf on :8787
```
