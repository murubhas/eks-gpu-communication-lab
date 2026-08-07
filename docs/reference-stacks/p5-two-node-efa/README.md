# Two-node P5 GPU communication stack

This package records two exact stacks observed on two `p5.48xlarge` Spot nodes
in Amazon EKS:

- A 2026-08-06 PyTorch DDP training stack using NCCL over NVSwitch and EFA.
- A 2026-08-07 disaggregated inference stack using NIXL, libfabric, and EFA to
  transfer KV-cache state between prefill and decode workers.

Both stacks separate host-owned AMI components from container-owned user-space
components. Their communication semantics are different even though both use
the same EFA hardware foundation.

The training checks prove transport selection and collective correctness. The
serving checks prove NIXL/EFA selection and application-level KV transfer. They
are not bandwidth benchmarks: use `nccl-tests` for NCCL bandwidth and
`nixlbench` for NIXL transfer bandwidth.

## Diagrams

- [Two-node hardware, AMI, and DLC stack](assets/p5-two-node-hardware-ami-dlc-stack.png)
- [NVSwitch and EFA verification path](assets/p5-nccl-efa-verification-path.png)
- [NIXL over EFA serving stack](assets/p5-nixl-efa-serving-stack.png)

The editable SVG versions are beside the PNG files. From the repository root,
regenerate all diagrams after installing dependencies:

```bash
npm install
npm run build:diagrams
```

## Observed fleet

| Area | Per-node value | Two-node fleet |
| --- | --- | --- |
| Instance | `p5.48xlarge`, Spot | 2 nodes |
| Placement | `us-east-2b`, one cluster placement group | Same AZ and placement group |
| GPU | 8 x NVIDIA H100 80GB HBM3, 81,559 MiB usable each | 16 H100 GPUs |
| Local GPU fabric | Every GPU pair reported `NV18`; NCCL used NVLS | Two independent 8-GPU NVSwitch domains |
| CPU | 192 vCPUs, 96 cores, 2 threads/core | 384 vCPUs |
| Host memory | 2 TiB | 4 TiB |
| Local NVMe | 30.4 TB, 8 x 3.8 TB SSD | 60.8 TB |
| EBS capability | 80 Gbps, 10,000 MB/s, 260,000 IOPS | Per-node limit |
| Root volume | 1,000 GiB `gp3` launch-template override | 2,000 GiB total |
| Network | 3,200 Gbps aggregate, 32 network cards | 32 EFA devices per node |
| Interfaces | Primary ENA plus 32 EFA-only interfaces | 2 ENA plus 64 EFA-only interfaces |
| Kubernetes allocatable | 8 `nvidia.com/gpu`, 32 `vpc.amazonaws.com/efa` | 16 GPUs, 64 EFA devices |

## Two runtime profiles on one host foundation

| Area | Training profile | Inference profile |
| --- | --- | --- |
| Application | PyTorch DDP | vLLM with llm-d P/D routing |
| Communication semantics | NCCL collectives | NIXL registered-state transfer |
| Container | AWS PyTorch training DLC extension | `llm-d-aws:v0.8.0` |
| EFA adapter | aws-ofi-nccl to libfabric | Native NIXL `LIBFABRIC` backend |
| Payload | Gradients and collective buffers | KV-cache blocks |
| Independent bandwidth tool | `nccl-tests` | `nixlbench` |

The full inference software bill of materials, engine contract, and proof chain
are in the [NIXL/EFA serving inventory](nixl-efa-serving-inventory.md). The
image-selection rationale and requalification gates are in
[ADR 0001](../../decisions/0001-select-llm-d-aws-for-nixl-efa.md). The
measured method and result are in the [P5 NIXL/EFA inference lab](../../../labs/p5-nixl-efa/README.md).

## Training software bill of materials

### AMI and host layer

