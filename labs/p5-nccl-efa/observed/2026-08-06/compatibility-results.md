# Compatibility results

| Contract | Evidence | Result |
| --- | --- | --- |
| Driver and Fabric Manager exact lockstep | Both `580.159.03`; service active | Pass |
| Driver supports DLC CUDA | PyTorch CUDA initialization and collectives | Pass |
| EFA kernel and libfabric provider | `fi_info` discovers EFA | Pass |
| NCCL and aws-ofi-nccl ABI | OFI plugin initializes and selects Libfabric | Pass |
| Same image on every rank | One pinned DLC digest | Pass |

Compatibility was accepted based on working initialization and collectives;
the versions did not need identical numbers across the AMI/DLC boundary.
