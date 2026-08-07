# Hardware inventory observed on 2026-08-06

| Area | Per node | Two-node fleet |
| --- | --- | --- |
| Instance | `p5.48xlarge`, Spot | 2 nodes |
| Placement | Same AZ and cluster placement group | One placement boundary |
| GPU | 8 x NVIDIA H100 80 GB HBM3 | 16 H100 GPUs |
| Local GPU fabric | NVSwitch; every pair reported `NV18` | Two NVSwitch domains |
| CPU | 192 vCPUs | 384 vCPUs |
| Host memory | 2 TiB | 4 TiB |
| Local NVMe | 30.4 TB | 60.8 TB |
| Network | 3,200 Gbps aggregate; 32 cards | 64 EFA devices allocated |
| Kubernetes resources | 8 GPUs and 32 EFA devices | 16 GPUs and 64 EFA devices |

Model, dataset, and checkpoint I/O used FSx for Lustre. Root EBS held the OS
and container runtime state; it was not the model-loading path.