| Component | Observed value | Resides in / owned by |
| --- | --- | --- |
| AMI ID | `ami-0a7670dc126be4255` | EC2 launch template |
| AMI name | `amazon-eks-node-al2023-x86_64-nvidia-1.34-v20260801` | EKS-optimized accelerated AMI |
| OS | Amazon Linux `2023.12.20260727` | Host AMI |
| Kernel | `6.12.94-123.192.amzn2023.x86_64` | Host AMI |
| Kubernetes node | `v1.34.9-eks-254016e` | Host AMI / EKS |
| containerd | `2.2.5+unknown` | Host AMI |
| NVIDIA driver | `580.159.03` | Host AMI |
| NVIDIA Fabric Manager | `580.159.03`, active | Host AMI |
| NVIDIA container toolkit | `1.19.1` | Host AMI |
| EFA package | `efa-3.1.0-1.amzn2023` | Host AMI |
| EFA kernel module | `3.1.0g` | Host kernel |
| EFA config | `efa-config 1.18` | Host AMI |
| GPU peer-memory support | `efa-nv-peermem 1.2.3` installed | Host AMI |
| RDMA core | `rdma-core 63.0`, `libibverbs 63.0`, `librdmacm 63.0` | Host AMI |
| EFA devices | 32 entries under `/sys/class/infiniband` | Host kernel and PCI devices |
| EFA device plugin | chart `v0.5.29`, image `v0.5.20` | Kubernetes `kube-system` DaemonSet |
| EFA resource name | `vpc.amazonaws.com/efa` | Advertised by EFA device plugin |
| GPU resource name | `nvidia.com/gpu` | Advertised by NVIDIA device plugin |
| DCGM | `4.3.1-1-ubuntu22.04` | GPU Operator operand |
| DCGM exporter | `4.3.1-4.4.0-ubuntu22.04` | GPU Operator operand |

The NVIDIA driver is AMI-owned. There is no NVIDIA driver DaemonSet on these
nodes. The GPU Operator supplies device discovery, device allocation, MIG
management, validation, DCGM, and DCGM exporter components.

The host has the EFA kernel and RDMA device layer. It does not contain the DLC's
`/opt/amazon/efa` and `/opt/amazon/ofi-nccl` user-space stacks.

### DLC and container layer

The selected training image is a thin extension of this public AWS DLC:

```text
public.ecr.aws/deep-learning-containers/pytorch-training:
2.9.0-gpu-py312-cu130-ubuntu22.04-ec2
sha256:c5af70b4143d7b1878567cc198c5a7961aff15e8c59fec35c2fb3cbd097cddcd
```

Application-specific extension layers are not published by this repository.
Build them from the public DLC, validate them, and pin their digest before use.

| Component | Observed value | Resides in / owned by |
| --- | --- | --- |
| Container OS | Ubuntu 22.04.5 LTS | DLC image |
| Python | 3.12.10 | DLC image |
| PyTorch | `2.9.0+cu130` | DLC image |
| CUDA runtime | 13.0 | DLC image |
| `nvcc` | 13.0.48 | DLC image |
| cuDNN | 9.13.0 | DLC image |
| NCCL | `2.27.7+cuda13.0` | DLC image |
| Open MPI | 4.1.7 | DLC image |
| libfabric | `2.3.1amzn1.0` | `/opt/amazon/efa` in DLC |
| libfabric provider check | `/opt/amazon/efa/bin/fi_info` | DLC image |
| aws-ofi-nccl | `1.17.1-1` | `/opt/amazon/ofi-nccl` in DLC |
| NCCL OFI plugin | `libnccl-net-ofi.so` | `/opt/amazon/ofi-nccl/lib` |
| NCCL plugin entry point | `libnccl-net.so` | `/opt/amazon/ofi-nccl/lib` |
| Plugin dependency | `libfabric.so.1` | `/opt/amazon/efa/lib/libfabric.so.1` |
| transformers | `5.13.0.dev0` | Custom image Python environment |
| TRL | `1.7.0` | Custom image Python environment |
| PEFT | `0.19.1` | Custom image Python environment |
| bitsandbytes | `0.49.2` | Custom image Python environment |
| datasets | `5.0.0` | Custom image Python environment |
| accelerate | `1.14.0` | Custom image Python environment |
| flash-attn | `2.8.3` | Custom image Python environment |
| prometheus-client | `0.25.0` | Custom image Python environment |

The communication stack is layered, not interchangeable:

```text
PyTorch DDP
  -> NCCL 2.27.7
  -> aws-ofi-nccl 1.17.1
  -> libfabric 2.3.1, efa provider
  -> EFA / SRD
```

`aws-ofi-nccl` adapts NCCL's network-plugin API to libfabric. It does not
replace libfabric. The primary ENA and Kubernetes DNS are used for rendezvous
and bootstrap; the GPU collective payload must select `NET/Libfabric` over EFA.

