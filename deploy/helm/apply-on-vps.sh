#!/usr/bin/env bash
# Install / upgrade Vivitel Kubernetes modules on the VPS.
# Run ON the VPS as root (or with sudo). Requires network for k3s/helm if missing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHART="$ROOT/deploy/helm/vivitel"
NS="${VIVITEL_NS:-vivitel}"
RELEASE="${VIVITEL_RELEASE:-vivitel}"

echo "==> [1/5] Ensure data dir (shared SQLite hostPath)"
mkdir -p /opt/vivitel/data
chmod 755 /opt/vivitel/data

echo "==> [2/5] Ensure Kubernetes (k3s) — control plane brain + worker muscle on this host"
if ! command -v kubectl >/dev/null 2>&1; then
  if command -v k3s >/dev/null 2>&1; then
    export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  else
    echo "Installing k3s (lightweight industry-standard Kubernetes)..."
    curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik" sh -
    export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
    sleep 5
  fi
fi
export KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
kubectl get nodes

echo "==> [3/5] Ensure Helm (the helmsman)"
if ! command -v helm >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
fi
helm version

echo "==> [4/5] Ensure Ingress-NGINX (cluster load balancer)"
if ! kubectl get ns ingress-nginx >/dev/null 2>&1; then
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/baremetal/deploy.yaml
  kubectl -n ingress-nginx rollout status deployment/ingress-nginx-controller --timeout=180s || true
fi

echo "==> [5/5] Helm upgrade — orchestrate Track / Control / Analyse / Deliver"
# Prefer a locally built image if present; otherwise use values default.
IMAGE_REPO="${VIVITEL_IMAGE_REPO:-ghcr.io/vivitel/vivitel-vps}"
IMAGE_TAG="${VIVITEL_IMAGE_TAG:-latest}"

helm upgrade --install "$RELEASE" "$CHART" \
  --namespace "$NS" \
  --create-namespace \
  --set "global.image.repository=${IMAGE_REPO}" \
  --set "global.image.tag=${IMAGE_TAG}" \
  --wait --timeout 5m || true

echo "==> Status"
kubectl -n "$NS" get pods,svc,ingress,hpa
echo
echo "Health probes:"
echo "  /health/live  — process alive (liveness)"
echo "  /health/ready — accept traffic; 503 when overloaded (readiness → LB drain)"
echo
echo "Done. Point Worker VPS_API_BASE_URL / edge proxy at this Ingress host."
