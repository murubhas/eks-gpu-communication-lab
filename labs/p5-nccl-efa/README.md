# P5 NCCL over EFA validation lab

This lab proves two paths sequentially:

1. Eight local H100 ranks communicate through the P5 NVSwitch domain.
2. Sixteen ranks across two P5 nodes communicate through NCCL, aws-ofi-nccl,
   libfabric, EFA, and GPUDirect RDMA.

It validates transport selection and collective correctness. It is not a
bandwidth or application-throughput benchmark.

## Safety and cost gate

The inter-node phase requests all 8 GPUs and all 32 EFA devices on each of two
`p5.48xlarge` nodes. The manifests do not create or resize nodes. Confirm that
the capacity is intentionally available before applying anything.

Run the phases sequentially. Delete each completed phase before starting the
next one so the pods do not compete for GPUs.

## Prerequisites

- An EKS cluster with two EFA-enabled `p5.48xlarge` nodes in one Availability
  Zone and preferably one cluster placement group.
- The EKS-optimized NVIDIA AMI or an equivalent validated host stack.
- NVIDIA and EFA device plugins.
- Each lab node labeled `workload=p5-efa-lab`.
- Optional taint `workload=p5-efa-lab:NoSchedule`; the manifests tolerate it.
- `kubectl` access and explicit authorization to consume both nodes.

```bash
export KUBE_CONTEXT='<your-EKS-context>'
export NS='gpu-communication-lab'

kubectl --context "$KUBE_CONTEXT" apply \
  -f labs/p5-nccl-efa/manifests/00-namespace.yaml
```

Label only the nodes reserved for the experiment:

```bash
kubectl --context "$KUBE_CONTEXT" label node <p5-node-a> workload=p5-efa-lab
kubectl --context "$KUBE_CONTEXT" label node <p5-node-b> workload=p5-efa-lab
```

Create the fail-closed checker ConfigMap:

```bash
kubectl --context "$KUBE_CONTEXT" -n "$NS" create configmap p5-nccl-preflight \
  --from-file=efa_nccl_preflight.py=labs/p5-nccl-efa/scripts/efa_nccl_preflight.py \
  --dry-run=client -o yaml | kubectl --context "$KUBE_CONTEXT" apply -f -
```

## Phase 1: inventory one DLC

```bash
kubectl --context "$KUBE_CONTEXT" apply \
  -f labs/p5-nccl-efa/manifests/00-dlc-inventory.yaml
kubectl --context "$KUBE_CONTEXT" -n "$NS" wait pod/p5-dlc-inventory \
  --for=condition=Ready --timeout=10m
```

Inspect CUDA, NCCL, libfabric, the OFI plugin, and EFA devices:

```bash
kubectl --context "$KUBE_CONTEXT" -n "$NS" exec p5-dlc-inventory -- bash -lc '
python -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.nccl.version())"
/opt/amazon/efa/bin/fi_info -p efa -t FI_EP_RDM >/dev/null && echo FI_INFO_EFA_OK
ls -l /opt/amazon/ofi-nccl/lib/libnccl-net*.so
ldd /opt/amazon/ofi-nccl/lib/libnccl-net-ofi.so | grep libfabric
ls -1 /dev/infiniband/uverbs* | wc -l
'
```

Delete the inventory pod before continuing:

```bash
kubectl --context "$KUBE_CONTEXT" -n "$NS" delete pod p5-dlc-inventory
```

## Phase 2: intra-node NVSwitch collective

```bash
kubectl --context "$KUBE_CONTEXT" apply \
  -f labs/p5-nccl-efa/manifests/10-intranode-nccl.yaml
kubectl --context "$KUBE_CONTEXT" -n "$NS" wait pod/p5-nccl-intranode \
  --for=jsonpath='{.status.phase}'=Succeeded --timeout=10m
```

Require all eight rank markers:

```bash
INTRA_LOG="$(kubectl --context "$KUBE_CONTEXT" -n "$NS" logs p5-nccl-intranode)"
test "$(printf '%s' "$INTRA_LOG" | grep -o EFA_NCCL_PREFLIGHT_COLLECTIVE_OK | wc -l | tr -d ' ')" -eq 8
printf '%s\n' "$INTRA_LOG" | grep -E 'NVLS|GDR 1|EFA_NCCL_PREFLIGHT_COLLECTIVE_OK'
kubectl --context "$KUBE_CONTEXT" -n "$NS" delete pod p5-nccl-intranode
```

## Phase 3: inter-node NCCL over EFA

```bash
kubectl --context "$KUBE_CONTEXT" apply \
  -f labs/p5-nccl-efa/manifests/20-internode-nccl-efa.yaml
kubectl --context "$KUBE_CONTEXT" -n "$NS" wait pod -l app=p5-nccl-internode \
  --for=jsonpath='{.status.phase}'=Succeeded --timeout=15m
```

Fail closed if ranks are missing or NCCL used sockets for the data path:

```bash
for pod in p5-nccl-internode-0 p5-nccl-internode-1; do
  LOG="$(kubectl --context "$KUBE_CONTEXT" -n "$NS" logs "$pod")"
  test "$(printf '%s' "$LOG" | grep -o EFA_NCCL_PREFLIGHT_COLLECTIVE_OK | wc -l | tr -d ' ')" -eq 8
  ! printf '%s\n' "$LOG" | grep -Eq 'NET/Socket|Using network Socket'
  printf '%s\n' "$LOG" | grep -m1 'Selected provider is efa, fabric is efa-direct'
  printf '%s\n' "$LOG" | grep -m1 'Using transport protocol RDMA'
  printf '%s\n' "$LOG" | grep -m1 'Using network Libfabric'
  printf '%s\n' "$LOG" | grep -m1 'via NET/Libfabric/.*/GDRDMA'
done
```

Expected proof:

- 16/16 correct collective markers.
- 32 EFA devices visible per pod.
- aws-ofi-nccl initializes.
- libfabric selects `efa-direct` and RDMA.
- NCCL channels report `GDRDMA`.
- No `NET/Socket` or `Using network Socket` data-path fallback.

## Measured application result

After the transport checks passed, the same two-node P5 topology completed a
16-rank Qwen 27B LoRA training run. The result includes rank-0 application
metrics, telemetry for all 16 H100 GPUs, and On-Demand cost economics:

- [Qwen 27B DDP training comparison](results/qwen27b-ddp-training-comparison.md)

The comparison is intentionally labeled directional because the P5 run used a
larger global batch and fewer optimizer steps than the earlier G6e and G7e
runs. It proves the scale-out and observability path; it is not presented as a
strict model-quality benchmark.

## Cleanup

Cleanup removes only lab resources; it does not resize nodes:

```bash
kubectl --context "$KUBE_CONTEXT" -n "$NS" delete \
  pod/p5-dlc-inventory \
  pod/p5-nccl-intranode \
  pod/p5-nccl-internode-0 \
  pod/p5-nccl-internode-1 \
  service/p5-nccl-internode \
  configmap/p5-nccl-preflight \
  --ignore-not-found
```
