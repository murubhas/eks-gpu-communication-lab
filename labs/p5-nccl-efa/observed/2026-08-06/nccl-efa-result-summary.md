# NCCL/EFA validation result

## Intra-node

- 8/8 rank success markers.
- NVLS operations present.
- The P5 topology reported an NVSwitch/NVLink domain.

## Inter-node

- 16/16 rank success markers across two nodes.
- 32 EFA devices visible in each pod.
- aws-ofi-nccl `1.17.1` initialized.
- Libfabric selected the `efa-direct` provider and RDMA transport.
- NCCL channels reported `NET/Libfabric/<rail>/GDRDMA`.
- No socket data-path fallback was detected.

This proves collective correctness and transport selection. It does not provide
`algbw`, `busbw`, or application training-throughput measurements.
