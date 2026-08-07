# GPU communication concepts

These documents explain the layers used by distributed training and
disaggregated inference without implying that every illustrated path was
benchmarked in this repository.

1. [GPU anatomy](00-gpu-anatomy.md)
2. [GPU data paths](01-gpu-data-paths.md)
3. [NCCL versus NIXL](02-nccl-vs-nixl.md)

The diagrams use two visual conventions:

- Solid arrows represent bulk data movement.
- Dashed arrows represent control, discovery, or metadata exchange.
