# Observability

> **Status: design documented; deployment not implemented.** This repository
> does not yet install an EFA exporter, ServiceMonitor, recording rules, or an
> EFA Grafana dashboard. Workload-to-device correlation tagging is also not
> implemented.

GPU communication needs several complementary telemetry layers. A single
metric source cannot prove the device path, transport selection, and workload
outcome at the same time.

| Layer | Primary question | Signal source |
| --- | --- | --- |
| Application | Did the workload become faster or more reliable? | Trainer, vLLM, AIPerf, and llm-d metrics |
| GPU | Were the GPUs busy, memory-constrained, or thermally limited? | NVIDIA DCGM exporter |
| Communication library | Which collective or transfer path was selected? | NCCL, aws-ofi-nccl, NIXL, and libfabric logs |
| EFA device | How much traffic, RDMA activity, retransmission, or error activity reached each EFA device? | EFA driver counters exported to Prometheus |
| Independent validation | Does the transport work outside the application? | `nccl-tests`, `fi_info`, and `nixlbench` |

## Planned Prometheus path

```text
/sys/class/infiniband/<device>/ports/<port>/hw_counters
    -> EFA node exporter DaemonSet
    -> Kubernetes Service and ServiceMonitor
    -> kube-prometheus-stack
    -> EFA recording rules and Grafana dashboard
```

The proposed design uses the AWS Labs EFA node exporter as a starting point.
See [EFA metrics in Prometheus](efa-prometheus.md) for the deployment contract,
metric groups, example queries, proof limits, and implementation checklist.

## Correlation model

The benchmark window is the initial correlation key:

1. Record the exact UTC start and end time.
2. Record the Kubernetes nodes, pods, ranks, EFA devices, and benchmark run ID.
3. Correlate application, DCGM, EFA, and runtime-log evidence over that window.
4. Preserve per-device detail for diagnosis but aggregate by node for the
   first dashboard view.

This time-window method is useful, but it is not request-level attribution.
The planned implementation still needs consistent benchmark and workload
labels plus Prometheus target relabeling. EFA driver counters cannot natively
identify the pod, NCCL collective, NIXL transfer, or request that produced the
traffic.
