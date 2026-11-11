---
name: "kar-conform"
description: "Checks one or more JSON outputs against a JSON Schema contract and lists every violation with its exact path, then hashes each output's canonical form so a reformatted answer is told apart from a real change between runs. Use when the user asks to validate structured or tool-call output against a schema, to check that a model's JSON matches its contract, or to compare several runs of the same prompt for drift. Deterministic Node.js script with no LLM judge and no network."
summary: "Does the JSON keep its contract? PASS or FAIL per output with every violation path, plus a canonical SHA-256 per output that separates reformatting from real drift across runs. JSON Schema subset, no LLM judge, no network, mutation-tested."
version: "1.0.0"
tags: ["json-schema", "structured-output", "validation", "tool-calls", "drift-detection", "deterministic"]
use_cases: ["Validate a model's structured output against its schema before it reaches a downstream system", "Run the same extraction prompt several times and see whether the answers really differ", "Give a reviewer a recomputable PASS or FAIL for every output, with the violation paths"]
docs_url: "https://sjgant80-hub.github.io/kar-conform/"
---

# Kar-Conform: does the JSON keep its contract?

A model can return JSON that parses and still breaks its contract: a number sent as a string, a missing
field, an extra key, an empty list. Kar-Conform checks each output against the JSON Schema you give it and
names every violation by path (`$/age`, `$/tags[2]`). Then it writes each output in a canonical form (keys
sorted, numbers and strings normalised, no whitespace) and hashes it with SHA-256:

- outputs with the same hash are the same answer, however differently they were formatted;
- passing outputs with different hashes really differ, which is drift between runs, not formatting.

Supported keywords: `type` (including `integer` and lists of types), `enum`, `const`, `required`,
`properties`, `patternProperties`, `additionalProperties`, `minProperties`, `maxProperties`, `items` (one
schema or a tuple), `additionalItems`, `minItems`, `maxItems`, `uniqueItems`, `minLength`, `maxLength`,
`pattern`, `format` (best-effort `email`, `date-time`, `date`, `uri`, `uuid`), `minimum`, `maximum`,
`exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `allOf`, `anyOf`, `oneOf`, `not`, local `$ref`
(`#/...`), and `true` / `false` schemas.

## When to use it

