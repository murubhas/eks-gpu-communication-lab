#!/usr/bin/env python3
"""Compare matched homogeneous and P/D AIPerf exports."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


METRICS = {
    "request_throughput_rps": ("request_throughput", "avg"),
    "output_throughput_tps": ("output_token_throughput", "avg"),
    "total_token_throughput_tps": ("total_token_throughput", "avg"),
    "average_e2e_ms": ("request_latency", "avg"),
    "p50_e2e_ms": ("request_latency", "p50"),
    "p95_e2e_ms": ("request_latency", "p95"),
    "p99_e2e_ms": ("request_latency", "p99"),
    "average_ttft_ms": ("time_to_first_token", "avg"),
    "p50_ttft_ms": ("time_to_first_token", "p50"),
    "p95_ttft_ms": ("time_to_first_token", "p95"),
    "p99_ttft_ms": ("time_to_first_token", "p99"),
    "average_tst_ms": ("time_to_second_token", "avg"),
    "p99_tst_ms": ("time_to_second_token", "p99"),
    "average_itl_ms": ("inter_token_latency", "avg"),
    "p99_itl_ms": ("inter_token_latency", "p99"),
    "average_isl_tokens": ("input_sequence_length", "avg"),
    "average_osl_tokens": ("output_sequence_length", "avg"),
    "benchmark_duration_seconds": ("benchmark_duration", "avg"),
}


def read_export(path: Path) -> dict:
    if path.is_dir():
        path = path / "profile_export_aiperf.json"
    return json.loads(path.read_text())


def metric(payload: dict, key: tuple[str, str]) -> float | None:
    section, field = key
    value = payload.get(section, {}).get(field)
    return float(value) if value is not None else None


def delta_percent(baseline: float | None, experiment: float | None) -> float | None:
    if baseline in (None, 0) or experiment is None:
        return None
    return (experiment / baseline - 1) * 100


def economics(hourly_usd: float, values: dict[str, float | None]) -> dict:
    cost_per_second = hourly_usd / 3600
    rps = values["request_throughput_rps"]
    output_tps = values["output_throughput_tps"]
    total_tps = values["total_token_throughput_tps"]
    return {
        "fleet_hourly_usd": hourly_usd,
        "cost_per_request_usd": cost_per_second / rps if rps else None,
        "cost_per_1m_output_tokens_usd": (
            cost_per_second / output_tps * 1_000_000 if output_tps else None
        ),
        "cost_per_1m_processed_tokens_usd": (
            cost_per_second / total_tps * 1_000_000 if total_tps else None
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--pd", type=Path, required=True)
    parser.add_argument("--spot-fleet-hourly-usd", type=float, required=True)
    parser.add_argument("--ondemand-fleet-hourly-usd", type=float, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    exports = {
        "homogeneous": read_export(args.baseline),
        "pd": read_export(args.pd),
    }
    values = {
        arm: {name: metric(payload, key) for name, key in METRICS.items()}
        for arm, payload in exports.items()
    }
    result = {
        "aiperf_version": {
            arm: payload.get("aiperf_version") for arm, payload in exports.items()
        },
        "request_count": {
            arm: payload.get("request_count", {}).get("avg")
            for arm, payload in exports.items()
        },
        "errors": {
            arm: payload.get("error_summary", []) for arm, payload in exports.items()
        },
        "was_cancelled": {
            arm: payload.get("was_cancelled") for arm, payload in exports.items()
        },
        "metrics": values,
        "pd_delta_percent": {
            name: delta_percent(values["homogeneous"][name], values["pd"][name])
            for name in METRICS
        },
        "economics": {
            "spot": {
                arm: economics(args.spot_fleet_hourly_usd, arm_values)
                for arm, arm_values in values.items()
            },
            "ondemand_equivalent": {
                arm: economics(args.ondemand_fleet_hourly_usd, arm_values)
                for arm, arm_values in values.items()
            },
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
