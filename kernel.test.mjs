// kernel.test.mjs — Kar-Conform's kernel (the KERNEL block of index.html, generated into kernel.mjs).
// Every keyword is tested at its boundary with the exact message a buyer's agent will read; expected values
// are worked out by hand from the JSON Schema rules. witness v0.6 checks that every test bites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALGO_VERSION, canonicalize, sha256Hex, deepEqual, typeOf, typeMatches, resolveRef, FORMAT_RE, validate, runValidation,
  checkCandidates, consistencyOf, CHECKED_KEYWORDS, ANNOTATION_KEYWORDS, unsupportedKeywords,
} from './kernel.mjs';

const errs = (schema, instance) => runValidation(schema, instance).map((e) => `${e.path}: ${e.message}`);
const ok = (schema, instance) => assert.deepEqual(errs(schema, instance), [], JSON.stringify({ schema, instance }));

test('the algorithm name', () => assert.equal(ALGO_VERSION, 'kar-conform-v2'));

test('canonicalize: every JSON type; keys sorted; -0 is 0; non-JSON refused', () => {
  assert.equal(canonicalize(null), 'null');
  assert.equal(canonicalize(true), 'true');
  assert.equal(canonicalize(false), 'false');
  assert.equal(canonicalize(-0), '0');
  assert.equal(canonicalize(2.50), '2.5');
  assert.equal(canonicalize('é"'), '"é\\""');
  assert.equal(canonicalize({ b: [1, { d: 0, c: null }], a: 'x' }), '{"a":"x","b":[1,{"c":null,"d":0}]}');
  assert.throws(() => canonicalize(Infinity), /non-finite/);
  assert.throws(() => canonicalize(undefined), /unsupported JSON value/);
});

