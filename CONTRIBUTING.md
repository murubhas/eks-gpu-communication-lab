# Contributing

Contributions should preserve the distinction between conceptual architecture
and measured evidence.

## Before submitting a change

1. Use authoritative vendor documentation for architectural claims.
2. Put dated measurements under an `observed/` directory and record the exact
   hardware, image digest, workload, and pass/fail criteria.
3. Never present transport initialization alone as an application-performance
   result.
4. Keep manifests generic: no account IDs, private registries, cluster ARNs,
   personal email addresses, or environment-specific secrets.
5. Run `npm run check`.

## Diagrams

Edit the generators under `tools/diagrams/`, then run:

```bash
npm install
npm run build:diagrams
```

Commit both the SVG and PNG outputs so readers can inspect the visuals without
installing Node.js.
