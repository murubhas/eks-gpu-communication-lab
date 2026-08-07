# Evidence boundaries

Clear evidence boundaries prevent a conceptual diagram from being mistaken for
a benchmark result.

| Claim | Status | Evidence in this repository |
| --- | --- | --- |
| NVLink/NVSwitch can carry local GPU traffic | Conceptual and observed on P5 | `nvidia-smi topo -m`, NCCL NVLS logs |
| EFA can carry inter-node NCCL through libfabric | Observed on two P5 nodes | Provider, RDMA, Libfabric, GDRDMA, and collective markers |
| GPUDirect avoids host-DRAM staging for bulk payload | Observed transport selection | EFA direct/RDMA/GDRDMA log path |
| The tested NCCL path improves application training throughput | Directionally measured | Qwen 27B DDP result; global batch and optimizer-step count differed from earlier fleets |
| NIXL can use libfabric/EFA for KV transfer | Observed on two P5 nodes | Backend/provider selection, EFA peers, compatibility check, transfer plan, and decode cache hit |
| P/D preserved throughput and tightened p95/p99 for the tested workload | Measured once per arm | Matched 4,096-token synthetic comparison; not a universal result |
| llm-d routing universally improves latency | Not supported | Two llm-d arms diverged; scorer policy and prefix distribution matter |
| NIXL transport bandwidth | Not measured | Run `nixlbench` with VRAM segments and the `LIBFABRIC` backend |
| EFA device counters are exported to Prometheus | Not implemented | The deployment contract and proof limits are documented under `docs/observability/` |
| EFA traffic is attributed to a specific pod, rank, or request | Not implemented | EFA counters are device-level; workload correlation tagging requires additional evidence |

Transport correctness, communication bandwidth, and application performance
are three different proofs. This repository contains the first and third for
the observed NIXL/EFA application path; the independent `nixlbench` bandwidth
proof remains open.
