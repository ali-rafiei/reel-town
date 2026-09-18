import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { claimsAdmin, parseAdminCommand, timeOfDayLabel, WEATHERS } from '../server/dist/packages/shared/admin.js';
import { migrate, createPlayerStore, createSettingsStore } from '../server/dist/server/src/db.js';

test('only the dev name may claim the role, and only exactly', () => {
  assert.ok(claimsAdmin('Ali'));
  assert.ok(claimsAdmin('  ali  '));
  assert.ok(claimsAdmin('ALI'));
  assert.ok(!claimsAdmin('Alice'));
  assert.ok(!claimsAdmin('Ali2'));
  assert.ok(!claimsAdmin('Bob'));
  assert.ok(!claimsAdmin(''));
  assert.ok(!claimsAdmin(undefined));
});

test('the role binds to the first claimer, so typing the name later grants nothing', () => {
  // Arrange: a fresh database, two players who both call themselves Ali.
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const settings = createSettingsStore(db);
  const first = 'a'.repeat(64),
    second = 'b'.repeat(64);
  const claim = (id, name) => {
    let adminId = settings.get('admin_id');
    if (!adminId && claimsAdmin(name)) {
      adminId = id;
      settings.set('admin_id', id);
    }
    return adminId === id;
  };
  // Act + assert
  assert.equal(claim(first, 'Ali'), true, 'the first Ali claims it');
  assert.equal(claim(second, 'Ali'), false, 'an impostor gets nothing');
  assert.equal(claim(first, 'Renamed'), true, 'the holder keeps it after a rename');
  assert.equal(settings.get('admin_id'), first);
  db.close();
});

test('every dev command is validated, and anything malformed is refused', () => {
  assert.deepEqual(parseAdminCommand({ action: 'time', value: 0.5 }), { action: 'time', value: 0.5 });
  assert.deepEqual(parseAdminCommand({ action: 'time', value: null }), { action: 'time', value: null });
  assert.equal(parseAdminCommand({ action: 'time', value: 1.5 }), null);
  assert.equal(parseAdminCommand({ action: 'time', value: -0.1 }), null);
  assert.equal(parseAdminCommand({ action: 'time', value: 'noon' }), null);
  assert.equal(parseAdminCommand({ action: 'time', value: Infinity }), null);
  assert.deepEqual(parseAdminCommand({ action: 'weather', value: 'rain' }), { action: 'weather', value: 'rain' });
  assert.equal(parseAdminCommand({ action: 'weather', value: 'hail' }), null);
  assert.deepEqual(parseAdminCommand({ action: 'mute', target: 4, value: true }), { action: 'mute', target: 4, value: true });
  assert.equal(parseAdminCommand({ action: 'mute', target: 4 }), null, 'mute needs a value');
  assert.equal(parseAdminCommand({ action: 'kick', target: 0 }), null);
  assert.equal(parseAdminCommand({ action: 'kick', target: 1.5 }), null);
  assert.equal(parseAdminCommand({ action: 'ban', target: '3' }), null);
  assert.deepEqual(parseAdminCommand({ action: 'unban', id: 'f'.repeat(64) }), { action: 'unban', id: 'f'.repeat(64) });
  assert.equal(parseAdminCommand({ action: 'unban', id: 'short' }), null);
  assert.equal(parseAdminCommand({ action: 'shutdown' }), null);
  assert.equal(parseAdminCommand({}), null);
});

test('bans and mutes persist against the recovery code, and unbanning lets them back', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const store = createPlayerStore(db);
  const id = 'c'.repeat(64);
  store.create(id, 'Nuisance', '#eea373');
  assert.equal(store.load(id).banned, 0);
  store.setFlag(id, 'muted', true);
  store.setFlag(id, 'banned', true);
  assert.equal(store.load(id).muted, 1);
  // node:sqlite hands back null-prototype rows, so compare the fields we care about.
  assert.deepEqual(store.banned().map((b) => ({ id: b.id, name: b.name })), [{ id, name: 'Nuisance' }]);
  store.setFlag(id, 'banned', false);
  assert.deepEqual(store.banned().map((b) => ({ id: b.id, name: b.name })), []);
  assert.equal(store.load(id).muted, 1, 'unbanning does not silently unmute');
  db.close();
});

test('world overrides survive a restart, and an unset override follows the clock', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const settings = createSettingsStore(db);
  // Nothing stored: the server must not read this as midnight.
  const read = () => {
    const stored = settings.get('world_time');
    return stored !== null && Number.isFinite(Number(stored)) ? Number(stored) : null;
  };
  assert.equal(read(), null);
  settings.set('world_time', '0');
  assert.equal(read(), 0, 'midnight is a real choice once it is made');
  settings.set('world_time', null);
  assert.equal(read(), null);
  settings.set('world_weather', 'fog');
  assert.ok(WEATHERS.includes(settings.get('world_weather')));
  db.close();
});

test('the clock reads as a time of day', () => {
  assert.equal(timeOfDayLabel(0.5), 'Midday');
  assert.equal(timeOfDayLabel(0.95), 'Night');
  assert.equal(timeOfDayLabel(0.02), 'Night');
  assert.equal(timeOfDayLabel(0.22), 'Dawn');
  assert.equal(timeOfDayLabel(0.8), 'Sunset');
});