- Before structured output (an extraction, a tool call's arguments, an API payload) is passed on.
- When the user asks whether some JSON matches a schema, and exactly where it does not.
- When the same prompt has been run several times and you need to know if the answers differ in content.

## How to run it

The script is `scripts/kar-conform.mjs`: one file, Node.js 20 or newer, no dependencies, no network, and it
writes no files. Run it unchanged and keep the `.mjs` extension.

1. With files: `node scripts/kar-conform.mjs schema.json output1.json [output2.json …]`. Each output is
   named by its path. Any one path can be `-` for stdin.
2. Or in one JSON input, from a file or stdin. Give each output as raw text in `json` (so text that is not
   valid JSON is caught as a failure) or as a parsed value in `value`:

   ```json
   {
     "schema": { "type": "object", "required": ["id"], "properties": { "id": { "type": "integer" } } },
     "outputs": [ { "name": "run 1", "json": "{\"id\": 7}" }, { "name": "run 2", "value": { "id": "7" } } ]
   }
   ```

   `node scripts/kar-conform.mjs input.json` or `node scripts/kar-conform.mjs -`.
3. Read the exit code: `0` every output passes, `1` at least one fails, `2` the input could not be used (for
   example a schema that is not JSON; the reason is on stderr).
4. Report PASS or FAIL per output with each violation as path and message. Then report `consistency`: one
   group means every passing output is the same answer; several groups mean the runs really disagree, and
   name which outputs are in which group. Never report a FAIL output as valid.

## What it prints

`examples/four-runs.json` checks four runs of a person-extraction prompt: a good one, a tampered one, the
good one reformatted, and a valid but different one. The report (`examples/four-runs.out.json`, exit code 1)
reads, in part:

```json
{
  "tool": "kar-conform",
  "algorithm": "kar-conform-v2",
  "verdict": "SOME_FAIL",
  "results": [
    { "name": "Run 1", "verdict": "PASS", "errors": [], "sha256": "54e8eda18d5d…" },
    { "name": "Run 2 (tampered)", "verdict": "FAIL", "errors": [
        { "path": "$/age", "message": "type mismatch: expected integer, got string" },
        { "path": "$/email", "message": "string does not match pattern ^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
        { "path": "$/tags", "message": "array has fewer than minItems=1" },
        { "path": "$/extra_field", "message": "unexpected property 'extra_field' (additionalProperties: false)" } ] },
    { "name": "Run 3 (reformatted, same content as Run 1)", "verdict": "PASS", "sha256": "54e8eda18d5d…" },
    { "name": "Run 4 (valid, but actually different)", "verdict": "PASS", "sha256": "0c52d07ea607…" }
  ],
  "consistency": { "passing": 3, "comparable": true, "groups": [
    { "hash": "54e8eda18d5d…", "names": ["Run 1", "Run 3 (reformatted, same content as Run 1)"] },
    { "hash": "0c52d07ea607…", "names": ["Run 4 (valid, but actually different)"] } ] }
}
```

Each result also carries its `canonical` form, and the report carries the schema's own `schemaSha256`.

## Re-check this skill yourself

Everything here is deterministic: the same schema and outputs give the same violations and the same hashes on
any machine, and no language model judges anything.

- **A hash:** each result's `canonical` string hashed with any SHA-256 tool gives its `sha256`. The canonical
  form is fully specified above, so it can be re-implemented in another language.
- **The example:** `node scripts/kar-conform.mjs examples/four-runs.json` prints exactly the report in
  `examples/four-runs.out.json`.
- **The page:** https://sjgant80-hub.github.io/kar-conform/ runs the same validator in a browser; it loads
  these four runs as its example and checks itself on load.
- **The source:** https://github.com/sjgant80-hub/kar-conform (MIT). The script's KERNEL block is
  byte-identical to the logic of the live page and to `kernel.mjs`; CI fails if they ever differ. The tests
  check every keyword above at its boundary, with the exact message.
- **CI on every push:** https://github.com/sjgant80-hub/kar-conform/actions/workflows/ci.yml runs the tests,
  the byte-identity check, the receipt check, the witness mutation gate and the ZIP build, and prints the
  ZIP's SHA-256.
- **The mutation gate:** witness v0.6 (https://github.com/sjgant80-hub/witness, tag `v0.6`) made
  106 single-operator changes (mutants) to the kernel and the tests caught 105 of them. The other 1 is an equivalent mutant: it cannot change behaviour, and its measured reason is in `witness.baseline.json`. The receipt is
  `receipts/witness.json` in the repository, for kernel SHA-256 `70e193e058b40fbcabaaa1361a243f3da63e5ebe6a6e30895555e8cc05697ae3`. With the repository and
  witness v0.6 side by side, `node gate.mjs --witness ../witness/witness.mjs` re-runs it.

## Where it stops

- It checks shape, not truth: an output can satisfy the schema and still be factually wrong.
- It checks the keywords listed above. Any other rule in the schema (`if` / `then` / `else`, `prefixItems`,
  `dependentRequired`, `unevaluatedProperties`, `$dynamicRef`, …), and any `$ref` it cannot follow (a URL, or a
  local name that is not there), FAILS every output with a message naming the rule and its schema path: it never
  passes an output against a rule it did not check. Version 1 skipped such rules silently, so an output that broke
  an `if` / `then` rule, or any schema with an unfollowable `$ref` inside `not`, came back PASS. An unknown
  `format` name is not checked, as the JSON Schema standard allows.
- `format` checks are best-effort patterns, and `pattern` uses JavaScript regular expressions.

---

MIT licence: see `LICENSE`.
