# EFA metrics in Prometheus

> **Implementation status: planned.** The design below is not deployed by this
> repository. Metric names must be verified against the pinned exporter image
> before dashboards or alerts are treated as stable contracts.

## Recommendation

For an EKS environment that already uses kube-prometheus-stack, use the
[AWS Labs EFA node exporter](https://github.com/awslabs/awsome-distributed-ai/tree/main/4.validation_and_observability/3.efa-node-exporter)
as the starting point for exporting EFA driver counters directly to
Prometheus.

The exporter is a scripted fork of Prometheus node_exporter and procfs. It
reads the host EFA counters and exposes `node_amazonefa_*` metrics. Treat it as
reference implementation code: build and scan the image, pin its digest, and
qualify the exposed metric contract before production use.

The official CloudWatch Agent also has an
[EFA metrics collector](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-EFA.html).
That is the stronger fit when CloudWatch is the telemetry destination. The
node-exporter path avoids a second metrics backend when Prometheus and Grafana
are already the operational standard.

## Kubernetes deployment contract

Run one exporter pod on every EFA-capable node:

- Use a DaemonSet with node affinity for an explicit label such as
  `network.aws/efa=true`.
- Add only the tolerations needed for the selected GPU/EFA node pools.
- Use the host network and host PID namespace, and mount `/` read-only with
  the exporter root set to `/host`, following the exporter reference.
- Do not collide with the existing node-exporter on host port `9100`. Prefer a
  dedicated port such as `9101`, a distinct Service, and a distinct
  ServiceMonitor.
- Scrape every 15 to 30 seconds during short validation runs.
- Relabel the target with the Kubernetes node name, instance type, capacity
  type, and experiment-safe topology labels. Do not attach request IDs or
  other unbounded values to Prometheus series.
- Preserve `device` and `port` for drill-down. Use node-level recording rules
  for the default dashboard because P5 nodes expose many EFA devices.

The expected path is:

```text
EFA sysfs counters -> exporter:9101 -> ServiceMonitor -> Prometheus -> Grafana
```

## Metric groups

The EFA driver exposes cumulative counters. Use `rate()` for throughput and
event rates, and `increase()` for failures during a benchmark window. AWS
documents the available counters in
[Monitor an EFA](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/efa-working-monitor.html).

| Question | Candidate counters |
| --- | --- |
| How much EFA traffic moved? | `tx_bytes`, `rx_bytes`, `tx_pkts`, `rx_pkts` |
| Was RDMA active? | `rdma_read_bytes`, `rdma_write_bytes`, `rdma_read_wrs`, `rdma_write_wrs` |
| Was transport reliability under pressure? | `retrans_bytes`, `retrans_pkts`, `retrans_timeout_events` |
| Were packets or work requests lost? | `rx_drops`, `rdma_read_wr_err`, `rdma_write_wr_err` |
| Did a peer become impaired or unresponsive? | `impaired_remote_conn_events`, `unresponsive_remote_events` |
| Is collection healthy? | `node_scrape_collector_success{collector="amazonefa"}` |

## PromQL patterns

The exporter README demonstrates names such as
`node_amazonefa_tx_pkts`. Confirm every name and label against `/metrics`; do
not assume that a counter has a `_total` suffix.

```promql
# Transmit throughput in bits per second, grouped by node.
sum by (node) (rate(node_amazonefa_tx_bytes[1m])) * 8

# Receive throughput in bits per second, grouped by node.
sum by (node) (rate(node_amazonefa_rx_bytes[1m])) * 8

# RDMA write throughput in bits per second.
sum by (node) (rate(node_amazonefa_rdma_write_bytes[1m])) * 8

# RDMA read throughput in bits per second.
sum by (node) (rate(node_amazonefa_rdma_read_bytes[1m])) * 8

# Retransmitted bytes per second.
sum by (node) (rate(node_amazonefa_retrans_bytes[5m]))

# Receive drops during the selected five-minute window.
sum by (node) (increase(node_amazonefa_rx_drops[5m]))

# Collector health.
min by (node) (node_scrape_collector_success{collector="amazonefa"})
```

The `node` label in these examples is part of the proposed ServiceMonitor
relabeling contract. If the live target exposes only `instance`, either group
by `instance` or add the node label before publishing recording rules.

## Suggested Grafana views

Keep the first view operational and aggregate. Place all individual EFA
devices in drill-down panels.

1. EFA TX and RX Gbit/s by node.
2. RDMA read and write Gbit/s by node.
3. Retransmitted bytes and timeout events.
4. Receive drops and RDMA work-request errors.
5. EFA collector health and number of discovered devices.
6. The same UTC window aligned with GPU utilization, application throughput,
   TTFT/ITL, and queue depth.

## What the counters prove

| Claim | EFA counters alone |
| --- | --- |
| The EFA device carried traffic | Supported |
| RDMA read/write counters changed | Supported when the instance and driver expose those counters |
| NCCL selected aws-ofi-nccl instead of TCP | Not proven; inspect NCCL/plugin logs and run `nccl-tests` |
| NIXL selected the `LIBFABRIC` backend and EFA provider | Not proven; inspect NIXL/libfabric logs and run `fi_info` or `nixlbench` |
| GPUDirect bypassed host DRAM | Not proven by device counters alone; retain GPU-memory registration and GDRDMA evidence |
| A specific pod, rank, or request produced the bytes | Not proven; workload correlation tagging is not implemented |
| Application performance improved | Not proven; correlate with trainer, vLLM, AIPerf, or llm-d metrics |

For an end-to-end proof, combine the exporter with:

- `fi_info -p efa -t FI_EP_RDM` for provider capability.
- NCCL logs and `nccl-tests` for collective transport selection.
- NIXL `LIBFABRIC` logs and `nixlbench` for KV-transfer transport validation.
- DCGM for GPU utilization and memory behavior.
- Application-level throughput and latency metrics.

AWS documents the independent NIXL validation flow in
[Use NIXL with EFA](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/efa-start-nixl.html).

## Implementation checklist

- [ ] Review and pin the exporter source revision.
- [ ] Build, scan, and publish a digest-pinned image.
- [ ] Add the DaemonSet, Service, and ServiceMonitor.
- [ ] Resolve the node-exporter port conflict explicitly.
- [ ] Verify every metric name and label from a live EFA node.
- [ ] Add bounded node and benchmark correlation labels.
- [ ] Add recording rules and a Grafana dashboard.
- [ ] Run an idle baseline, `nccl-tests`, `nixlbench`, training, and P/D
      inference validation windows.
- [ ] Document cardinality, retention, and alert thresholds from measured
      behavior rather than guessed constants.
