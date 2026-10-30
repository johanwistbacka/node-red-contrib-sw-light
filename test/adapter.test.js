'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAdapter } = require('../lib/ha-adapter');

function fixture(connected = true) {
    const bus = new EventEmitter(); let callback, unsubscribeCount = 0, subscribeCount = 0;
    const ha = { isConnected: connected, eventBus: bus, websocket: {
        isStatesLoaded: true, getState: id => ({ entity_id: id, state: 'off' }), getStates: () => ({}), getServices: () => ({}),
        subscribeMessage: async (fn, wire, options) => { subscribeCount++; callback = fn;
            assert.deepEqual(wire, { type: 'subscribe_events', event_type: 'state_changed' }); assert.equal(options.resubscribe, true);
            return () => { unsubscribeCount++; }; }, callService: async () => ({}) } };
    const server = { id: 'server', type: 'server', config: {} };
    let currentClient = ha;
    const RED = { nodes: { getNode: () => server } }, integration = { getHomeAssistant: node => { assert.equal(node, server); return currentClient; } };
    return { adapter: createAdapter(RED, 'server', integration), bus, ha,
        emit: (state, id = 'light.example') => callback({ data: { entity_id: id, new_state: state } }),
        replace: client => { currentClient = client; },
        counts: () => ({ subscribeCount, unsubscribeCount }) };
}
test('adapter uses shared client, raw state events and removes every listener', async () => {
    const f = fixture(), states = [], ready = [];
    await f.adapter.resolve();
    await f.adapter.subscribe('light.example', s => states.push(s), r => ready.push(r), assert.fail);
    await new Promise(setImmediate);
    f.emit({ entity_id: 'light.example', state: 'on' }); assert.equal(f.adapter.state('light.example').state, 'on');
    f.emit(null); assert.equal(f.adapter.state('light.example'), undefined);
    f.bus.emit('ha_client:close'); assert.equal(ready.at(-1), false);
    f.bus.emit('ha_client:ready'); assert.equal(ready.at(-1), true);
    await f.adapter.close(); assert.equal(f.bus.eventNames().length, 0);
    assert.deepEqual(f.counts(), { subscribeCount: 1, unsubscribeCount: 1 });
    f.emit({ state: 'off' }); assert.equal(states.length, 2);
});
test('startup while HA is disconnected subscribes once when ready', async () => {
    const f = fixture(false);
    await f.adapter.resolve();
    await f.adapter.subscribe('light.example', () => {}, () => {}, assert.fail);
    assert.equal(f.counts().subscribeCount, 0);
    await assert.rejects(f.adapter.call('light', 'turn_on', {}));
    f.ha.isConnected = true; f.bus.emit('ha_client:ready'); f.bus.emit('ha_client:states_loaded');
    await new Promise(setImmediate); assert.equal(f.counts().subscribeCount, 1); await f.adapter.close();
});
test('close waits for and cleans a subscription acknowledged during redeployment', async () => {
    const f = fixture(); let resolveSubscription, removed = false;
    f.ha.websocket.subscribeMessage = () => new Promise(resolve => { resolveSubscription = resolve; });
    await f.adapter.resolve();
    await f.adapter.subscribe('light.example', () => assert.fail('callback after close'), () => {}, assert.fail);
    let finished = false;
    const closing = f.adapter.close().then(() => { finished = true; });
    await new Promise(setImmediate); assert.equal(finished, false);
    resolveSubscription(() => { removed = true; }); await closing;
    assert.equal(removed, true); assert.equal(f.bus.eventNames().length, 0);
});
test('input resolution rebinds to a replaced provider client and cleans the previous listeners', async () => {
    const old = fixture(), replacement = fixture();
    await old.adapter.resolve();
    await old.adapter.subscribe('light.example', () => {}, () => {}, assert.fail);
    await new Promise(setImmediate);
    old.replace(replacement.ha);
    await old.adapter.resolve(); await new Promise(setImmediate);
    assert.equal(old.bus.eventNames().length, 0);
    assert.equal(old.counts().unsubscribeCount, 1);
    assert.ok(replacement.bus.eventNames().length > 0);
    await old.adapter.close(); assert.equal(replacement.bus.eventNames().length, 0);
    assert.equal(replacement.counts().unsubscribeCount, 1);
});

