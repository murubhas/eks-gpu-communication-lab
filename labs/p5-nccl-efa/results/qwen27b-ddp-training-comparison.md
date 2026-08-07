# Qwen 27B LoRA Training: G7e, G6e, and P5 Comparison

## Purpose

This report compares three completed Amazon EKS training experiments using the
same 27-billion-parameter dense model, 1,000-row SFT dataset, three epochs,
LoRA configuration, INT8 base-model loading, and 1,024-token maximum sequence
length.

The P5 run is a successful 16-GPU DDP and EFA scale-out proof. It is not a
strict hardware A/B benchmark because its minimum global batch was 16, while
the earlier G6e and G7e runs used global batch 8.

## Experiment topology

| Configuration | Physical GPUs | DDP ranks | Global batch | Optimizer steps | Inter-node transport |
| --- | ---: | ---: | ---: | ---: | --- |
| 2 x g7e.2xlarge | 2 x RTX PRO 6000 Blackwell | 2 | 8 | 375 | NCCL Socket/TCP |
| 2 x g6e.12xlarge | 8 x NVIDIA L40S | 8 | 8 | 375 | NCCL Socket/TCP |
| 2 x p5.48xlarge | 16 x NVIDIA H100 | 16 | 16 | 189 | NCCL over EFA/RDMA |

The P5 run used eight H100 GPUs per node. Intra-node collectives used the P5
NVSwitch/NVLink fabric. Inter-node collectives used this verified path:

```text
NCCL 2.27.7 -> aws-ofi-nccl 1.17.1 -> libfabric 2.3 -> EFA/RDMA
```

Every rank passed the fail-closed transport preflight. No NCCL Socket/TCP
fallback was observed.

## Measured training results

| Metric | 2 x G7e.2xlarge | 2 x G6e.12xlarge | 2 x P5.48xlarge |
| --- | ---: | ---: | ---: |
| Result | Succeeded | Succeeded | Succeeded |
| Epochs | 3 | 3 | 3 |
| Optimizer steps | 375 | 375 | 189 |
| Training runtime | 59.10 min | 28.14 min | 15.77 min |
| Full pod/job wall time | 68.95 min | 38.78 min | 32.25 min |
| Samples/sec | about 0.846 | 1.777 | 3.170 |
| Estimated max-sequence tokens/sec | about 866 | 1,819.65 | 3,246.08 |
| Effective trainer tokens/sec | 169.39 | 355.77 | 634.70 |
| Trainer tokens processed | 600,642 | 600,642 | 600,642 |
| Final training loss | about 0.723 | 0.7222 | 0.8003 |
| Checkpoints | 3 | 3 | 3 |
| Final adapter directory | 257.2 MiB | 257.2 MiB | 257.2 MiB |

`Estimated max-sequence tokens/sec` is `samples/sec x 1,024`. It is useful for
dashboard comparison but assumes every sample consumes the configured maximum
sequence length. `Effective trainer tokens/sec` is the conservative value:
`600,642 trainer tokens / measured training runtime`.

The higher P5 final loss is not a hardware-quality result. The P5 run used
global batch 16 and therefore performed only 189 optimizer updates, versus 375
updates at global batch 8. Learning-rate and warmup settings were not retuned
for the larger batch.

## P5 application metrics

Final values from the rank-0 Prometheus endpoint:

| Metric | Value |
| --- | ---: |
| Training completed | 1 |
| Current / target step | 189 / 189 |
| Epoch | 3 |
| Final trainer runtime | 946.3434 sec |
| Final training loss | 0.8003143 |
| Samples/sec | 3.17 |
| Steps/sec | 0.20 |
| Estimated max-sequence tokens/sec | 3,246.08 |
| Trainer tokens | 600,642 |
| Processed sample slots | 3,024 |
| Processed padded tokens | 3,096,576 |
| Mean token accuracy | 0.8062 |
| Final gradient norm | 0.8672 |
| Learning rate | 0.00005 |
| Checkpoints | 3 |
| Output artifact bytes | 269,652,569 |
| Trainable parameters | 124,730,880 |
| Total parameters | 27,481,459,440 |
| Final metrics hold | 120 sec |

The processed-sample estimate is 3,024 rather than exactly 3,000 because the
distributed sampler pads the 1,000-row dataset to a multiple of 16 ranks in
each epoch. The trainer-reported token count remained 600,642.

## P5 GPU telemetry

DCGM values over the 946-second training interval:

