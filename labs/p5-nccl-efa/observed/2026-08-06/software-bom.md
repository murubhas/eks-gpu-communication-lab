# Software bill of materials observed on 2026-08-06

## Host / accelerated AMI

| Component | Version |
| --- | --- |
| EKS AL2023 NVIDIA AMI | `1.34-v20260801` |
| OS | AL2023 `2023.12.20260727` |
| Kernel | `6.12.94-123.192.amzn2023.x86_64` |
| NVIDIA driver | `580.159.03` |
| Fabric Manager | `580.159.03` |
| NVIDIA container toolkit | `1.19.1` |
| EFA package / module | `3.1.0` / `3.1.0g` |
| efa-nv-peermem | `1.2.3` |
| RDMA core | `63.0` |

## AWS PyTorch DLC

| Component | Version or location |
| --- | --- |
| PyTorch | `2.9.0+cu130` |
| CUDA runtime | `13.0` |
| NCCL | `2.27.7+cuda13.0` |
| libfabric | `2.3.1amzn1.0`, `/opt/amazon/efa` |
| aws-ofi-nccl | `1.17.1-1`, `/opt/amazon/ofi-nccl` |
| OFI plugin | `/opt/amazon/ofi-nccl/lib/libnccl-net-ofi.so` |

All ranks used the same pinned public DLC digest recorded in the manifests.
