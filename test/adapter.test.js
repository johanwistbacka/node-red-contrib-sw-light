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
        emit: state => callback({ data: { entity_id: 'light.example', new_state: state } }),
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