| Signal | Measured value |
| --- | ---: |
| GPUs discovered | 16 |
| GPUs active above 5% at least once | 16 |
| Mean utilization across all GPUs | 60.4% |
| Per-GPU mean utilization range | 45.8% to 75.2% |
| Peak utilization | 100% |
| Mean framebuffer used per GPU | 41.96 GiB |
| Peak framebuffer used | 44.27 GiB |
| Mean power per GPU | 198.7 W |
| Approximate aggregate GPU power | 3.18 kW |
| Peak power on one GPU | 296.7 W |
| Mean GPU temperature | 46.1 C |
| Peak GPU temperature | 53 C |

The training process reported about 39.1 to 39.7 GiB peak local allocation per
rank. DCGM's larger framebuffer number includes GPU memory outside the
process's own PyTorch accounting.

## On-Demand economics

Prices were queried from the AWS Price List API for Linux, shared tenancy,
US East (Ohio), on 2026-08-06. Prices can change; query the API again before
using these values for a purchasing decision.

| Instance | On-Demand USD/node-hour | Nodes | Fleet USD/hour | USD/GPU-hour |
| --- | ---: | ---: | ---: | ---: |
| g7e.2xlarge | 3.36312 | 2 | 6.72624 | 3.36312 |
| g6e.12xlarge | 10.49264 | 2 | 20.98528 | 2.62316 |
| p5.48xlarge | 55.04 | 2 | 110.08 | 6.88 |

Training-only cost uses:

```text
node count x On-Demand price x trainer runtime hours
```

| Economics metric | 2 x G7e.2xlarge | 2 x G6e.12xlarge | 2 x P5.48xlarge |
| --- | ---: | ---: | ---: |
| Training-only compute | $6.63 | $9.84 | $28.94 |
| Full pod/job wall cost | $7.73 | $13.56 | $59.17 |
| Training cost / 1M trainer tokens | $11.03 | $16.39 | $48.18 |
| Training cost / 1K dataset examples | $2.21 | $3.28 | $9.65 |

P5 all-in cost decomposition:

| P5 phase | Duration | On-Demand cost |
| --- | ---: | ---: |
| Trainer runtime | 15.77 min | $28.94 |
| Startup, preflight, model loading, and final save | 14.48 min | $26.56 |
| Final Prometheus metrics hold | 2.00 min | $3.67 |
| Total pod wall time | 32.25 min | $59.17 |

The P5 run used Spot capacity. Its observed Spot price was $20.7813 per
node-hour, estimating the same run at about $10.93 for trainer time or $22.34
for full pod wall time. The tables above use On-Demand prices so the platform
comparison has a reproducible cost basis.

## Relative comparison

Relative to the two-node G6e run, P5 delivered:

- 1.78x effective training throughput.
- 43.95% shorter trainer runtime.
- 2.94x higher On-Demand training cost.
- 4.36x higher On-Demand full-job cost.

Relative to the two-node G7e run, P5 delivered:

- 3.75x effective training throughput.
- 73.31% shorter trainer runtime.
- 4.37x higher On-Demand training cost.
- 7.65x higher On-Demand full-job cost.

## Interpretation

For this small 1,000-row LoRA workload, two P5 nodes optimize time-to-result,
not cost. Doubling the GPU count from eight L40S GPUs to sixteen H100 GPUs
produced 1.78x throughput rather than 2x or better. The 60.4% mean GPU
utilization and 14.48-minute startup/model-loading phase show that this
workload does not fully amortize a 16-H100 fleet.

The P5 result proves:

1. Sixteen-rank DDP works across two P5 nodes.
2. NVSwitch/NVLink handles intra-node collectives.
3. EFA, aws-ofi-nccl, and libfabric carry inter-node NCCL traffic without TCP
   fallback.
4. Rank-0 application metrics and all 16 DCGM GPU series flow end to end.
5. The adapter and metadata save successfully after distributed training.

For a strict H100-versus-L40S comparison, hold global batch and GPU count
constant. One useful next test is one P5 node with eight H100 GPUs versus two
G6e.12xlarge nodes with eight L40S GPUs, both at global batch 8. A separate
scale-out-efficiency test would compare 16 H100 GPUs against 16 L40S GPUs at
global batch 16.

## Evidence boundary

- These are measured results from three completed runs, not vendor benchmark
  claims.
- Absolute values apply to this model, dataset, software stack, and workload.
- The cross-platform comparison is directional because the P5 global batch
  differed from the G6e and G7e runs.
- No account IDs, private image locations, storage paths, cluster names, or
  unredacted logs are included in this public report.