test('location uses public get_config, returns only necessary fields and refreshes on demand', async () => {
    const f = fixture(); let latitude = 59.3293; const requests = [];
    f.ha.websocket.send = async wire => { requests.push(wire); return { latitude, longitude: 18.0686,
        time_zone: 'Europe/Stockholm', internal_url: 'private-url', location_name: 'private-name' }; };
    await f.adapter.resolve();
    assert.deepEqual(await f.adapter.location(), { latitude: 59.3293, longitude: 18.0686, timezone: 'Europe/Stockholm' });
    latitude = 0; assert.equal((await f.adapter.location()).latitude, 0);
    assert.deepEqual(requests, [{ type: 'get_config' }, { type: 'get_config' }]);
    latitude = null; await assert.rejects(f.adapter.location(), /HA location unavailable or invalid/);
    f.ha.websocket.send = async () => { throw Error('secret'); };
    await assert.rejects(f.adapter.location(), { message: 'HA location unavailable' });
    f.ha.isConnected = false; await assert.rejects(f.adapter.location(), /HA location unavailable/);
    await f.adapter.close(); await assert.rejects(f.adapter.location(), /HA location unavailable/);
});

test('location response received after provider replacement is discarded', async () => {
    const f = fixture(), replacement = fixture(); let release;
    f.ha.websocket.send = () => new Promise(resolve => { release = resolve; });
    await f.adapter.resolve(); const pending = f.adapter.location();
    f.replace(replacement.ha); await f.adapter.resolve();
    release({ latitude: 59.3293, longitude: 18.0686 });
    await assert.rejects(pending, /HA location unavailable/); await f.adapter.close();
});

test('stalled location lookup has a bounded graceful fallback', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(); f.ha.websocket.send = () => new Promise(() => {});
    await f.adapter.resolve();
    const pending = assert.rejects(f.adapter.location(), { message: 'HA location unavailable' });
    t.mock.timers.tick(2000); await pending; await f.adapter.close();
});


test('Area selector uses the shared registry transport and closes cleanly', async () => {
    const f = fixture(), wires = [];
    f.ha.websocket.send = async wire => { wires.push(wire); return [{ area_id: 'room', name: 'Room' }]; };
    await f.adapter.resolve();
    assert.deepEqual(await f.adapter.areas(), [{ area_id: 'room', name: 'Room' }]);
    assert.deepEqual(wires, [{ type: 'config/area_registry/list' }]);
    await f.adapter.close(); await assert.rejects(f.adapter.areas(), /HA NOT READY/);
    assert.equal(f.bus.eventNames().length, 0);
});


test('Area resolution works without the Label API and uses independent invalidated caches', async () => {
    const f = fixture(), wires = [];
    f.ha.websocket.send = async ({ type }) => {
        wires.push(type); if (type === 'config/label_registry/list') throw Error('unknown_command');
        return type === 'config/area_registry/list' ? [{ area_id: 'room' }] : [];
    };
    await f.adapter.resolve(); f.adapter.onRegistryChange(() => {});
    const first = await f.adapter.registries('area'); assert.equal(wires.length, 3);
    assert.equal(await f.adapter.registries('area'), first);
    await assert.rejects(f.adapter.registries('label'), /unknown_command/);
    assert.equal(await f.adapter.registries('area'), first);
    f.bus.emit('areas_updated'); const next = await f.adapter.registries('area'); assert.notEqual(next, first);
    assert.deepEqual(Object.keys(next).sort(), ['areas', 'devices', 'entities']);
    await f.adapter.close(); assert.equal(f.bus.eventNames().length, 0);
});