EFA is not part of the intra-node GPU path. Inside each P5 node, NCCL uses the
H100 NVSwitch/NVLink fabric. EFA becomes the data transport only when ranks on
different nodes exchange collective payloads. The verification is therefore a
two-part proof: local NVSwitch first, inter-node EFA second.

The inter-node manifests make the intended transport explicit:

| Setting | Value | Purpose |
| --- | --- | --- |
| `FI_PROVIDER` | `efa` | Select the libfabric EFA provider |
| `FI_EFA_USE_DEVICE_RDMA` | `1` | Require device RDMA support |
| `NCCL_NET_PLUGIN` | `ofi` | Load the aws-ofi-nccl network plugin |
| `NCCL_SOCKET_IFNAME` | `eth0` | Use standard networking for rendezvous/bootstrap |
| `NCCL_DEBUG` | `INFO` | Emit transport-selection evidence |
| `NCCL_DEBUG_SUBSYS` | `INIT,NET,GRAPH` | Include initialization, network, and topology logs |
| `vpc.amazonaws.com/efa` | `32` per pod | Allocate every EFA device on each P5 node |

## How to choose the AMI and DLC pair

There is no one-to-one AMI-to-DLC mapping. Select each side from its own
requirements, then validate the compatibility boundary. The proven pairing in
this lab deliberately uses an AL2023 host AMI with an Ubuntu 22.04 DLC: the
container shares the host kernel and NVIDIA driver, but brings its own user
space and framework libraries.

1. **Start with the EC2 accelerator and EKS version.** For `p5.48xlarge` on an
   x86 EKS cluster, select the latest recommended EKS-optimized AL2023 NVIDIA
   AMI for that Kubernetes version. This supplies the tested kernel, NVIDIA
   driver, matching Fabric Manager, container toolkit, and EFA host layer.
2. **Choose the DLC from the application upward.** Select training versus
   inference, framework and framework version, Python version, GPU/CUDA
   variant, available container OS base, and the EC2/EKS platform variant.
   The OS base is selected by choosing a published image tag; it is not a
   runtime switch, and not every framework/version is published on both AL2023
   and Ubuntu. For distributed EFA training,
   use an AWS DLC that includes the EFA/libfabric and NCCL OFI stack; older
   Ubuntu tags identify the EC2 variant with an `-ec2` suffix.
3. **Check the compatibility contracts.** The host NVIDIA driver must satisfy
   the DLC CUDA runtime's minimum driver requirement. The EFA kernel layer must
   initialize the DLC's libfabric EFA provider, and aws-ofi-nccl must load
   against the DLC's NCCL plugin ABI.
4. **Run the preflight before training.** Require CUDA initialization,
   `fi_info` success, correct intra-node and inter-node collectives,
   `efa-direct`, `RDMA`, `Libfabric`, and `GDRDMA` log evidence, with no socket
   network fallback.
5. **Pin both artifacts after validation.** Record the EKS AMI release/ID and
   use the same DLC digest on every rank. Re-run the preflight whenever either
   side changes.

Retrieve the current EKS-recommended AMI instead of hard-coding an old image:

```bash
aws ssm get-parameter \
  --name /aws/service/eks/optimized-ami/<kubernetes-version>/amazon-linux-2023/x86_64/nvidia/recommended/image_id \
  --region <region> \
  --query 'Parameter.Value' \
  --output text
```

