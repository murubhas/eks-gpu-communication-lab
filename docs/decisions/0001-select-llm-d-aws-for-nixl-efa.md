# ADR 0001: Select the published llm-d AWS runtime for NIXL over EFA

- Status: Accepted for the measured P5 lab
- Decision date: 2026-08-07
- Scope: Disaggregated vLLM inference on Amazon EKS with NIXL over EFA

## Context

The P5 serving experiment needed more than a container that could start vLLM.
The runtime also had to provide a version-compatible implementation of the
following chain:

```text
vLLM NixlConnector
  -> NIXL LIBFABRIC backend
  -> libfabric efa provider
  -> EFA / SRD device-RDMA path
```

The host AMI already owned the kernel, NVIDIA driver, EFA kernel module, RDMA
devices, and peer-memory support. The container needed the matching user-space
libraries and the llm-d/vLLM integration used by the routing and prefill/decode
manifests.

## Decision

Use the published AWS-specific llm-d image and pin its resolved digest:

```text
ghcr.io/llm-d/llm-d-aws:v0.8.0
sha256:1bfaabe905e26e60d884d687dcbc4e65027920c7b908ab985a2ebca281510388
```

This repository did not build or publish `llm-d-aws`. It selected the image,
verified its contents at runtime, and proved the application data path. The
complete observed bill of materials is in the
[P5 NIXL/EFA serving inventory](../reference-stacks/p5-two-node-efa/nixl-efa-serving-inventory.md).

## Selection criteria

| Requirement | Why it mattered | Acceptance evidence |
| --- | --- | --- |
| Supported vLLM KV connector contract | Prefill and decode workers must exchange KV-cache state | `NixlConnector` initialized and a P/D request completed |
| NIXL with `LIBFABRIC` | EFA is reached through NIXL's libfabric backend | Runtime configuration reported `LIBFABRIC` |
| libfabric `efa` provider | Prevents an unintended socket or non-EFA transport | Logs reported `provider=efa`; `fi_info` is available in the image |
| Device-RDMA-capable GPU registration | Bulk KV state should move without host-DRAM staging | CUDA DMA-BUF registration was observed |
| Compatible llm-d component family | EPP, sidecar, and model servers must agree on their contracts | Smoke request and endpoint selection succeeded |
| Compatible CUDA and host driver | Container CUDA must initialize against the AMI driver | CUDA initialized on the pinned R580 host driver |
| Immutable deployment artifact | Every worker must execute the same runtime | The image digest was resolved and recorded |
| Observable failure modes | Transport selection and fallback must be provable | Provider, device, peer, compatibility, and transfer-plan logs were retained |

## Observed ownership and versions

The versions below describe the measured pairing. They are not a universal
compatibility matrix for future tags.

| Layer | Component | Observed value |
| --- | --- | --- |
| Host AMI | NVIDIA driver / Fabric Manager | `580.159.03` / `580.159.03` |
| Host AMI | EFA package / kernel module | `3.1.0` / `3.1.0g` |
| Host AMI | `efa-nv-peermem` | `1.2.3` |
| Host AMI | RDMA core | `63.0` |
| Container | CUDA | `13.0.2` |
| Container | NIXL | `1.2.0` |
| Container | NCCL | `2.28.3` |
| Container | vLLM | llm-d release alignment `0.23.0`; runtime build string retained separately |
| Container | libfabric | Installed under `/opt/amazon/efa`; exact package version was not retained |
| Container | libfabric provider | `efa`, verified at runtime |
| Container | LMCache package | `0.4.6`, present but not used as the P/D transfer connector |

NCCL is present in the image, but it was not the bulk KV-transfer path in this
TP=1 experiment. Keep the two communication paths distinct:

```text
P/D KV transfer:
  vLLM -> NIXL -> LIBFABRIC -> libfabric efa -> EFA / SRD

Distributed collectives when used:
  framework -> NCCL -> aws-ofi-nccl -> libfabric efa -> EFA / SRD
```

`aws-ofi-nccl` is required for NCCL-over-EFA. It is not required merely because
NIXL uses EFA through its native libfabric backend.

