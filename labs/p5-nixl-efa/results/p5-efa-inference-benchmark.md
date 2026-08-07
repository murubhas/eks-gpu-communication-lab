# P5 EFA Inference Benchmark Report

## Executive summary

Two `p5.48xlarge` Spot nodes were used to test Qwen3.6 27B FP8 inference on Amazon EKS. The experiment covered two questions:

1. Does llm-d routing improve a 16-replica homogeneous vLLM fleet compared with a Kubernetes Service?
2. Can an 8-prefill/8-decode llm-d topology transfer KV state over NIXL with the LIBFABRIC/EFA backend, and how does it compare with a matched 16-worker homogeneous control?

The P/D data path was proven end to end. NIXL initialized the LIBFABRIC backend, libfabric selected the `efa` provider and all four assigned EFA devices per pod, cross-node EFA handshakes completed, the NIXL compatibility check passed, and decode workers reported external-prefix-cache hits.

For the matched 4,096-input-token test, P/D preserved request throughput within 1.9% and output-token throughput within 2.2% of homogeneous serving. Average inter-token latency was effectively unchanged at +0.2%. P/D made median latency slower, but substantially improved the tail: p95 E2E improved 37.9%, p99 E2E improved 55.5%, p95 TTFT improved 53.8%, and p99 TTFT improved 67.4%.

This is evidence that the tested P/D stack can operate effectively over EFA. It is not evidence that P/D universally improves every latency percentile or workload.

## Test platform

| Item | Value |
|---|---|
| Cluster | Amazon EKS serving cluster |
| Region / AZ | `us-east-2` / `us-east-2b` |
| Capacity | 2 x `p5.48xlarge` Spot |
| GPUs | 16 x NVIDIA H100 total, 8 per node |
| EFA resources | 64 total, 32 per node |
| Placement | Single cluster placement group |
| Model | Qwen3.6 27B FP8 |
| Model storage | FSx for Lustre, read-only mount |
| Benchmark client | AIPerf 0.11.0 from the in-cluster runner |
| Spot price used | $20.7813 per node-hour, $41.5626 fleet-hour |
| On-Demand equivalent | $55.04 per node-hour, $110.08 fleet-hour |

The P5 nodes reported:

| Node | Instance | Zone | GPUs | EFA devices |
|---|---|---:|---:|---:|
| Node A | `p5.48xlarge` | `us-east-2b` | 8 | 32 |
| Node B | `p5.48xlarge` | `us-east-2b` | 8 | 32 |

## Experiment 1: Kubernetes Service vs llm-d routing

### Method

- 16 homogeneous vLLM replicas, one H100 per replica
- `max-num-seqs=1`
- A/B/B/A ordering with a 10-minute cooldown between arms
- A: Kubernetes Service
- B: llm-d standalone Envoy/EPP router
- 25-minute closed-loop load per arm
- Concurrency 48
- Synthetic input length 256, requested output length 128
- Streaming, thinking disabled, EOS ignored
- HTTP connection reuse disabled

The table below reports each run independently. The average table is the arithmetic mean of the two per-arm summaries, not a pooled latency distribution.

### Per-run results

| Metric | A1 Kubernetes | B1 llm-d | B2 llm-d | A2 Kubernetes |
|---|---:|---:|---:|---:|
| Requests | 11,270 | 11,951 | 10,517 | 11,247 |
| Request throughput | 7.443 rps | 7.853 rps | 6.876 rps | 7.382 rps |
| Output throughput | 1,043.6 tok/s | 1,097.7 tok/s | 962.1 tok/s | 1,027.2 tok/s |
| Average E2E | 6.404 s | 6.043 s | 6.843 s | 6.421 s |
| p50 E2E | 5.054 s | 3.418 s | 2.128 s | 4.973 s |
| p95 E2E | 16.125 s | 19.853 s | 58.398 s | 17.481 s |
| p99 E2E | 23.496 s | 21.829 s | 61.410 s | 23.847 s |
| Average TTFT | 4.651 s | 4.290 s | 5.088 s | 4.667 s |
| p50 TTFT | 3.311 s | 1.653 s | 0.371 s | 3.225 s |
| p95 TTFT | 14.373 s | 18.095 s | 56.601 s | 15.731 s |
| p99 TTFT | 21.726 s | 20.080 s | 59.611 s | 22.097 s |
| Average ITL | 12.793 ms | 12.818 ms | 12.821 ms | 12.878 ms |
| API errors | 0 | 1 transient 503 | 0 | 0 |

### Mean of the two runs per arm

