# Observed P5 NIXL over EFA serving inventory

This document records the exact host, container, Kubernetes, and communication
stack used for the P5 disaggregated-inference experiment on Amazon EKS. The
inventory was collected on 2026-08-07 from two `p5.48xlarge` Spot nodes in
`us-east-2b`.

![P5 NIXL over EFA serving stack](assets/p5-nixl-efa-serving-stack.png)

The measured results and reproducibility notes are in the
[P5 NIXL/EFA inference lab](../../../labs/p5-nixl-efa/README.md). This page is
the software and ownership inventory; the lab report is the performance
evidence. The reason this image was selected, the alternatives considered, and
the upgrade gates are recorded in
[ADR 0001](../../decisions/0001-select-llm-d-aws-for-nixl-efa.md).

## Why the AWS NIXL guide matters

The AWS EC2 guide is the canonical reference for the basic contract:

- NIXL moves KV-cache state between prefill and decode workers.
- AWS EFA uses the NIXL `LIBFABRIC` backend.
- NIXL 1.0 or later is required for EFA.
- libfabric is installed under `/opt/amazon/efa` in the documented setup.
- `fi_info -p efa -t FI_EP_RDM` validates the EFA provider.
- `nixlbench --backend LIBFABRIC` can validate VRAM-to-VRAM transfers.

Reference: [Get started with EFA and NIXL for inference workloads on Amazon
EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/efa-start-nixl.html)

The guide describes a bare-EC2 build using a supported Ubuntu base AMI. Our EKS
deployment uses a different but equivalent ownership split:

| AWS EC2 guide | This Amazon EKS experiment |
| --- | --- |
| Ubuntu host contains the full installed stack | EKS AL2023 NVIDIA AMI owns kernel and device drivers |
| NIXL and libfabric are installed on the host | The `llm-d-aws` image owns NIXL and the libfabric EFA user-space stack |
| EFA devices are attached directly to the process | The EFA device plugin advertises devices and Kubernetes assigns four to each vLLM pod |
| `nixlbench` proves the transport independently | Runtime logs plus a completed P/D request prove the application path; `nixlbench` remains the independent bandwidth test |

This is an architectural inference supported by the observed component
boundaries and runtime logs. It does not mean the guide's Ubuntu-only bare-EC2
installation recipe applies directly to the EKS host.

## Physical and Kubernetes topology

| Area | Observed value |
| --- | --- |
| EC2 fleet | 2 x `p5.48xlarge` Spot |
| Availability Zone | `us-east-2b` |
| Placement | One cluster placement group |
| GPU | 8 x NVIDIA H100 80 GB per node; 16 total |
| Local GPU fabric | One eight-GPU NVSwitch domain per node |
| Network | 32 EFA devices per node; 64 total |
| EFA allocation | 4 EFA devices per one-GPU vLLM pod |
| Prefill topology | 8 pods on node A, one H100 per pod |
| Decode topology | 8 pods on node B, one H100 per pod |
| Model storage | FSx for Lustre, mounted read-only into every model pod |
| Kubernetes namespace | `model-serving` |
| Node group | `p5-48xlarge-inference-efa-spot-node-group` |
| Node label | `workload=inference-p5-efa-eks-spot` |

The four-EFA-per-pod assignment follows the P5 ratio of 32 EFA devices to 8
GPUs. The AWS llm-d reference uses the same allocation guidance for a one-GPU
replica.

## Host AMI inventory

The serving nodes were launched by an EKS managed node group from a pinned
launch-template version.

| Component | Observed value | Ownership |
| --- | --- | --- |
| AMI ID | `ami-0a7670dc126be4255` | EC2 launch template |
| AMI name | `amazon-eks-node-al2023-x86_64-nvidia-1.34-v20260801` | EKS-optimized accelerated AMI |
| AMI type | `AL2023_x86_64_NVIDIA` | EKS managed node group |
| AMI creation | `2026-08-01T06:14:40Z` | AWS-published image |
| EKS release | `1.34.9-20260801` | EKS managed node group |
| OS | Amazon Linux `2023.12.20260727` | Host AMI |
| Kernel | `6.12.94-123.192.amzn2023.x86_64` | Host AMI |
| Kubelet | `v1.34.9-eks-254016e` | Host AMI / EKS |
| containerd | `2.2.5+unknown` | Host AMI |
| NVIDIA driver | `580.159.03` | Host AMI |
| NVIDIA Fabric Manager | `580.159.03` | Host AMI; exact match with driver |
| NVIDIA container toolkit | `1.19.1` | Host AMI |
| EFA package | `3.1.0` | Host AMI |
| EFA kernel module | `3.1.0g` | Host kernel |
| `efa-nv-peermem` | `1.2.3` | Host AMI |
| RDMA core | `63.0` | Host AMI |
| GPU resource | `nvidia.com/gpu`, 8 allocatable per node | NVIDIA device plugin |
| EFA resource | `vpc.amazonaws.com/efa`, 32 allocatable per node | EFA device plugin |