## Runtime configuration contract

The measured model pods explicitly selected the intended provider and required
device RDMA:

```text
FI_PROVIDER=efa
FI_EFA_USE_DEVICE_RDMA=1
VLLM_NIXL_SIDE_CHANNEL_PORT=5600
```

The vLLM KV configuration selected `NixlConnector`, the `kv_both` role, and the
`LIBFABRIC` backend. Each one-GPU P5 model pod requested four
`vpc.amazonaws.com/efa` devices, matching the node's 32-EFA-to-8-GPU ratio.

## Alternatives considered

### AWS vLLM Server DLC

This is the preferred first baseline for standard homogeneous serving on
EC2/EKS when it supports the required model and engine configuration. It was
not selected as a drop-in substitute for this measured P/D arm because the
exact llm-d sidecar, NIXL connector, and EFA integration still required an
independent compatibility run. A future AWS DLC may satisfy the same contract;
the gates below decide that, not the product label alone.

### Generic upstream vLLM image

This would require independently adding and validating the AWS EFA libfabric
provider, NIXL backend, device-RDMA prerequisites, and llm-d release alignment.
That increased the number of variables in a transport experiment.

### Custom image assembled from a CUDA base

This gives maximum control but transfers ownership of the CUDA, vLLM, NIXL,
NCCL, libfabric, and OS-security matrix to the operator. It was unnecessary for
the measured experiment.

## Upgrade and replacement gates

Do not replace the pinned image because a newer tag exists. Re-evaluate it when
the model, host AMI, vLLM connector API, llm-d release, CUDA major version, or
security requirements change. A candidate image must pass all of these gates:

1. Resolve and record its immutable digest and architecture.
2. Inventory CUDA, vLLM, NIXL, NCCL, libfabric, the `efa` provider, and relevant
   Python packages.
3. Verify the host driver supports the container CUDA runtime.
4. Verify the expected GPU and EFA devices are allocated inside each pod.
5. Run `fi_info -p efa -t FI_EP_RDM` inside the model container.
6. Run `nixlbench` with `LIBFABRIC` and VRAM segments for transport-only proof.
7. Require runtime evidence for provider selection, GPU registration, peer
   exchange, compatibility, and transfer-plan creation.
8. Complete one P/D request and observe a decode-side external-prefix hit.
9. Re-run the controlled application benchmark and compare all latency and
   throughput metrics, not only transport initialization.

Use
[`inventory_llmd_aws_runtime.sh`](../../labs/p5-nixl-efa/scripts/inventory_llmd_aws_runtime.sh)
to capture the live container inventory. Its output is run evidence and should
be reviewed for private identifiers before publication.

## Derivative-image policy

If an application-specific image becomes necessary, build a thin derivative
from the validated digest rather than reconstructing the communication stack.
Record the Dockerfile, lock file, base digest, generated SBOM, vulnerability
scan, and package diff. Re-run every upgrade gate above. Avoid replacing core
packages such as vLLM, PyTorch, CUDA, NIXL, NCCL, or libfabric without treating
the result as a new runtime qualification.

## Consequences

- The lab has an explicit, reproducible image-selection rationale.
- The exact digest and measured compatibility boundary are retained.
- Runtime proof remains separate from vendor support claims.
- Upgrades require deliberate requalification rather than a mutable-tag pull.
- The exact libfabric semantic version remains a known evidence gap until it
  is captured from a live pod with the inventory helper.

## References

- [AWS EC2: Get started with EFA and NIXL](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/efa-start-nixl.html)
- [AWS ML Blog: Disaggregated inference on AWS powered by llm-d](https://aws.amazon.com/blogs/machine-learning/introducing-disaggregated-inference-on-aws-powered-by-llm-d/)
- [llm-d RDMA and networking configuration](https://llm-d.ai/docs/dev/infrastructure/rdma)
- [llm-d operations guide for vLLM disaggregation](https://llm-d.ai/docs/architecture/advanced/disaggregation/operations-vllm)
