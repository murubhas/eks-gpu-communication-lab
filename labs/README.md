# Labs

The labs share one P5 hardware foundation but test different communication
semantics. Run them independently; both can consume an entire two-node fleet.

| Lab | Workload | Communication path | Primary proof |
| --- | --- | --- | --- |
| [P5 NCCL over EFA](p5-nccl-efa/README.md) | Distributed training | NCCL -> aws-ofi-nccl -> libfabric -> EFA | Collective correctness and transport selection |
| [P5 NIXL over EFA](p5-nixl-efa/README.md) | Disaggregated inference | NIXL -> native LIBFABRIC backend -> libfabric -> EFA | KV-transfer path and measured application behavior |

## Common discipline

1. Inventory the host and container separately.
2. Pin the AMI release and container digest.
3. Prove device allocation and provider selection before load.
4. Stop on transport fallback or incomplete rank/worker readiness.
5. Record exact UTC benchmark windows and correlate application, routing, and
   DCGM metrics.
6. Separate transport correctness, bandwidth, and application performance in
   every conclusion.
