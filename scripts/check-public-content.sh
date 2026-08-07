#!/usr/bin/env bash
set -euo pipefail

patterns=(
  'arn:aws[^:]*:[^:]*:[^:]*:[0-9]{12}:'
  '[0-9]{12}\.dkr\.ecr\.'
  '(^|[^0-9.])[0-9]{12}([^0-9]|$)'
  '[[:alnum:]._%+-]+@amazon\.com'
  '/Users/[[:alnum:]_.-]+/'
  'ac-rag'
  'ip-10-[0-9-]+'
  '\.compute\.internal'
  'AKIA[0-9A-Z]{16}'
  'ASIA[0-9A-Z]{16}'
  'aws_secret_access_key'
  'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'
  'github_pat_[A-Za-z0-9_]+'
  'ghp_[A-Za-z0-9]+'
)

args=(
  --line-number
  --hidden
  --glob '!.git/**'
  --glob '!node_modules/**'
  --glob '!scripts/check-public-content.sh'
)
for pattern in "${patterns[@]}"; do
  args+=(-e "$pattern")
done

if rg "${args[@]}" .; then
  echo "Potential private or credential-bearing content found." >&2
  exit 1
fi

if find . -type f \( -name '*.tfstate' -o -name 'kubeconfig*' -o -name '.env' \) -print | grep -q .; then
  echo "Forbidden state, kubeconfig, or environment file found." >&2
  exit 1
fi

echo "Public-content safety scan passed."
