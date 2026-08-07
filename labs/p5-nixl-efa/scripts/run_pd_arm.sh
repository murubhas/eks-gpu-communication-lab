#!/usr/bin/env bash
set -euo pipefail

ARM="${1:?usage: $0 <arm-label> <base-url> <model>}"
BASE_URL="${2:?usage: $0 <arm-label> <base-url> <model>}"
MODEL="${3:?usage: $0 <arm-label> <base-url> <model>}"
CONTEXT="${CONTEXT:?set CONTEXT to the target EKS context}"
NAMESPACE="${NAMESPACE:-gpu-communication-lab}"
RUNNER="${RUNNER:-aiperf-runner}"
CONCURRENCY="${CONCURRENCY:-16}"
REQUEST_COUNT="${REQUEST_COUNT:-400}"
ISL="${ISL:-4096}"
OSL="${OSL:-128}"
WARMUP_REQUEST_COUNT="${WARMUP_REQUEST_COUNT:-16}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
ARTIFACT_DIR="/tmp/p5-pd-${ARM}-c${CONCURRENCY}-r${REQUEST_COUNT}-isl${ISL}-osl${OSL}-${RUN_ID}"

kubectl --context "${CONTEXT}" -n "${NAMESPACE}" exec "${RUNNER}" -- \
  /bin/sh -lc "
    set -eu
    mkdir -p '${ARTIFACT_DIR}'
    date -u +%s >'${ARTIFACT_DIR}/run-start-epoch.txt'
    date -u +%Y-%m-%dT%H:%M:%SZ >'${ARTIFACT_DIR}/run-start-utc.txt'
    nohup aiperf profile \\
      --model '${MODEL}' \\
      --url '${BASE_URL}' \\
      --endpoint-type chat \\
      --streaming \\
      --concurrency '${CONCURRENCY}' \\
      --request-count '${REQUEST_COUNT}' \\
      --warmup-request-count '${WARMUP_REQUEST_COUNT}' \\
      --isl '${ISL}' \\
      --osl '${OSL}' \\
      --random-seed 42 \\
      --tokenizer builtin \\
      --use-legacy-max-tokens \\
      --extra-inputs '{\"chat_template_kwargs\":{\"enable_thinking\":false},\"ignore_eos\":true}' \\
      --connection-reuse-strategy never \\
      --no-gpu-telemetry \\
      --no-server-metrics \\
      --ui-type simple \\
      -v \\
      --artifact-dir '${ARTIFACT_DIR}' \\
      >'${ARTIFACT_DIR}/console.log' 2>&1 &
    echo \$! >'${ARTIFACT_DIR}/aiperf.pid'
    echo 'artifact_dir=${ARTIFACT_DIR}'
    echo 'pid='\$(cat '${ARTIFACT_DIR}/aiperf.pid')
  "
