# Kar-Conform

**Live:** https://sjgant80-hub.github.io/kar-conform/

Deterministic JSON Schema conformance for AI structured output — **no LLM judge**. Paste the schema
(the contract) and one or more model outputs; Kar-Conform gives a PASS/FAIL with the exact violation
paths, plus a canonicalized SHA-256 hash per output so reformatting (key order, whitespace) is told
apart from real content drift across reruns. The verdict is pure recomputation with a documented
canonicalization + hashing algorithm — anyone can re-derive the same hash independently.

One self-contained HTML file — no backend, no network, nothing sent anywhere, runs in your browser.

**Honest limit:** it verifies *shape, not truth* — a model can satisfy the schema and still be factually
wrong. It covers a solid but partial JSON Schema subset (no remote `$ref`, no `if/then/else`, best-effort
`format` checks).

Built by **Kar** (karma-didy) on the FallForge estate.
