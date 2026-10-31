// skill.test.mjs — the shipped skill script, run the way Agensi runs it.
//
// Agensi writes the script unchanged to a temporary file and runs it there, where it cannot read any
// other file of the package. So each test copies scripts/<name>.mjs ALONE into an empty temporary
// folder, runs it on an example input, and compares exit code + stdout with the committed expected
// output (examples/<case>.out.json). If the script leaned on a neighbour file, or its output drifted
// from what the examples promise, this fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const NAME = JSON.parse(readFileSync('package.json', 'utf8')).name;
const SCRIPT = resolve(`scripts/${NAME}.mjs`);
// a tool that promises ASCII-only output (package.json agensi.asciiOutput) writes every non-ASCII character as \u
const ASCII = Boolean((JSON.parse(readFileSync('package.json', 'utf8')).agensi || {}).asciiOutput);
const serialise = (v) => {
  const s = JSON.stringify(v, null, 2);
  return ASCII ? s.replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) : s;
};

function runAlone(args, input) {
  const dir = mkdtempSync(join(tmpdir(), 'agensi-'));
  try {
    const script = join(dir, `${NAME}.mjs`);
    copyFileSync(SCRIPT, script);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', input, env, cwd: process.cwd() });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cases = existsSync('examples') ? readdirSync('examples').filter((f) => f.endsWith('.json') && !f.endsWith('.out.json')) : [];

test('there is at least one example with an expected output', () => {
  assert.ok(cases.length > 0);
  for (const c of cases) assert.ok(existsSync(`examples/${c.replace(/\.json$/, '.out.json')}`), `${c} has no .out.json`);
});

for (const c of cases) {
  const expected = JSON.parse(readFileSync(`examples/${c.replace(/\.json$/, '.out.json')}`, 'utf8'));
  test(`examples/${c}: file argument → the committed report, byte for byte`, () => {
    const r = runAlone([resolve(`examples/${c}`)]);
    assert.equal(r.stderr, '');
    assert.equal(r.status, expected.exitCode);
    assert.deepEqual(JSON.parse(r.stdout), expected.report);
    assert.equal(r.stdout, serialise(expected.report) + '\n');
    if (ASCII) assert.doesNotMatch(r.stdout, /[^\x00-\x7f]/);
  });
  test(`examples/${c}: the same input on stdin (-) → the same report`, () => {
    const r = runAlone(['-'], readFileSync(`examples/${c}`, 'utf8'));
    assert.equal(r.status, expected.exitCode);
    assert.deepEqual(JSON.parse(r.stdout), expected.report);
  });
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.agensi && pkg.agensi.selftest) {
  test('--selftest: every built-in self-check of the live page passes in the shipped script', () => {
    const r = runAlone(['--selftest']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.ok(out.total > 0);
    assert.equal(out.passed, out.total);
    for (const t of out.selftest) assert.equal(t.ok, true, t.name + t.detail);
  });
}

test('no input → usage on stderr, exit 2, nothing on stdout', () => {
  const r = runAlone([]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /usage/);
});

test('input that is not JSON → exit 2 with a reason, never a stack trace', () => {
  const r = runAlone(['-'], '{ not json');
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /JSON/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test('a missing input file → exit 2 with a reason', () => {
  const r = runAlone([join(tmpdir(), 'no-such-input-' + process.pid + '.json')]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});
