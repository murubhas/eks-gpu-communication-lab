#!/usr/bin/env python3
"""Capture and summarize Prometheus evidence for one inference benchmark window."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import statistics
import urllib.parse
import urllib.request
from pathlib import Path


def parse_time(value: str) -> float:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def request_json(base_url: str, endpoint: str, params: dict[str, object]) -> dict:
    url = f"{base_url.rstrip('/')}/{endpoint}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = json.load(response)
    if payload.get("status") != "success":
        raise RuntimeError(payload)
    return payload["data"]


def range_query(
    base_url: str, query: str, start: float, end: float, step: int
) -> list[dict]:
    data = request_json(
        base_url,
        "query_range",
        {"query": query, "start": start, "end": end, "step": step},
    )
    return data.get("result", [])


def instant_query(base_url: str, query: str, when: float) -> list[dict]:
    data = request_json(base_url, "query", {"query": query, "time": when})
    return data.get("result", [])


def numeric_values(series: list[dict]) -> list[float]:
    values: list[float] = []
    for item in series:
        for _, raw_value in item.get("values", []):
            value = float(raw_value)
            if math.isfinite(value):
                values.append(value)
    return values


def summarize_series(series: list[dict]) -> dict:
    values = numeric_values(series)
    if not values:
        return {"samples": 0, "mean": None, "min": None, "max": None}
    return {
        "samples": len(values),
        "mean": statistics.fmean(values),
        "min": min(values),
        "max": max(values),
    }


def vector_by_label(series: list[dict], label: str) -> dict[str, float]:
    values = {}
    for item in series:
        key = item.get("metric", {}).get(label, "unlabeled")
        values[key] = float(item["value"][1])
    return values


def scalar_value(series: list[dict]) -> float | None:
    if not series:
        return None
    return float(series[0]["value"][1])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prometheus-url", default="http://127.0.0.1:9090/api/v1")
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--namespace", default="gpu-communication-lab")
    parser.add_argument("--pod-regex", required=True)
    parser.add_argument("--gpu-host-regex", required=True)
    parser.add_argument("--epp-service")
    parser.add_argument("--step", type=int, default=15)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    start = parse_time(args.start)
    end = parse_time(args.end)
    duration = max(1, math.ceil(end - start))
    selector = f'namespace="{args.namespace}",pod=~"{args.pod_regex}"'
    gpu_selector = f'Hostname=~"{args.gpu_host_regex}"'

    expressions = {
        "fleet_waiting_requests": f"sum(vllm:num_requests_waiting{{{selector}}})",
        "max_pod_waiting_requests": f"max(vllm:num_requests_waiting{{{selector}}})",
        "fleet_running_requests": f"sum(vllm:num_requests_running{{{selector}}})",
        "fleet_request_throughput_rps_1m": (
            f"sum(rate(vllm:request_success_total{{{selector}}}[1m]))"
        ),
        "fleet_output_throughput_tps_1m": (
            f"sum(rate(vllm:generation_tokens_total{{{selector}}}[1m]))"
        ),
        "fleet_prompt_throughput_tps_1m": (
            f"sum(rate(vllm:prompt_tokens_total{{{selector}}}[1m]))"
        ),
        "gpu_utilization_percent_mean": f"avg(DCGM_FI_DEV_GPU_UTIL{{{gpu_selector}}})",
        "gpu_utilization_percent_max": f"max(DCGM_FI_DEV_GPU_UTIL{{{gpu_selector}}})",
        "active_gpu_count_over_5_percent": (
            f"count(DCGM_FI_DEV_GPU_UTIL{{{gpu_selector}}} > 5)"
        ),
        "gpu_memory_used_mib_total": f"sum(DCGM_FI_DEV_FB_USED{{{gpu_selector}}})",
        "gpu_power_watts_total": f"sum(DCGM_FI_DEV_POWER_USAGE{{{gpu_selector}}})",
    }

    epp = None
    if args.epp_service:
        epp = f'namespace="{args.namespace}",service="{args.epp_service}"'
        expressions.update(
            {
                "epp_ready_endpoints": f"llm_d_epp_ready_endpoints{{{epp}}}",
                "epp_average_queue_size": f"llm_d_epp_average_queue_size{{{epp}}}",
                "epp_average_running_requests": (
                    f"llm_d_epp_average_running_requests{{{epp}}}"
                ),
                "epp_average_kv_cache_utilization": (
                    f"llm_d_epp_average_kv_cache_utilization{{{epp}}}"
                ),
                "epp_request_rate_1m": (
                    f"sum(rate(llm_d_epp_request_total{{{epp}}}[1m]))"
                ),
            }
        )

    raw_range = {
        name: range_query(
            args.prometheus_url, query, start, end, args.step
        )
        for name, query in expressions.items()
    }
    summaries = {name: summarize_series(series) for name, series in raw_range.items()}

    window = f"{duration}s"
    pod_totals = {
        "requests": vector_by_label(
            instant_query(
                args.prometheus_url,
                f"sum by (pod) (increase(vllm:request_success_total{{{selector}}}[{window}]))",
                end,
            ),
            "pod",
        ),
        "output_tokens": vector_by_label(
            instant_query(
                args.prometheus_url,
                f"sum by (pod) (increase(vllm:generation_tokens_total{{{selector}}}[{window}]))",
                end,
            ),
            "pod",
        ),
        "prompt_tokens": vector_by_label(
            instant_query(
                args.prometheus_url,
                f"sum by (pod) (increase(vllm:prompt_tokens_total{{{selector}}}[{window}]))",
                end,
            ),
            "pod",
        ),
    }

    request_values = list(pod_totals["requests"].values())
    request_distribution = {
        "pod_count": len(request_values),
        "mean": statistics.fmean(request_values) if request_values else None,
        "min": min(request_values) if request_values else None,
        "max": max(request_values) if request_values else None,
        "coefficient_of_variation_percent": (
            statistics.pstdev(request_values) / statistics.fmean(request_values) * 100
            if request_values and statistics.fmean(request_values) != 0
            else None
        ),
    }

    epp_window = None
    if epp:
        epp_window = {
            "requests": scalar_value(
                instant_query(
                    args.prometheus_url,
                    f"sum(increase(llm_d_epp_request_total{{{epp}}}[{window}]))",
                    end,
                )
            ),
            "scheduler_average_seconds": scalar_value(
                instant_query(
                    args.prometheus_url,
                    "sum(increase(llm_d_epp_scheduler_e2e_duration_seconds_sum"
                    f"{{{epp}}}[{window}])) / "
                    "sum(increase(llm_d_epp_scheduler_e2e_duration_seconds_count"
                    f"{{{epp}}}[{window}]))",
                    end,
                )
            ),
            "prefix_indexer_average_hit_ratio": scalar_value(
                instant_query(
                    args.prometheus_url,
                    "sum(increase(llm_d_epp_prefix_indexer_hit_ratio_sum"
                    f"{{{epp}}}[{window}])) / "
                    "sum(increase(llm_d_epp_prefix_indexer_hit_ratio_count"
                    f"{{{epp}}}[{window}]))",
                    end,
                )
            ),
            "plugin_average_seconds": vector_by_label(
                instant_query(
                    args.prometheus_url,
                    "sum by (plugin_name) (increase("
                    f"llm_d_epp_plugin_duration_seconds_sum{{{epp}}}[{window}])) / "
                    "sum by (plugin_name) (increase("
                    f"llm_d_epp_plugin_duration_seconds_count{{{epp}}}[{window}]))",
                    end,
                ),
                "plugin_name",
            ),
        }

    result = {
        "window": {
            "start": args.start,
            "end": args.end,
            "duration_seconds": end - start,
            "step_seconds": args.step,
        },
        "selectors": {
            "namespace": args.namespace,
            "pod_regex": args.pod_regex,
            "gpu_host_regex": args.gpu_host_regex,
            "epp_service": args.epp_service,
        },
        "queries": expressions,
        "summaries": summaries,
        "pod_totals": pod_totals,
        "request_distribution": request_distribution,
        "epp_window": epp_window,
        "raw_range": raw_range,
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "window": result["window"],
        "summaries": summaries,
        "request_distribution": request_distribution,
        "epp_window": epp_window,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
