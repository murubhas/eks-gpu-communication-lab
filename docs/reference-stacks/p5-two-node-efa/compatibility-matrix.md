# Observed P5 AMI/DLC compatibility matrix

This matrix records the pairing validated on 2026-08-06. Version equality is
required only where explicitly stated.

| Boundary | Rule | Observed pairing | Result |
| --- | --- | --- | --- |
| NVIDIA driver / Fabric Manager | Exact lockstep | `580.159.03` / `580.159.03` | Pass |
| Host driver / DLC CUDA | Compatible | R580 / CUDA 13.0 | Pass |
| EFA kernel / libfabric | Compatible provider ABI | EFA 3.1 / libfabric 2.3.1 | Pass |
| NCCL / aws-ofi-nccl | Compatible plugin ABI | NCCL 2.27.7 / aws-ofi-nccl 1.17.1 | Pass |
| Rank application image | Exact digest | One pinned DLC digest | Pass |

Compatibility was proven through initialization and working collectives, not
assumed from version strings.
