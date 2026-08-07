#!/usr/bin/env bash
set -euo pipefail

node tools/diagrams/build_interconnect_diagrams.mjs
node tools/diagrams/build_p5_efa_stack_diagrams.mjs