| Metric | Kubernetes Service | llm-d | llm-d delta |
|---|---:|---:|---:|
| Request throughput | 7.413 rps | 7.364 rps | -0.65% |
| Output throughput | 1,035.4 tok/s | 1,029.9 tok/s | -0.53% |
| Average E2E | 6.412 s | 6.443 s | +0.47% |
| p50 E2E | 5.014 s | 2.773 s | -44.69% |
| p95 E2E | 16.803 s | 39.126 s | +132.85% |
| p99 E2E | 23.672 s | 41.620 s | +75.82% |
| Average TTFT | 4.659 s | 4.689 s | +0.64% |
| p50 TTFT | 3.268 s | 1.012 s | -69.04% |
| p95 TTFT | 15.052 s | 37.348 s | +148.13% |
| p99 TTFT | 21.912 s | 39.846 s | +81.85% |
| Average ITL | 12.835 ms | 12.819 ms | -0.12% |
| p99 ITL | 15.172 ms | 15.109 ms | -0.41% |

### Interpretation

llm-d was neutral for aggregate throughput, average latency, and decode cadence. It improved the median but produced a bimodal tail, driven primarily by B2.

During B2, the repeated synthetic prefixes interacted with the EPP scoring policy. Prefix affinity had weight 3 while queue and KV pressure each had weight 2. A warm-prefix backend continued receiving preferential placement even as its queue grew, reaching a maximum observed queue depth of 33. A2 returned to the earlier Kubernetes baseline, which argues against a persistent fleet or node slowdown.

This result should not be generalized as "llm-d is slower." It demonstrates that scorer weights and workload reuse patterns are part of the serving configuration. The next routing study should sweep prefix weight, queue weight, and `max-num-seqs` with several prompt-reuse distributions.

### Routing economics

| Cost basis | Metric | Kubernetes Service | llm-d |
|---|---|---:|---:|
| Spot | Cost/request | $0.001557 | $0.001568 |
| Spot | Cost/1M output tokens | $11.15 | $11.21 |
| On-Demand equivalent | Cost/request | $0.004125 | $0.004152 |
| On-Demand equivalent | Cost/1M output tokens | $29.53 | $29.69 |

The fixed fleet cost makes the economics track throughput closely.

## Experiment 2: Homogeneous vs P/D over NIXL and EFA

### Matched topology

| Control | P/D |
|---|---|
| 16 homogeneous workers | 8 prefill workers + 8 decode workers |
| Both nodes serve both phases | Prefill on one P5, decode on the other P5 |
| Direct Kubernetes Service | Envoy/EPP with P/D filters |
| No external KV transfer | NIXL `LIBFABRIC` backend over EFA |

Both arms used the same physical fleet, model, container image, FP8 checkpoint, vLLM core settings, and AIPerf request shape. The image was `ghcr.io/llm-d/llm-d-aws:v0.8.0` for both arms.

### Workload

- 400 measured requests plus 16 warm-up requests
- Concurrency 16, closed loop
- Input length 4,096 tokens
- Requested output length 128 tokens
- Seed 42
- Streaming, thinking disabled, EOS ignored
- HTTP connection reuse disabled
- `max-num-seqs=1`

### Results

| Metric | Homogeneous | P/D NIXL/EFA | P/D delta |
|---|---:|---:|---:|
| Successful requests | 400 / 400 | 400 / 400 | No errors |
| Duration | 88.864 s | 90.603 s | +1.96% |
| Request throughput | 4.501 rps | 4.415 rps | -1.92% |
| Output throughput | 543.79 tok/s | 531.75 tok/s | -2.21% |
| Processed-token throughput | 18,980.95 tok/s | 18,615.02 tok/s | -1.93% |
| Average E2E | 3.402 s | 3.550 s | +4.33% |
| p50 E2E | 2.209 s | 3.510 s | +58.88% |
| p95 E2E | 6.202 s | 3.853 s | -37.88% |
| p99 E2E | 9.831 s | 4.371 s | -55.54% |
| Average TTFT | 1.672 s | 1.821 s | +8.92% |
| p50 TTFT | 0.463 s | 1.787 s | +285.92% |
| p95 TTFT | 4.457 s | 2.060 s | -53.78% |
| p99 TTFT | 8.101 s | 2.638 s | -67.43% |
| Average TST | 11.450 ms | 11.003 ms | -3.90% |
| p99 TST | 25.548 ms | 26.409 ms | +3.37% |
| Average ITL | 14.497 ms | 14.528 ms | +0.22% |
| p99 ITL | 16.883 ms | 17.284 ms | +2.37% |

### Distribution and utilization evidence

