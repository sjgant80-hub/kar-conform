// cli.test.mjs — the schema-plus-files mode of the shipped script (the one-input mode is in skill.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function inTemp(files, args, input) {
  const dir = mkdtempSync(join(tmpdir(), 'kar-conform-'));
  try {
    copyFileSync(resolve('scripts/kar-conform.mjs'), join(dir, 'kar-conform.mjs'));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, ['kar-conform.mjs', ...args], { cwd: dir, encoding: 'utf8', input, env });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const SCHEMA = JSON.stringify({ type: 'object', required: ['id'], properties: { id: { type: 'integer' } }, additionalProperties: false });

test('schema + two output files: names are the paths, reformatting is not drift', () => {
  const r = inTemp({ 's.json': SCHEMA, 'a.json': '{ "id": 7 }\n', 'b.json': '{"id":7}' }, ['s.json', 'a.json', 'b.json']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.verdict, 'ALL_PASS');
  assert.deepEqual(out.results.map((x) => [x.name, x.verdict]), [['a.json', 'PASS'], ['b.json', 'PASS']]);
  assert.equal(out.consistency.groups.length, 1);
});

test('an output file that is not JSON fails as that output, with the parse error; the run carries on', () => {
  const r = inTemp({ 's.json': SCHEMA, 'a.json': '{"id": 7', 'b.json': '{"id": "7"}' }, ['s.json', 'a.json', 'b.json']);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.results[0].verdict, 'FAIL');
  assert.match(out.results[0].parseError, /JSON/);
  assert.equal(out.results[0].sha256, null);
  assert.deepEqual(out.results[1].errors, [{ path: '$/id', message: 'type mismatch: expected integer, got string' }]);
});

test('an output on stdin is named stdin; a schema that is not JSON, or two stdins, is exit 2', () => {
  const r = inTemp({ 's.json': SCHEMA }, ['s.json', '-'], '{"id": 1}');
  assert.equal(JSON.parse(r.stdout).results[0].name, 'stdin');
  const bad = inTemp({ 's.json': '{ nope', 'a.json': '{}' }, ['s.json', 'a.json']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /schema s\.json is not valid JSON/);
  const two = inTemp({}, ['-', '-'], '{}');
  assert.equal(two.status, 2);
  assert.match(two.stderr, /only one/);
});

test('one-input form: a "value" output, and the shape errors', () => {
  const ok = inTemp({ 'i.json': JSON.stringify({ schema: JSON.parse(SCHEMA), outputs: [{ value: { id: 3 } }] }) }, ['i.json']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).results[0].name, 'output 1');
  const noOutputs = inTemp({ 'i.json': JSON.stringify({ schema: true, outputs: [] }) }, ['i.json']);
  assert.equal(noOutputs.status, 2);
  const badOut = inTemp({ 'i.json': JSON.stringify({ schema: true, outputs: [{ name: 'x' }] }) }, ['i.json']);
  assert.equal(badOut.status, 2);
  assert.match(badOut.stderr, /outputs\[0\] needs/);
  const badSchema = inTemp({ 'i.json': JSON.stringify({ schema: 5, outputs: [{ value: 1 }] }) }, ['i.json']);
  assert.equal(badSchema.status, 2);
  assert.match(badSchema.stderr, /schema must be/);
});
