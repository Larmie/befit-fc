// The practice password (round 7): the hash helpers in js/core/practice.js. They load in Node whole (the file
// exports them when `module` exists; in a browser it sets window.PracticePw and goes on to start practice mode).
// The password is never stored: settings/practice = { hash, salt }, hash = hex SHA-256 of (salt + password).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const Pw = require('../../js/core/practice.js');

const sha = s => nodeCrypto.createHash('sha256').update(s).digest('hex');

test('hash is the hex SHA-256 of salt + password (the known test vector for "abc")', async () => {
  assert.equal(await Pw.hashOf('', 'abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('the salt comes first, then the password (what Admin writes is what the gate checks)', async () => {
  assert.equal(await Pw.hashOf('s4lt', 'monday'), sha('s4ltmonday'));
  assert.notEqual(await Pw.hashOf('s4lt', 'monday'), await Pw.hashOf('monday', 's4lt'));
});

test('make: a 16-byte salt (32 hex characters) and a 64-character hash, fresh every time', async () => {
  const a = await Pw.make('goal2026'), b = await Pw.make('goal2026');
  assert.match(a.salt, /^[0-9a-f]{32}$/);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);          // same password, different salt, different hash
  assert.deepEqual(Object.keys(a).sort(), ['hash', 'salt']);
});

test('the password itself is never in what gets stored', async () => {
  const rec = await Pw.make('tr1ckyP@ss');
  assert.ok(!JSON.stringify(rec).includes('tr1ckyP@ss'));
});

test('verify: the right password passes, anything else fails', async () => {
  const rec = await Pw.make('goal2026');
  assert.equal(await Pw.verify('goal2026', rec), true);
  assert.equal(await Pw.verify('goal2027', rec), false);
  assert.equal(await Pw.verify('Goal2026', rec), false);
  assert.equal(await Pw.verify('', rec), false);
  assert.equal(await Pw.verify(' goal2026', rec), false);
});

test('verify: a record that is missing or half there never lets anyone in', async () => {
  assert.equal(await Pw.verify('x', null), false);
  assert.equal(await Pw.verify('x', {}), false);
  assert.equal(await Pw.verify('x', { hash: 'abc' }), false);
  assert.equal(await Pw.verify('x', { salt: 'abc' }), false);
});

test('a hash made elsewhere (Node crypto) is accepted: both sides agree on the recipe', async () => {
  const rec = { salt: '00112233445566778899aabbccddeeff', hash: sha('00112233445566778899aabbccddeeff' + 'practice!') };
  assert.equal(await Pw.verify('practice!', rec), true);
  assert.equal(await Pw.verify('practice', rec), false);
});

test('isSet: practice stays open until a full record exists in settings', () => {
  assert.equal(Pw.isSet(undefined), false);
  assert.equal(Pw.isSet({}), false);
  assert.equal(Pw.isSet({ club: { name: 'x' } }), false);
  assert.equal(Pw.isSet({ practice: { salt: 'a' } }), false);
  assert.equal(Pw.isSet({ practice: { hash: 'a' } }), false);
  assert.equal(Pw.isSet({ practice: { hash: '', salt: 'a' } }), false);
  assert.equal(Pw.isSet({ practice: { hash: 'h', salt: 's', updatedAt: 1 } }), true);
});

test('needsGate: asked only when data loaded, a password is set and it has not been answered this visit', () => {
  const set = { practice: { hash: 'h', salt: 's' } };
  assert.equal(Pw.needsGate(true, set, false), true);
  assert.equal(Pw.needsGate(true, set, true), false);          // right password already given this visit
  assert.equal(Pw.needsGate(true, {}, false), false);          // no password set yet: practice opens as before
  assert.equal(Pw.needsGate(true, undefined, false), false);
  assert.equal(Pw.needsGate(false, set, false), false);        // couldn't read the data: nothing to protect
});

test('the shortest password the Admin sheet takes is 4 characters', () => {
  assert.equal(Pw.MIN_LENGTH, 4);
});