The host software values were previously verified on this exact AMI ID and
release during the P5 training inventory. The serving nodes independently
confirmed the same AMI ID, EKS release, OS, kernel, kubelet, containerd, GPU
count, and EFA count.

## vLLM inference image inventory

The model servers used the AWS-specific llm-d image:

```text
ghcr.io/llm-d/llm-d-aws:v0.8.0
sha256:1bfaabe905e26e60d884d687dcbc4e65027920c7b908ab985a2ebca281510388
```

This image is the inference-runtime equivalent of a DLC in the architecture,
but it is not an AWS Deep Learning Container product. It is a purpose-built
llm-d image containing the AWS-specific EFA and libfabric user-space stack.

| Component | Value | Evidence |
| --- | --- | --- |
| Image | `ghcr.io/llm-d/llm-d-aws:v0.8.0` | Applied manifest and running pod |
| Resolved digest | `sha256:1bfaabe...0388` | GHCR manifest resolution |
| Architecture / OS | `amd64` / Linux | OCI image config |
| Base image metadata | Red Hat UBI 9.6 | OCI image labels |
| CUDA | `13.0.2` | OCI image environment |
| CUDA runtime package | `13.0.96-1` | OCI image environment |
| NCCL | `2.28.3` | OCI image environment |
| vLLM release alignment | `0.23.0` | llm-d v0.8.0 component summary |
| vLLM runtime-reported build | `0.1.dev1+g51f799c1a.precompiled` | Model-server startup log |
| NIXL | `1.2.0` | Model-server startup log |
| Transformers | `5.12.1` | Model-server startup log |
| LMCache package | `0.4.6` | Model-server startup log; not used as the transfer connector |
| libfabric location | `/opt/amazon/efa/lib` and `/opt/amazon/efa/lib64` | OCI `LD_LIBRARY_PATH` and runtime provider logs |
| libfabric backend | `LIBFABRIC` | vLLM KV-transfer configuration |
| libfabric provider | `efa` | `FI_PROVIDER=efa` and runtime logs |
| Device RDMA | Required with `FI_EFA_USE_DEVICE_RDMA=1` | Pod environment |
| GPU registration path | CUDA DMA-BUF available and used | Runtime logs |
| GDRCopy | `gdr_open` failed; GDRCopy was not used | Runtime logs |

Two version strings are intentionally retained for vLLM. The llm-d v0.8.0
release bill of materials declares vLLM 0.23.0, while the custom precompiled
wheel reports its source-build string at runtime. Reporting both is more
accurate than silently replacing either value.

The exact libfabric package semantic version was not emitted into the retained
benchmark evidence. The runtime did prove the `efa` provider and reported its
provider protocol/version tuple. The llm-d AWS requirement is libfabric 1.21 or
later. Capture the package-manager output from a live pod in future runs if the
semantic package version must appear in an audit.

## llm-d and routing inventory

| Component | Observed value | Role |
| --- | --- | --- |
| llm-d release family | `v0.8.0` | Model-server image release |
| Endpoint picker | `v0.9.0` | Chooses ready inference endpoints |
| Decode routing sidecar | `ghcr.io/llm-d/llm-d-router-disagg-sidecar:v0.9.0` | Coordinates P/D request flow and NIXL transfer metadata |
| Envoy | `distroless-v1.33.2` | HTTP proxy in front of EPP |
| Gateway API Inference Extension | `v1.5.0` | InferencePool API contract |
| AIPerf | `0.11.0` | Benchmark client |
| Metrics | vLLM PodMonitors plus DCGM exporter | Application and per-GPU telemetry |

The scheduler and sidecar control where a request runs. They are not in the
bulk KV data path. KV tensors move directly between the prefill and decode
model-server processes through NIXL and libfabric/EFA.

## Effective model-server configuration

Both prefill and decode pods used the same FP8 model and core engine settings.

| Setting | Value |
| --- | --- |
| Model | Qwen3.6 27B dense, FP8 checkpoint mounted from FSx for Lustre |
| Tensor parallelism | `1` |
| Max model length | `8192` |
| Max sequences | `1` |
| Max batched tokens | `8192` |
| KV-cache dtype | `fp8_e4m3` |
| Prefix caching | Enabled |
| Chunked prefill | Enabled |
| Block size | `128` |
| GPU memory utilization | `0.90` |
| KV connector | `NixlConnector` |
| KV role | `kv_both` |
| NIXL backend | `LIBFABRIC` |
| NIXL side-channel port | `5600` |
| GPU request | `1` per pod |
| EFA request | `4` per pod |
| CPU / memory request | `8` vCPU / `64Gi` per model pod |

## End-to-end data path