test('Group resolver reads freshest raw membership, nested changes and deletion instead of stale collection', async t => {
    const { createTargetResolver } = require('../lib/targets'); const f = fixture(); t.after(() => f.adapter.close());
    const group = members => ({ state: 'on', attributes: { entity_id: members } });
    const snapshot = { 'light.room': group(['group.nested']), 'group.nested': group(['light.old']) };
    f.ha.websocket.getStates = () => structuredClone(snapshot);
    f.ha.websocket.getState = id => structuredClone(snapshot[id]);
    await f.adapter.resolve(); await f.adapter.watch(['light.room', 'group.nested'], () => {}, () => {}, assert.fail);
    const resolve = createTargetResolver(f.adapter), target = { type: 'group', id: 'light.room' };
    assert.deepEqual(await resolve(target), ['light.old']);
    f.emit(group(['light.new']), 'group.nested'); assert.deepEqual(await resolve(target), ['light.new']);
    f.emit(group(['light.other']), 'light.room'); assert.deepEqual(await resolve(target), ['light.other']);
    assert.deepEqual(f.adapter.states(), snapshot); // unchanged provider snapshot must not win over raw events
    f.emit(null, 'light.room'); await assert.rejects(resolve(target), { eventType: 'target_resolution_failure' });
    f.emit(group('invalid'), 'light.room'); await assert.rejects(resolve(target), { eventType: 'target_resolution_failure' });
});


test('real adapter and Group node retain nested raw deletion through failure cleanup and repair', async t => {
    const f = fixture(), calls = [], statuses = [], outputs = []; let Constructor;
    const group = members => ({ state: 'on', attributes: { entity_id: members } });
    const lamp = id => ({ entity_id: id, state: 'on', attributes: { brightness: 100, supported_color_modes: ['brightness'] } });
    const snapshot = { 'light.room': group(['light.valid', 'light.nested']), 'light.nested': group(['light.deep']),
        'light.valid': lamp('light.valid'), 'light.deep': lamp('light.deep') };
    f.ha.websocket.getStates = () => structuredClone(snapshot);
    f.ha.websocket.getState = id => structuredClone(snapshot[id]);
    f.ha.websocket.callService = async (_domain, _service, _data, target) => calls.push(target.entity_id);
    const RED = { nodes: { registerType: (_type, ctor) => { Constructor = ctor; }, createNode: node => {
        const events = new EventEmitter(); node.on = events.on.bind(events); node.emit = events.emit.bind(events);
        node.status = value => statuses.push(value); node.send = value => outputs.push(value); node.error = () => {};
    } } };
    require('../nodes/sw-light')(RED, () => f.adapter);
    const node = new Constructor({ targetType: 'group', groupId: 'light.room' });
    t.after(() => new Promise(resolve => node.emit('close', false, resolve)));
    const input = msg => new Promise(resolve => node.emit('input', msg, value => outputs.push(value), resolve));
    await input({ action: 'off' }); await new Promise(setImmediate); assert.deepEqual(calls, ['light.deep', 'light.valid']);
    calls.length = 0; f.emit(null, 'light.nested'); await new Promise(resolve => setTimeout(resolve, 150));
    assert.match(statuses.at(-1).text, /^TARGET UNAVAILABLE · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/); assert.equal(f.adapter.state('light.nested'), undefined);
    for (let i = 0; i < 2; i++) assert.ok(await input({ action: 'on' }));
    assert.equal(calls.length, 0); assert.equal(f.adapter.state('light.nested'), undefined);
    f.emit(group(['light.valid']), 'light.nested'); await new Promise(resolve => setTimeout(resolve, 150));
    assert.match(statuses.at(-1).text, /^1 on · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/); await input({ action: 'off' }); assert.deepEqual(calls, ['light.valid']);
    calls.length = 0; f.emit(null, 'light.nested'); await new Promise(resolve => setTimeout(resolve, 150));
    f.emit(group(['light.valid']), 'light.room'); await new Promise(resolve => setTimeout(resolve, 150));
    await input({ action: 'off' }); assert.deepEqual(calls, ['light.valid']);
});
