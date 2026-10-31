// cli.mjs — Kar-Conform on the command line. build.mjs bundles this with the KERNEL block of index.html into
// scripts/kar-conform.mjs, the single file the Agensi skill runs. It checks one or more JSON outputs against a
// JSON Schema contract, lists every violation by path, and hashes each output's canonical form so reformatting
// is told apart from real drift between runs. Exit 0 = every output passes · 1 = at least one fails · 2 = bad input.
import { readFileSync } from 'node:fs';
import { ALGO_VERSION, canonicalize, sha256Hex, checkCandidates, consistencyOf } from './kernel.mjs';

const USAGE = `usage: node kar-conform.mjs <schema.json> <output.json> [more outputs…]   (any one path may be - for stdin)
       node kar-conform.mjs <input.json | ->
input:  {"schema": {…JSON Schema…}, "outputs": [{"name": "run 1", "json": "<raw JSON text>"} or {"name": "run 2", "value": {…}}]}
output: a JSON report on stdout. exit 0 = every output passes, 1 = at least one fails, 2 = bad input`;

class InputError extends Error {}
const fail = (msg) => { throw new InputError(msg); };

function readText(path) {
  try { return readFileSync(path === '-' ? 0 : path, 'utf8'); }
  catch (e) { return fail(`cannot read ${path === '-' ? 'stdin' : path}: ${e.code || e.message}`); }
}
function parseJson(text, what) {
  try { return JSON.parse(text); } catch (e) { return fail(`${what} is not valid JSON (${e.message})`); }
}

async function conform(schema, outputs) {
  if (schema === null || (typeof schema !== 'object' && typeof schema !== 'boolean')) fail('the schema must be a JSON object or a boolean');
  if (!outputs.length) fail('there are no outputs to check');
  const results = await checkCandidates(schema, outputs);
  const allPass = results.every((r) => r.valid);
  return {
    exitCode: allPass ? 0 : 1,
    report: {
      tool: 'kar-conform',
      algorithm: ALGO_VERSION,
      verdict: allPass ? 'ALL_PASS' : 'SOME_FAIL',
      schemaSha256: await sha256Hex(canonicalize(schema)),
      results: results.map((r) => ({
        name: r.name,
        verdict: r.valid ? 'PASS' : 'FAIL',
        ...(r.parseError ? { parseError: r.parseError } : {}),
        errors: r.errors,
        sha256: r.hash,
        canonical: r.canonical,
      })),
      consistency: consistencyOf(results),
    },
  };
}

async function main(args) {
  if (args.filter((a) => a === '-').length > 1) fail('only one input can come from stdin');
  let schema, outputs;
  if (args.length >= 2) {
    schema = parseJson(readText(args[0]), `the schema ${args[0]}`);
    outputs = args.slice(1).map((p) => ({ name: p === '-' ? 'stdin' : p, json: readText(p).trim() }));
  } else if (args.length === 1 && args[0] !== '-h' && args[0] !== '--help') {
    const input = parseJson(readText(args[0]), 'the input');
    if (!input || typeof input !== 'object' || !('schema' in input) || !Array.isArray(input.outputs)) {
      fail('a single input must be an object with "schema" and an "outputs" array');
    }
    schema = input.schema;
    outputs = input.outputs.map((o, i) => {
      const name = o && typeof o.name === 'string' && o.name ? o.name : `output ${i + 1}`;
      if (o && typeof o.json === 'string') return { name, json: o.json.trim() };
      if (o && 'value' in o) return { name, json: JSON.stringify(o.value) };
      return fail(`outputs[${i}] needs "json" (raw text) or "value" (a JSON value)`);
    });
  } else {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  const { exitCode, report } = await conform(schema, outputs);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return exitCode;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`kar-conform: ${e instanceof InputError ? e.message : 'internal error: ' + (e && e.message)}\n`);
  process.exitCode = e instanceof InputError ? 2 : 3;
}