- All 16 homogeneous workers and all 16 P/D workers appeared in vLLM request counters.
- Homogeneous per-worker request-distribution coefficient of variation: 23.88%.
- P/D per-worker request-distribution coefficient of variation: 5.48%.
- EPP reported 16 ready endpoints throughout the measured P/D arm.
- EPP scheduler processing averaged about 51.6 microseconds.
- All 16 GPUs were allocated. DCGM's 15-second interval observed at most 11 GPUs above the utilization threshold in one sample; this coarse sample must not be interpreted as only 11 GPUs participating.
- Total GPU memory was approximately 1,163,072 MiB for homogeneous and 1,155,040 MiB for P/D.
- Observed fleet power maxima were approximately 4,913 W for homogeneous and 5,228 W for P/D. These sampled maxima are not energy-consumption measurements.

### What the latency result means

P/D added a fixed coordination and KV-transfer cost, which raised median TTFT and median E2E. It also distributed work much more uniformly and removed the long tail seen in the direct homogeneous control.

The defensible conclusion is:

> On this two-P5, long-context synthetic workload, the complete P/D stack preserved throughput and decode cadence while exchanging a slower median for a substantially tighter latency tail.

The p95/p99 gain must be attributed to the complete topology change: EPP routing, phase separation, and NIXL/EFA transfer. This single comparison does not isolate NIXL as the sole cause.

### P/D transport proof

Runtime evidence included:

- `kv_connector='NixlConnector'`
- `kv_connector_extra_config={'backends': ['LIBFABRIC']}`
- `NIXL is available`
- `provider=efa`
- Four EFA devices selected in each tested vLLM pod
- CUDA memory registration through libfabric
- Cross-node EFA peer-address insertion and handshake messages
- Peer EC2 host IDs from the opposite P5 node
- `NIXL compatibility check passed`
- A valid `TransferTopology(...)` plan
- Decode-side `External prefix cache hit rate: 100.0%` during the functional smoke request

This proves that the application used the NIXL LIBFABRIC/EFA path. Merely attaching EFA devices would not have been sufficient evidence.

### P/D economics

| Cost basis | Metric | Homogeneous | P/D |
|---|---|---:|---:|
| Spot | Cost/request | $0.002565 | $0.002615 |
| Spot | Cost/1M output tokens | $21.23 | $21.71 |
| Spot | Cost/1M processed tokens | $0.608 | $0.620 |
| On-Demand equivalent | Cost/request | $0.006793 | $0.006926 |
| On-Demand equivalent | Cost/1M output tokens | $56.23 | $57.50 |
| On-Demand equivalent | Cost/1M processed tokens | $1.611 | $1.643 |

Formulas:

```text
fleet cost/sec       = fleet hourly USD / 3600
cost/request         = fleet cost/sec / requests/sec
cost/1M output       = fleet cost/sec / output tokens/sec * 1,000,000
cost/1M processed    = fleet cost/sec / total processed tokens/sec * 1,000,000
```

## Limitations

1. These are synthetic saturation workloads, not production traffic traces.
2. The routing comparison has two measured runs per arm; the P/D comparison has one measured run per arm.
3. The two routing B runs were materially different, which is itself an important policy-stability finding.
4. P/D changed both routing and execution topology. It is not a transport-only microbenchmark.
5. `max-num-seqs=1` makes placement and queue imbalance especially visible.
6. The P/D arm used an 8:8 ratio only. The optimal prefill:decode ratio depends on input length, output length, concurrency, and SLO.
7. Spot and On-Demand economics use fixed fleet prices and do not include storage, CPU-router nodes, observability, or data-transfer charges.
8. Power values are sampled instantaneous maxima, not integrated energy or cost.

## Recommended next study

Run a controlled matrix rather than another single point:

- Input lengths: 256, 1,024, 4,096, 8,192
- Concurrency: 8, 16, 32, 64
- P:D ratios: 4:12, 8:8, 12:4
- `max-num-seqs`: 1 and a production-oriented batching value
- Routing weights: prefix, queue, KV pressure, and active-request scorers
- At least three repetitions per cell with randomized arm order

The goal should be an SLO frontier: throughput and cost subject to p95/p99 TTFT and E2E constraints, not a single maximum-throughput number.

## Reproducibility assets

This public package retains the benchmark method and summary without publishing
cluster-specific logs, pod names, model paths, or raw request artifacts.

- [Lab runbook](../README.md)
- [`run_routing_arm.sh`](../scripts/run_routing_arm.sh)
- [`run_pd_arm.sh`](../scripts/run_pd_arm.sh)
- [`collect_prometheus_window.py`](../scripts/collect_prometheus_window.py)
- [`summarize_routing_runs.py`](../scripts/summarize_routing_runs.py)
- [`summarize_pd_runs.py`](../scripts/summarize_pd_runs.py)
- [Observed serving inventory](../../../docs/reference-stacks/p5-two-node-efa/nixl-efa-serving-inventory.md)