```text
HTTP request
  -> Envoy and EPP
  -> decode routing sidecar
  -> selected prefill and decode endpoints

KV-cache payload
  prefill H100 VRAM
  -> vLLM NixlConnector
  -> NIXL LIBFABRIC backend
  -> libfabric EFA provider
  -> four EFA rails selected for the pod
  -> EFA / SRD device-RDMA path
  -> four EFA rails on the peer pod
  -> libfabric EFA provider
  -> NIXL LIBFABRIC backend
  -> decode H100 VRAM

Output tokens
  -> decode routing sidecar
  -> Envoy
  -> client
```

Control and payload are different paths. Kubernetes, EPP, Envoy, and the NIXL
side channel exchange endpoint and transfer metadata. The large KV tensors use
the NIXL/libfabric/EFA data path.

## Runtime proof collected

| Gate | Evidence observed | Meaning |
| --- | --- | --- |
| Hardware exposure | 8 GPUs and 32 EFA devices allocatable per P5 node | The host and device plugins exposed the expected hardware |
| Pod allocation | 1 GPU and 4 EFA resources requested per model pod | Kubernetes assigned the intended GPU-to-EFA ratio |
| NIXL loaded | `NIXL is available` | The connector library initialized |
| Backend loaded | `LIBFABRIC` in the vLLM config | The AWS transport backend was explicitly selected |
| Provider selected | `provider=efa` | libfabric did not fall back to sockets or another provider |
| Multi-rail selection | Four EFA devices selected in each inspected pod | The pod used its assigned EFA rails |
| GPU registration | CUDA DMA-BUF support reported and GPU memory registered | GPU memory was registered for device-RDMA transfers |
| Peer connectivity | Cross-node EFA peer-address insertion and handshake logs | Prefill and decode processes established the EFA path |
| Compatibility | `NIXL compatibility check passed` | The two agents accepted the transfer contract |
| Transfer plan | `TransferTopology` was created | NIXL planned the point-to-point transfer |
| Application result | Decode external-prefix-cache hits reached 100% in smoke | Decode consumed transferred prefix state |

Attaching EFA resources alone is not proof. The provider, device selection,
peer handshake, compatibility check, and successful decode hit form the
end-to-end evidence chain.

## Commands for a fresh inventory run

Resolve and pin the image:

```bash
DOCKER_CONFIG=/tmp/empty-docker-config \
  crane digest ghcr.io/llm-d/llm-d-aws:v0.8.0
```

Capture package versions from a live model pod:

```bash
kubectl -n <serving-namespace> exec <model-pod> -- bash -lc '
  python - <<"PY"
from importlib.metadata import PackageNotFoundError, version
for package in ("vllm", "nixl", "torch", "transformers", "lmcache"):
    try:
        print(f"{package}={version(package)}")
    except PackageNotFoundError:
        print(f"{package}=not-installed")
PY
  /opt/amazon/efa/bin/fi_info -p efa -t FI_EP_RDM | head -n 40
  rpm -qa | grep -Ei "libfabric|efa|nixl|nccl" | sort
  ls -1 /dev/infiniband/uverbs* | wc -l
  nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
'
```

The repository helper captures the same inventory, including the resolved
image, selected container resources, libfabric package/provider information,
communication environment, and assigned RDMA devices:

```bash
export CONTEXT='<your-EKS-context>'
export NAMESPACE='gpu-communication-lab'
export POD='<running-model-pod>'
export CONTAINER='modelserver'

bash labs/p5-nixl-efa/scripts/inventory_llmd_aws_runtime.sh \
  > llmd-aws-runtime-inventory.txt
```

Review generated output for private cluster identifiers before publishing it.

Confirm the pod resource contract:

```bash
kubectl -n <serving-namespace> get pod <model-pod> \
  -o jsonpath='{.spec.containers[?(@.name=="modelserver")].resources}'
```

Confirm the runtime path from logs:

```bash
kubectl -n <serving-namespace> logs <model-pod> -c modelserver | \
  grep -E 'NIXL|LIBFABRIC|provider=efa|dma.?buf|EFA|compatibility|TransferTopology|external prefix'
```

For a transport-only benchmark independent of vLLM, use `nixlbench` with the
`LIBFABRIC` backend and VRAM initiator/target segments as documented by AWS and
llm-d.

## References

- [AWS EC2: Get started with EFA and NIXL](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/efa-start-nixl.html)
- [AWS Machine Learning Blog: Disaggregated inference powered by llm-d](https://aws.amazon.com/blogs/machine-learning/introducing-disaggregated-inference-on-aws-powered-by-llm-d/)
- [llm-d: RDMA and networking configuration](https://llm-d.ai/docs/dev/infrastructure/rdma)
- [llm-d v0.8.0 release component summary](https://github.com/llm-d/llm-d/releases/tag/v0.8.0)

## Observed cleanup state

After the experiment, temporary homogeneous, prefill, decode, control, and P/D
router deployments were scaled to zero. The P5 serving node group was returned
to desired `0`, and the routing node pool returned to its pre-test size. These
are observed cleanup facts, not commands embedded in the lab.