Use the [AWS DLC available-images catalog](https://aws.github.io/deep-learning-containers/reference/available_images/)
to choose the framework, Python, CUDA, accelerator, and EC2/EKS variant. Then
resolve and deploy a digest rather than relying indefinitely on a mutable tag.

### Compatibility summary

| Boundary | Rule | Observed pairing | Validation |
| --- | --- | --- | --- |
| NVIDIA driver to Fabric Manager | Exact lockstep | `580.159.03` to `580.159.03` | Fabric Manager active; NVSwitch topology healthy |
| Host driver to DLC CUDA | Compatible, not equal | R580 to CUDA 13.0 | PyTorch CUDA initialization and collectives pass |
| Host EFA to DLC libfabric | Compatible provider/kernel ABI | EFA 3.1 to libfabric 2.3.1 | `fi_info` selects EFA; logs show `efa-direct` and RDMA |
| DLC NCCL to aws-ofi-nccl | Compatible NCCL plugin ABI | NCCL 2.27.7 to aws-ofi-nccl 1.17.1 | `NET/OFI` initializes and NCCL selects Libfabric |
| Rank-to-rank application environment | Exact image digest | Same pinned DLC digest | Every rank reports the same software stack |

## Reproduce the inventory

Set the context once:

```bash
export TRAIN_CONTEXT="<your-EKS-context>"
export NS=gpu-communication-lab
export P5_SELECTOR='workload=p5-efa-lab'
```

Check allocatable GPUs and EFA devices:

```bash
kubectl --context "$TRAIN_CONTEXT" get nodes -l "$P5_SELECTOR" \
  -o 'custom-columns=NAME:.metadata.name,AZ:.metadata.labels.topology\.kubernetes\.io/zone,GPU:.status.allocatable.nvidia\.com/gpu,EFA:.status.allocatable.vpc\.amazonaws\.com/efa'
```

Inspect the EC2 specification from the AWS API:

```bash
aws ec2 describe-instance-types \
  --instance-types p5.48xlarge \
  --query 'InstanceTypes[0].{VCpu:VCpuInfo,Memory:MemoryInfo,GPU:GpuInfo,Network:NetworkInfo,Storage:InstanceStorageInfo,EBS:EbsInfo}'
```

Inspect one host through Systems Manager. Obtain an instance ID from a node's
provider ID, then run:

```bash
INSTANCE_ID="$(kubectl --context "$TRAIN_CONTEXT" get node <p5-node-name> \
  -o jsonpath='{.spec.providerID}' | awk -F/ '{print $NF}')"

COMMAND_ID="$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["cat /etc/os-release","uname -r","kubelet --version","containerd --version","nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader","nvidia-smi topo -m","systemctl is-active nvidia-fabricmanager","modinfo efa | head -n 8","rpm -qa | grep -E \"^(efa|rdma-core|libibverbs|librdmacm|nvidia-container-toolkit)\" | sort","ls -1 /sys/class/infiniband | wc -l"]' \
  --query 'Command.CommandId' --output text)"

aws ssm wait command-executed --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID"
aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --query StandardOutputContent --output text
```

Inspect the DLC's user-space stack:

```bash
kubectl --context "$TRAIN_CONTEXT" apply \
  -f labs/p5-nccl-efa/manifests/00-dlc-inventory.yaml
kubectl --context "$TRAIN_CONTEXT" -n "$NS" wait pod/p5-dlc-inventory \
  --for=condition=Ready --timeout=10m

kubectl --context "$TRAIN_CONTEXT" -n "$NS" exec p5-dlc-inventory -- bash -lc '
  cat /etc/os-release
  python --version
  python -c "import torch; print(torch.__version__, torch.version.cuda, torch.backends.cudnn.version(), torch.cuda.nccl.version())"
  nvcc --version
  mpirun --version
  dpkg-query -W "libfabric*" "libnccl-ofi*" 2>/dev/null
  ls -l /opt/amazon/ofi-nccl/lib/libnccl-net*.so
  ldd /opt/amazon/ofi-nccl/lib/libnccl-net-ofi.so | grep libfabric
  /opt/amazon/efa/bin/fi_info -p efa -t FI_EP_RDM >/dev/null && echo FI_INFO_EFA_OK
  ls -1 /dev/infiniband/uverbs* | wc -l
'
```

## Prove intra-node NVSwitch/NVLink collectives

Create the checker ConfigMap and launch one pod with all eight GPUs. Run these
commands from the repository root:

```bash
kubectl --context "$TRAIN_CONTEXT" -n "$NS" create configmap p5-nccl-preflight \
  --from-file=efa_nccl_preflight.py=labs/p5-nccl-efa/scripts/efa_nccl_preflight.py \
  --dry-run=client -o yaml | kubectl --context "$TRAIN_CONTEXT" apply -f -

kubectl --context "$TRAIN_CONTEXT" apply \
  -f labs/p5-nccl-efa/manifests/10-intranode-nccl.yaml
kubectl --context "$TRAIN_CONTEXT" -n "$NS" wait pod/p5-nccl-intranode \
  --for=jsonpath='{.status.phase}'=Succeeded --timeout=10m
```

Validate all eight ranks and inspect the local path:

```bash
INTRA_LOG="$(kubectl --context "$TRAIN_CONTEXT" -n "$NS" logs p5-nccl-intranode)"
test "$(printf '%s' "$INTRA_LOG" | grep -o EFA_NCCL_PREFLIGHT_COLLECTIVE_OK | wc -l | tr -d ' ')" -eq 8
printf '%s\n' "$INTRA_LOG" | grep -E 'NVLS|Connected all rings|GDR 1|EFA_NCCL_PREFLIGHT_COLLECTIVE_OK'
```

Observed result:

```text
8/8 success markers
NCCL NVLS operations present
Connected all rings ... GDR 1
```

The `nvidia-smi topo -m` matrix is the hardware-topology proof. The collective
and NCCL logs prove the software used that local GPU fabric.

## Prove inter-node NCCL over EFA and GPUDirect RDMA

Free the completed intra-node pod, then launch one 8-GPU, 32-EFA pod on each
node:

```bash
kubectl --context "$TRAIN_CONTEXT" -n "$NS" delete pod p5-nccl-intranode --ignore-not-found
kubectl --context "$TRAIN_CONTEXT" apply \
  -f labs/p5-nccl-efa/manifests/20-internode-nccl-efa.yaml
kubectl --context "$TRAIN_CONTEXT" -n "$NS" wait pod -l app=p5-nccl-internode \
  --for=jsonpath='{.status.phase}'=Succeeded --timeout=15m
```

Fail closed if any rank is missing or NCCL used its socket data transport:

```bash
for pod in p5-nccl-internode-0 p5-nccl-internode-1; do
  LOG="$(kubectl --context "$TRAIN_CONTEXT" -n "$NS" logs "$pod")"
  test "$(printf '%s' "$LOG" | grep -o EFA_NCCL_PREFLIGHT_COLLECTIVE_OK | wc -l | tr -d ' ')" -eq 8
  ! printf '%s\n' "$LOG" | grep -Eq 'NET/Socket|Using network Socket'
  printf '%s\n' "$LOG" | grep -m1 'Selected provider is efa, fabric is efa-direct'
  printf '%s\n' "$LOG" | grep -m1 'Using transport protocol RDMA'
  printf '%s\n' "$LOG" | grep -m1 'Using network Libfabric'
  printf '%s\n' "$LOG" | grep -m1 'via NET/Libfabric/.*/GDRDMA'
done
```

Observed result:

```text
16/16 success markers across two nodes
32 EFA devices visible in each pod
NCCL version 2.27.7+cuda13.0
NET/OFI Initializing aws-ofi-nccl 1.17.1
NET/OFI Using Libfabric version 2.3
NET/OFI Selected provider is efa, fabric is efa-direct (found 32 nics)
NET/OFI Using transport protocol RDMA (platform set)
NCCL INFO Using network Libfabric
NCCL channels via NET/Libfabric/<rail>/GDRDMA
0 matches for NET/Socket or Using network Socket
```

This is end-to-end evidence for the selected DLC and these two nodes:

1. Kubernetes allocated the EFA devices.
2. libfabric initialized the EFA provider.
3. aws-ofi-nccl connected NCCL to libfabric.
4. NCCL selected RDMA over the `efa-direct` fabric.
5. NCCL channels reported `GDRDMA`, proving the GPU-direct network path.
6. All 16 ranks returned the mathematically correct all-reduce result.

## Cleanup only the verification resources

These commands do not resize or delete the P5 node group:

```bash
kubectl --context "$TRAIN_CONTEXT" -n "$NS" delete \
  pod/p5-dlc-inventory \
  pod/p5-nccl-intranode \
  pod/p5-nccl-internode-0 \
  pod/p5-nccl-internode-1 \
  service/p5-nccl-internode \
  configmap/p5-nccl-preflight \
  --ignore-not-found
```

## References

- [Amazon EC2 P5 multi-card EFA configuration](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/efa-acc-inst-types.html)
- [Amazon EKS: manage EFA devices](https://docs.aws.amazon.com/eks/latest/userguide/device-management-efa.html)
- [Amazon EKS: run machine-learning training with EFA](https://docs.aws.amazon.com/eks/latest/userguide/node-efa.html)
- [AWS aws-ofi-nccl plugin](https://github.com/aws/aws-ofi-nccl)
- [NVIDIA NCCL logging](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting/logging.html)
- [NVIDIA NCCL GPU Direct troubleshooting](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting/gpu_troubleshooting.html)