test('sha256Hex: the FIPS 180-2 test vector', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('deepEqual: equal canonical forms; anything that cannot be canonicalised is unequal', () => {
  assert.equal(deepEqual({ a: 1, b: [2] }, { b: [2], a: 1 }), true);
  assert.equal(deepEqual({ a: 1 }, { a: 2 }), false);
  assert.equal(deepEqual(undefined, undefined), false);
});

test('typeOf and typeMatches: integer is a number, a number is not an integer', () => {
  assert.deepEqual([null, [], 1, 1.5, true, 's', {}, undefined].map(typeOf),
    ['null', 'array', 'integer', 'number', 'boolean', 'string', 'object', 'undefined']);
  assert.equal(typeMatches('number', 'integer'), true);
  assert.equal(typeMatches('number', 'number'), true);
  assert.equal(typeMatches('number', 'string'), false);
  assert.equal(typeMatches('integer', 'number'), false);
  assert.equal(typeMatches('string', 'string'), true);
  assert.equal(typeMatches('string', 'object'), false);
});

test('resolveRef: local JSON pointers only, with ~0 / ~1 escapes', () => {
  const root = { $defs: { 'a/b': { type: 'string' }, 'm~n': 1, s: 'str' } };
  assert.deepEqual(resolveRef('#/$defs/a~1b', root), { type: 'string' });
  assert.equal(resolveRef('#/$defs/m~0n', root), 1);
  assert.equal(resolveRef('#', root), root);
  assert.throws(() => resolveRef('http://x/s.json', root), { message: 'unsupported $ref (only local \'#/...\' refs are supported): http://x/s.json' });
  assert.throws(() => resolveRef(5, root), { message: 'unsupported $ref (only local \'#/...\' refs are supported): 5' });
  assert.throws(() => resolveRef('#/$defs/missing', root), { message: 'cannot resolve $ref #/$defs/missing' });
  assert.throws(() => resolveRef('#/$defs/s/length', root), { message: 'cannot resolve $ref #/$defs/s/length' });
  assert.throws(() => resolveRef('#/$defs/m~0n/x', root), { message: 'cannot resolve $ref #/$defs/m~0n/x' });
});

test('boolean and invalid schema nodes', () => {
  ok(true, { anything: 1 });
  assert.deepEqual(errs(false, 1), ['$: schema is `false`: nothing satisfies this location']);
  assert.deepEqual(errs(null, 1), ['$: invalid schema node (expected object or boolean)']);
  assert.deepEqual(errs(7, 1), ['$: invalid schema node (expected object or boolean)']);
  const e = [];
  validate(false, { x: 1 }, '$', false, e);
  assert.equal(e.length, 1);
});

test('$ref: followed, and an unresolvable one is a violation at its path', () => {
  const schema = { $defs: { id: { type: 'integer' } }, properties: { a: { $ref: '#/$defs/id' } } };
  ok(schema, { a: 3 });
  assert.deepEqual(errs(schema, { a: 'x' }), ['$/a: type mismatch: expected integer, got string']);
  const cannot = (msg, at) => '$: ' + msg + ' (at ' + at + '): this tool cannot follow it, so it fails the output';
  assert.deepEqual(errs({ $ref: '#/nope' }, 1), [cannot('cannot resolve $ref #/nope', '#')]);
  // validate() itself still reports a ref it cannot follow, at the instance path, for callers that skip runValidation
  const e = [];
  validate({ properties: { a: { $ref: '#/nope' } } }, { a: 1 }, '$', {}, e);
  assert.deepEqual(e, [{ path: '$/a', message: 'cannot resolve $ref #/nope' }]);
});

test('$ref it cannot follow: refused up front, so one inside not or oneOf can no longer pass (v1 passed it)', () => {
  const cannot = (msg, at) => '$: ' + msg + ' (at ' + at + '): this tool cannot follow it, so it fails the output';
  assert.deepEqual(errs({ not: { $ref: 'https://example.com/s.json' } }, { a: 1 }),
    [cannot("unsupported $ref (only local '#/...' refs are supported): https://example.com/s.json", '#/not')]);
  assert.deepEqual(errs({ not: { $ref: '#/$defs/missing' } }, { a: 1 }), [cannot('cannot resolve $ref #/$defs/missing', '#/not')]);
  assert.deepEqual(errs({ oneOf: [{ type: 'integer' }, { $ref: '#/x' }] }, 1), [cannot('cannot resolve $ref #/x', '#/oneOf/1')]);
  assert.deepEqual(errs({ properties: { a: { $ref: 5 } } }, {}), [cannot("unsupported $ref (only local '#/...' refs are supported): 5", '#/properties/a')]);
  // a ref that resolves is followed as before, from the root it was given
  ok({ $defs: { n: { type: 'integer' } }, not: { $ref: '#/$defs/n' }, type: 'string' }, 'x');
  assert.deepEqual(unsupportedKeywords({ $ref: '#/$defs/n' }, '#', [], { $defs: { n: {} } }), []);
  assert.equal(unsupportedKeywords({ $ref: '#/$defs/n' }, '#', [], {}).length, 1);
});

test('type: one type or a list; number accepts integers', () => {
  ok({ type: 'number' }, 3);
  ok({ type: ['string', 'null'] }, null);
  assert.deepEqual(errs({ type: 'integer' }, 3.5), ['$: type mismatch: expected integer, got number']);
  assert.deepEqual(errs({ type: ['string', 'null'] }, 1), ['$: type mismatch: expected string or null, got integer']);
});

test('enum and const compare by canonical value', () => {
  ok({ enum: [{ a: 1, b: 2 }, 'x'] }, { b: 2, a: 1 });
  assert.deepEqual(errs({ enum: ['x', 'y'] }, 'z'), ['$: value is not one of the allowed enum values']);
  ok({ const: [1, 2] }, [1, 2]);
  assert.deepEqual(errs({ const: [1, 2] }, [2, 1]), ['$: value does not equal the required const']);
});

test('object: required, properties, patternProperties, additionalProperties', () => {
  const s = { required: ['id'], properties: { id: { type: 'integer' } } };
  ok(s, { id: 1 });
  assert.deepEqual(errs(s, {}), ["$: missing required property 'id'"]);
  assert.deepEqual(errs(s, { id: 'x' }), ['$/id: type mismatch: expected integer, got string']);
  assert.deepEqual(errs({ required: ['a'] }, { a: undefined, b: 1 }), []);
  const p = { patternProperties: { '^x_': { type: 'string' } }, additionalProperties: false };
  ok(p, { x_a: 's' });
  assert.deepEqual(errs(p, { x_a: 1, y: 2 }), ['$/x_a: type mismatch: expected string, got integer', "$/y: unexpected property 'y' (additionalProperties: false)"]);
  const both = { properties: { a: {} }, patternProperties: { '^x': {} }, additionalProperties: false };
  ok(both, { a: 1, x1: 2 });
  assert.deepEqual(errs({ properties: { a: {} }, additionalProperties: { type: 'boolean' } }, { a: 1, b: true, c: 2 }),
    ['$/c: type mismatch: expected boolean, got integer']);
  ok({ additionalProperties: true }, { anything: 1 });
  // an invalid pattern is skipped, never thrown, and does not count as a match
  assert.deepEqual(errs({ patternProperties: { '(': {} }, additionalProperties: false }, { k: 1 }),
    ["$/k: unexpected property 'k' (additionalProperties: false)"]);
});

test('object: minProperties and maxProperties are inclusive bounds', () => {
  ok({ minProperties: 2, maxProperties: 2 }, { a: 1, b: 2 });
  assert.deepEqual(errs({ minProperties: 2 }, { a: 1 }), ['$: object has fewer than minProperties=2']);
  assert.deepEqual(errs({ maxProperties: 1 }, { a: 1, b: 2 }), ['$: object has more than maxProperties=1']);
  ok({ minProperties: '2', maxProperties: '0' }, { a: 1 });   // not numbers: ignored
});

test('array: items, tuples, additionalItems, minItems, maxItems, uniqueItems', () => {
  ok({ items: { type: 'integer' } }, [1, 2]);
  assert.deepEqual(errs({ items: { type: 'integer' } }, [1, 'x']), ['$[1]: type mismatch: expected integer, got string']);
  const tuple = { items: [{ type: 'string' }, { type: 'integer' }] };
  ok(tuple, ['a', 1, true]);
  ok(tuple, ['a']);
  assert.deepEqual(errs({ ...tuple, additionalItems: false }, ['a', 1, true]), ['$[2]: unexpected extra tuple item (additionalItems: false)']);
  assert.deepEqual(errs({ ...tuple, additionalItems: { type: 'boolean' } }, ['a', 1, true, 0]), ['$[3]: type mismatch: expected boolean, got integer']);
  ok({ minItems: 2, maxItems: 2 }, [1, 2]);
  assert.deepEqual(errs({ minItems: 2 }, [1]), ['$: array has fewer than minItems=2']);
  assert.deepEqual(errs({ maxItems: 1 }, [1, 2]), ['$: array has more than maxItems=1']);
  ok({ minItems: '9', maxItems: '0' }, [1]);
  ok({ uniqueItems: true }, [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(errs({ uniqueItems: true }, [{ a: 1, b: 2 }, 3, { b: 2, a: 1 }, 3]), ['$: array elements must be unique (uniqueItems: true)']);
});

test('string: minLength, maxLength, pattern, format', () => {
  ok({ minLength: 2, maxLength: 2 }, 'ab');
  assert.deepEqual(errs({ minLength: 2 }, 'a'), ['$: string shorter than minLength=2']);
  assert.deepEqual(errs({ maxLength: 1 }, 'ab'), ['$: string longer than maxLength=1']);
  ok({ minLength: '5', maxLength: '0' }, 'abc');
  ok({ pattern: '^a+$' }, 'aaa');
  assert.deepEqual(errs({ pattern: '^a+$' }, 'ab'), ['$: string does not match pattern ^a+$']);
  assert.deepEqual(errs({ pattern: '(' }, 'x'), ['$: schema pattern is not a valid regex: (']);
  ok({ format: 'email' }, 'ada@example.com');
  assert.deepEqual(errs({ format: 'email' }, 'ada AT example'), ["$: string does not look like format 'email' (best-effort check)"]);
  ok({ format: 'not-a-known-format' }, 'anything');
  ok({ pattern: '^a' }, 5);   // string keywords do not apply to numbers
});

test('FORMAT_RE: the five best-effort formats', () => {
  assert.equal(FORMAT_RE['date-time'].test('2026-10-31T14:00:00Z'), true);
  assert.equal(FORMAT_RE['date-time'].test('2026-10-31 14:00'), false);
  assert.equal(FORMAT_RE.date.test('2026-10-31'), true);
  assert.equal(FORMAT_RE.uri.test('https://x.y/z'), true);
  assert.equal(FORMAT_RE.uri.test('no scheme'), false);
  assert.equal(FORMAT_RE.uuid.test('123e4567-e89b-12d3-a456-426614174000'), true);
});

test('numbers: minimum and maximum inclusive, exclusive bounds exclusive, for integers and decimals', () => {
  ok({ minimum: 0, maximum: 130 }, 0);
  ok({ minimum: 0, maximum: 130 }, 130);
  assert.deepEqual(errs({ minimum: 0 }, -1), ['$: value -1 is below minimum=0']);
  assert.deepEqual(errs({ minimum: 0.5 }, 0.25), ['$: value 0.25 is below minimum=0.5']);
  assert.deepEqual(errs({ maximum: 130 }, 131), ['$: value 131 is above maximum=130']);
  assert.deepEqual(errs({ exclusiveMinimum: 0 }, 0), ['$: value 0 must be > exclusiveMinimum=0']);
  ok({ exclusiveMinimum: 0 }, 0.5);
  assert.deepEqual(errs({ exclusiveMaximum: 1 }, 1), ['$: value 1 must be < exclusiveMaximum=1']);
  ok({ exclusiveMaximum: 1 }, 0.5);
  ok({ minimum: '9', maximum: '0', exclusiveMinimum: '9', exclusiveMaximum: '0' }, 5);
  ok({ minimum: 10 }, 'not a number');
});

test('multipleOf: within 1e-9 of a whole ratio; zero or negative divisors are ignored', () => {
  ok({ multipleOf: 0.1 }, 0.3);
  assert.deepEqual(errs({ multipleOf: 2 }, 3), ['$: value 3 is not a multiple of 2']);
  ok({ multipleOf: 1 }, 1e-9);                    // exactly at the tolerance: accepted
  assert.deepEqual(errs({ multipleOf: 1 }, 2e-9), ['$: value 2e-9 is not a multiple of 1']);
  ok({ multipleOf: 0 }, 3);
  ok({ multipleOf: '2' }, 3);
});

test('allOf, anyOf, oneOf, not', () => {
  assert.deepEqual(errs({ allOf: [{ type: 'integer' }, { minimum: 5 }] }, 3), ['$: value 3 is below minimum=5']);
  ok({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 3);
  assert.deepEqual(errs({ anyOf: [{ type: 'string' }, { type: 'boolean' }] }, 3), ['$: value does not match any schema in anyOf (2 alternatives tried)']);
  ok({ oneOf: [{ type: 'string' }, { type: 'integer' }] }, 3);
  assert.deepEqual(errs({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 3), ['$: value matched 2 of 2 oneOf alternatives (exactly 1 required)']);
  assert.deepEqual(errs({ oneOf: [{ type: 'string' }] }, 3), ['$: value matched 0 of 1 oneOf alternatives (exactly 1 required)']);
  assert.deepEqual(errs({ not: { type: 'integer' } }, 3), ["$: value matches the schema under 'not', which is forbidden"]);
  ok({ not: { type: 'string' } }, 3);
});

const refused = (k, at) => "$: unsupported schema keyword '" + k + "' at " + at + ": this tool does not check it, so it fails the output rather than pass a rule it never checked";

test('unsupported keywords: the lists are exact, and every keyword on them is accepted', () => {
  assert.deepEqual(CHECKED_KEYWORDS, ['$ref', 'type', 'enum', 'const', 'required', 'properties', 'patternProperties', 'additionalProperties',
    'minProperties', 'maxProperties', 'items', 'additionalItems', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength',
    'pattern', 'format', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'allOf', 'anyOf', 'oneOf', 'not']);
  assert.deepEqual(ANNOTATION_KEYWORDS, ['$schema', '$id', '$defs', 'definitions', '$comment', '$anchor', 'title', 'description', 'default',
    'examples', 'deprecated', 'readOnly', 'writeOnly', 'contentMediaType', 'contentEncoding']);
  for (const k of [...CHECKED_KEYWORDS, ...ANNOTATION_KEYWORDS]) assert.deepEqual(unsupportedKeywords({ [k]: k === '$ref' ? '#' : true }, '#', [], {}), [], k);
  // the first entry of each list too (an off-by-one on indexOf would refuse exactly these)
  assert.deepEqual(unsupportedKeywords({ $ref: '#', $schema: 'x' }, '#', [], {}), []);
});

test('unsupported keywords: v1 passed an output that broke an if/then rule; v2 refuses the schema', () => {
  const schema = { type: 'object', if: { properties: { a: { const: 1 } } }, then: { required: ['b'] } };
  assert.deepEqual(errs(schema, { a: 1 }), [refused('if', '#'), refused('then', '#')]);
  // the refusal is all it reports: the rules it does check are not run on a schema it cannot finish
  assert.deepEqual(errs({ type: 'string', prefixItems: [] }, 5), [refused('prefixItems', '#')]);
  for (const k of ['else', 'dependentRequired', 'dependentSchemas', 'unevaluatedProperties', 'contains', 'propertyNames', 'nullable', '$dynamicRef']) {
    assert.deepEqual(errs({ [k]: {} }, {}), [refused(k, '#')], k);
  }
  ok({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: 't', description: 'd', type: 'object' }, {});
});

test('unsupported keywords: found anywhere in the schema, at their schema path, even inside not and oneOf', () => {
  const at = (schema) => unsupportedKeywords(schema, '#', []).map((e) => e.message.split(' at ')[1].split(':')[0]);
  const X = { if: {} };
  assert.deepEqual(at({ properties: { p: X } }), ['#/properties/p']);
  assert.deepEqual(at({ patternProperties: { '^a': X } }), ['#/patternProperties/^a']);
  assert.deepEqual(at({ $defs: { d: X } }), ['#/$defs/d']);
  assert.deepEqual(at({ definitions: { d: X } }), ['#/definitions/d']);
  assert.deepEqual(at({ additionalProperties: X }), ['#/additionalProperties']);
  assert.deepEqual(at({ additionalItems: X }), ['#/additionalItems']);
  assert.deepEqual(at({ not: X }), ['#/not']);
  assert.deepEqual(at({ items: X }), ['#/items']);
  assert.deepEqual(at({ items: [{}, X] }), ['#/items/1']);
  assert.deepEqual(at({ allOf: [X] }), ['#/allOf/0']);
  assert.deepEqual(at({ anyOf: [{}, X] }), ['#/anyOf/1']);
  assert.deepEqual(at({ oneOf: [{}, {}, X] }), ['#/oneOf/2']);
  assert.deepEqual(at({ properties: { a: { items: { not: X } } } }), ['#/properties/a/items/not']);
  // inside not, a refusal must not flip into a pass
  assert.deepEqual(errs({ not: X }, 1), [refused('if', '#/not')]);
  assert.deepEqual(errs({ oneOf: [{ type: 'integer' }, { type: 'integer', if: {} }] }, 1), [refused('if', '#/oneOf/1')]);
});

test('unsupported keywords: anything that is not a schema object is skipped, never a throw', () => {
  for (const s of [null, undefined, 5, 'x', true, [{ if: {} }]]) assert.deepEqual(unsupportedKeywords(s, '#', []), [], String(s));
  for (const k of ['properties', 'patternProperties', '$defs', 'definitions']) {
    assert.deepEqual(unsupportedKeywords({ [k]: null }, '#', []), [], k + ' null');
    assert.deepEqual(unsupportedKeywords({ [k]: [{ if: {} }] }, '#', []), [], k + ' array');
  }
  assert.deepEqual(unsupportedKeywords({ allOf: { if: {} } }, '#', []), []);
  const out = [];
  assert.equal(unsupportedKeywords({ if: 1 }, '#', out), out);   // it appends to the list it was given
});

test('runValidation: a validator error becomes a violation, never a throw', () => {
  const root = {};
  root.$ref = '#';   // a schema that refers to itself forever
  const e = runValidation(root, 1);
  assert.equal(e.length, 1);
  assert.equal(e[0].path, '$');
  assert.match(e[0].message, /^validator error: /);
});

test('checkCandidates: parse errors, violations and canonical hashes per output', async () => {
  const schema = { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } };
  const r = await checkCandidates(schema, [
    { name: 'good', json: '{ "id": 1 }' },
    { name: 'bad', json: '{"id":"1"}' },
    { name: 'broken', json: '{"id":' },
  ]);
  assert.deepEqual(r[0], { name: 'good', parseError: null, valid: true, errors: [], hash: await sha256Hex('{"id":1}'), canonical: '{"id":1}' });
  assert.equal(r[1].valid, false);
  assert.deepEqual(r[1].errors, [{ path: '$/id', message: 'type mismatch: expected integer, got string' }]);
  assert.equal(r[1].hash, await sha256Hex('{"id":"1"}'));
  assert.equal(r[2].valid, false);
  assert.match(r[2].parseError, /JSON/);
  assert.equal(r[2].hash, null);
  assert.deepEqual(r[2].errors, []);
});

test('consistencyOf: groups the passing outputs by canonical hash; failing ones are left out', () => {
  const R = (name, valid, hash) => ({ name, valid, hash });
  assert.deepEqual(consistencyOf([R('a', true, 'h1'), R('b', true, 'h1'), R('c', true, 'h2'), R('d', false, 'h1'), R('e', false, null)]), {
    passing: 3, comparable: true, groups: [{ hash: 'h1', names: ['a', 'b'] }, { hash: 'h2', names: ['c'] }],
  });
  assert.deepEqual(consistencyOf([R('a', true, 'h1'), R('d', false, 'h9')]), { passing: 1, comparable: false, groups: [{ hash: 'h1', names: ['a'] }] });
  assert.deepEqual(consistencyOf([]), { passing: 0, comparable: false, groups: [] });
});
