#!/usr/bin/env bash
set -euo pipefail

ARM="${1:?usage: $0 <arm-label> <base-url>}"
BASE_URL="${2:?usage: $0 <arm-label> <base-url>}"
CONTEXT="${CONTEXT:?set CONTEXT to the target EKS context}"
NAMESPACE="${NAMESPACE:-gpu-communication-lab}"
RUNNER="${RUNNER:-aiperf-runner}"
MODEL="${MODEL:?set MODEL to the served model name}"
CONCURRENCY="${CONCURRENCY:-48}"
DURATION_SECONDS="${DURATION_SECONDS:-1500}"
GRACE_SECONDS="${GRACE_SECONDS:-30}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
ARTIFACT_DIR="/tmp/p5-routing-${ARM}-c${CONCURRENCY}-${RUN_ID}"

kubectl --context "${CONTEXT}" -n "${NAMESPACE}" exec "${RUNNER}" -- \
  /bin/sh -lc "
    set -eu
    mkdir -p '${ARTIFACT_DIR}'
    nohup aiperf profile \\
      --model '${MODEL}' \\
      --url '${BASE_URL}' \\
      --endpoint-type chat \\
      --streaming \\
      --concurrency '${CONCURRENCY}' \\
      --benchmark-duration '${DURATION_SECONDS}' \\
      --benchmark-grace-period '${GRACE_SECONDS}' \\
      --isl 256 \\
      --osl 128 \\
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
