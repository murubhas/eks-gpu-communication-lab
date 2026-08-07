#!/usr/bin/env python3
"""Summarize a controlled A/B/B/A AIPerf routing comparison."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean


METRICS = {
    "request_throughput_rps": ("request_throughput", "avg"),
    "output_throughput_tps": ("output_token_throughput", "avg"),
    "request_latency_avg_ms": ("request_latency", "avg"),
    "request_latency_p50_ms": ("request_latency", "p50"),
    "request_latency_p95_ms": ("request_latency", "p95"),
    "request_latency_p99_ms": ("request_latency", "p99"),
    "ttft_avg_ms": ("time_to_first_token", "avg"),
    "ttft_p50_ms": ("time_to_first_token", "p50"),
    "ttft_p95_ms": ("time_to_first_token", "p95"),
    "ttft_p99_ms": ("time_to_first_token", "p99"),
    "ttst_avg_ms": ("time_to_second_token", "avg"),
    "itl_avg_ms": ("inter_token_latency", "avg"),
    "itl_p99_ms": ("inter_token_latency", "p99"),
    "request_count": ("request_count", "avg"),
    "benchmark_duration_sec": ("benchmark_duration", "avg"),
}


def export_path(path: str) -> Path:
    candidate = Path(path)
    if candidate.is_dir():
        candidate /= "profile_export_aiperf.json"
    return candidate


def load_run(path: str) -> dict:
    source = export_path(path)
    with source.open(encoding="utf-8") as handle:
        payload = json.load(handle)

    values = {}
    for name, (group, field) in METRICS.items():
        values[name] = payload[group][field]
    values.update(
        {
            "source": str(source),
            "aiperf_version": payload.get("aiperf_version"),
            "start_time": payload.get("start_time"),
            "end_time": payload.get("end_time"),
            "was_cancelled": payload.get("was_cancelled"),
            "errors": payload.get("error_summary", []),
        }
    )
    return values


def average_runs(runs: list[dict]) -> dict:
    return {name: mean(run[name] for run in runs) for name in METRICS}


def unit_economics(summary: dict, fleet_hourly_usd: float) -> dict:
    per_second = fleet_hourly_usd / 3600
    return {
        "fleet_hourly_usd": fleet_hourly_usd,
        "fleet_cost_per_second_usd": per_second,
        "cost_per_request_usd": per_second / summary["request_throughput_rps"],
        "cost_per_1m_output_tokens_usd": (
            per_second * 1_000_000 / summary["output_throughput_tps"]
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--a1", required=True)
    parser.add_argument("--b1", required=True)
    parser.add_argument("--b2", required=True)
    parser.add_argument("--a2", required=True)
    parser.add_argument("--node-count", type=int, default=2)
    parser.add_argument("--spot-node-hourly-usd", type=float, required=True)
    parser.add_argument("--ondemand-node-hourly-usd", type=float, required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    runs = {
        "a1_kubernetes_service": load_run(args.a1),
        "b1_llm_d": load_run(args.b1),
        "b2_llm_d": load_run(args.b2),
        "a2_kubernetes_service": load_run(args.a2),
    }
    a_average = average_runs(
        [runs["a1_kubernetes_service"], runs["a2_kubernetes_service"]]
    )
    b_average = average_runs([runs["b1_llm_d"], runs["b2_llm_d"]])
    delta_percent = {
        name: ((b_average[name] - a_average[name]) / a_average[name]) * 100
        for name in METRICS
        if a_average[name] != 0
    }

    spot_fleet_hourly = args.node_count * args.spot_node_hourly_usd
    ondemand_fleet_hourly = args.node_count * args.ondemand_node_hourly_usd
    result = {
        "runs": runs,
        "averages": {
            "kubernetes_service": a_average,
            "llm_d": b_average,
        },
        "llm_d_vs_kubernetes_service_delta_percent": delta_percent,
        "economics": {
            "spot": {
                "kubernetes_service": unit_economics(a_average, spot_fleet_hourly),
                "llm_d": unit_economics(b_average, spot_fleet_hourly),
            },
            "ondemand_equivalent": {
                "kubernetes_service": unit_economics(a_average, ondemand_fleet_hourly),
                "llm_d": unit_economics(b_average, ondemand_fleet_hourly),
            },
        },
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
