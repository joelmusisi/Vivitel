# Vivitel Helm chart — industry-standard Kubernetes packaging
#
# Maps to the six concepts:
# 1. Container orchestration problem → Deployments + Services for Track/Control/Analyse/Deliver
# 2. Helmsman (Helm)                 → this chart (`helm upgrade --install`)
# 3. Control plane brain             → kube-apiserver / scheduler / controller-manager (cluster)
# 4. Worker node muscle              → pods scheduled onto VPS worker node(s)
# 5. Scaling + self-healing          → HPA, readiness overload shed, liveness restart, PDB, preStop
# 6. Industry standard               → CNCF Kubernetes + Helm + Ingress-NGINX
#
# Install on VPS (k3s recommended for one server):
#
#   curl -sfL https://get.k3s.io | sh -
#   sudo mkdir -p /opt/vivitel/data
#   export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
#   helm upgrade --install vivitel ./deploy/helm/vivitel -n vivitel --create-namespace
#
# Or use:  ./deploy/helm/apply-on-vps.sh

{{- /* Chart docs only */ -}}
