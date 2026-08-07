#!/usr/bin/env bash
set -euo pipefail

CONTEXT="${CONTEXT:?set CONTEXT to the target EKS context}"
NAMESPACE="${NAMESPACE:-gpu-communication-lab}"
POD="${POD:?set POD to one running llm-d model-server pod}"
CONTAINER="${CONTAINER:-modelserver}"
KUBECTL="${KUBECTL:-kubectl}"

section() {
  printf '\n=== %s ===\n' "$1"
}

kube() {
  "${KUBECTL}" --context "${CONTEXT}" -n "${NAMESPACE}" "$@"
}

section "Capture metadata"
printf 'captured_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'namespace=%s\n' "${NAMESPACE}"
printf 'pod=%s\n' "${POD}"
printf 'container=%s\n' "${CONTAINER}"

section "Pod placement and phase"
kube get pod "${POD}" \
  -o 'custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,PHASE:.status.phase,QOS:.status.qosClass'

section "Declared and resolved container images"
kube get pod "${POD}" \
  -o jsonpath='{range .spec.containers[*]}{.name}{"\t"}{.image}{"\n"}{end}'
printf '\n'
kube get pod "${POD}" \
  -o jsonpath='{range .status.containerStatuses[*]}{.name}{"\t"}{.imageID}{"\n"}{end}'
printf '\n'

section "Selected container resources"
kube get pod "${POD}" \
  -o "jsonpath={.spec.containers[?(@.name==\"${CONTAINER}\")].resources}"
printf '\n'

section "Python package inventory"
PYTHON_INVENTORY="$(cat <<'PY'
from importlib.metadata import PackageNotFoundError, version

packages = (
    "vllm",
    "nixl",
    "torch",
    "transformers",
    "lmcache",
    "flashinfer-python",
)
for package in packages:
    try:
        print(f"{package}={version(package)}")
    except PackageNotFoundError:
        print(f"{package}=not-installed")

try:
    import torch

    print(f"torch_cuda={torch.version.cuda}")
    print(f"torch_nccl={torch.cuda.nccl.version()}")
except Exception as error:
    print(f"torch_runtime_probe_error={error!r}")
PY
)"
kube exec "${POD}" -c "${CONTAINER}" -- python -c "${PYTHON_INVENTORY}"

section "CUDA and GPU"
kube exec "${POD}" -c "${CONTAINER}" -- bash -lc \
  'nvidia-smi --query-gpu=name,uuid,driver_version,memory.total --format=csv,noheader; command -v nvcc >/dev/null && nvcc --version || true'

section "EFA and libfabric packages"
kube exec "${POD}" -c "${CONTAINER}" -- bash -lc '
  if command -v rpm >/dev/null 2>&1; then
    rpm -qa | grep -Ei "libfabric|efa|nixl|nccl" | sort || true
  fi
  if command -v dpkg-query >/dev/null 2>&1; then
    dpkg-query -W | grep -Ei "libfabric|efa|nixl|nccl" | sort || true
  fi
  if command -v ldconfig >/dev/null 2>&1; then
    ldconfig -p | grep -Ei "libfabric|nccl|nixl" || true
  fi
'

section "libfabric EFA provider"
kube exec "${POD}" -c "${CONTAINER}" -- bash -lc '
  FI_INFO="$(command -v fi_info || true)"
  if [ -z "${FI_INFO}" ] && [ -x /opt/amazon/efa/bin/fi_info ]; then
    FI_INFO=/opt/amazon/efa/bin/fi_info
  fi
  if [ -z "${FI_INFO}" ]; then
    echo "fi_info=not-found"
    exit 1
  fi
  "${FI_INFO}" --version
  "${FI_INFO}" -p efa -t FI_EP_RDM | head -n 80
'

section "Runtime communication environment"
kube exec "${POD}" -c "${CONTAINER}" -- bash -lc \
  'env | grep -E "^(CUDA|FI_|LD_LIBRARY_PATH|NCCL_|NIXL_|NVIDIA_|VLLM_)" | sort || true'

section "Assigned RDMA devices"
kube exec "${POD}" -c "${CONTAINER}" -- bash -lc '
  printf "uverbs_count="
  find /dev/infiniband -maxdepth 1 -name "uverbs*" 2>/dev/null | wc -l
  printf "rdma_devices="
  find /sys/class/infiniband -mindepth 1 -maxdepth 1 -printf "%f " 2>/dev/null || true
  printf "\n"
'

section "Reminder"
cat <<'EOF'
This inventory proves installed components and provider discovery. It does not
prove transport bandwidth or an application-level KV transfer. Pair it with a
NIXL LIBFABRIC nixlbench run, model-server transport logs, and a completed P/D
request. Review output for private cluster identifiers before publishing it.
EOF
