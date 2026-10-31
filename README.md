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

## Use it from an agent

`SKILL.md` makes this repository an agent skill in the open SKILL.md format (Claude Code, Codex CLI, Cursor and
others read it). The agent runs `scripts/kar-conform.mjs`, one Node.js 20+ file with no dependencies and no network,
and gets the same verdicts and the same receipt hash as this page:

    node scripts/kar-conform.mjs examples/four-runs.json

`node make-zip.mjs` checks the package against Agensi's published rules and builds `dist/kar-conform.zip`, the
upload for the Agensi skill marketplace. CI builds the same ZIP on every push and prints its SHA-256.

## Proof

- **One source of truth:** the KERNEL block of `index.html` is the verifier. `node build.mjs` copies it
  byte-for-byte into `kernel.mjs` and into the skill script; CI fails if the three ever differ.
- **Tests:** `npm test` runs the kernel tests, and runs the skill script alone in an empty folder, the way
  Agensi runs it, against the expected outputs in `examples/`.
- **Mutation gate:** witness v0.6 made 95 single-operator mutants of `kernel.mjs` and the tests caught
  94; the other 1 is an equivalent mutant, reasons in `witness.baseline.json`. Receipt: `receipts/witness.json` (kernel SHA-256 `9fe8c3a532e367cb…`).
  CI re-runs the gate on every push: https://github.com/sjgant80-hub/kar-conform/actions/workflows/ci.yml

Powered by the Konomi architecture, created by Thomas Frumkin. MIT licence (see `LICENSE`).
