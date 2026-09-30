'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAdapter } = require('../lib/ha-adapter');
function fixture() {
    const bus = new EventEmitter(), requests = [], subscriptions = [];
    let releases = 0, records = { label: [{ label_id: 'cozy' }], entity: [], device: [], area: [] };
    const ha = { eventBus: bus, isConnected: true, websocket: { isStatesLoaded: true,
        getState: id => ({ entity_id: id, state: 'off' }),
        send: async message => { requests.push(message); return structuredClone(records[message.type.split('/')[1].replace('_registry','')]); },
        subscribeMessage: async (callback, message) => { subscriptions.push({ callback, message }); return () => { releases++; }; } } };
    const adapter = createAdapter({ nodes: { getNode: () => ({ type: 'server', config: {} }) } }, 'server', { getHomeAssistant: () => ha });
    return { adapter, ha, bus, requests, subscriptions, releases: () => releases,
        change: entries => { records.entity = entries; bus.emit('entity_registry_updated'); },
        emit: (id, state) => subscriptions[0].callback({ data: { entity_id: id, new_state: state } }) };
}
test('adapter registry snapshot cache invalidates on each provider registry event and reconnect', async () => {
    const f = fixture(); let changes = 0;
    f.adapter.onRegistryChange(() => changes++);
    await f.adapter.subscribe('', () => {}, () => {}, assert.fail); await f.adapter.resolve();
    const first = await f.adapter.registries(); assert.equal(f.requests.length, 4);
    assert.equal(await f.adapter.registries(), first); assert.equal(f.requests.length, 4);
    for (const event of ['labels_updated', 'devices_updated', 'areas_updated', 'entity_registry_updated']) {
        f.bus.emit(event); assert.notEqual(await f.adapter.registries(), first);
    }
    assert.equal(f.requests.length, 20);
    f.ha.isConnected = false; f.bus.emit('ha_client:close'); await assert.rejects(f.adapter.registries());
    f.ha.isConnected = true; f.bus.emit('ha_client:ready'); await f.adapter.registries(); assert.equal(f.requests.length, 24);
    assert.ok(changes >= 6); await f.adapter.close(); assert.equal(f.bus.eventNames().length, 0); assert.equal(f.releases(), 1);
});
test('one state subscription reconciles member filter without leaking on change or close', async () => {
    const f = fixture(), observed = [];
    await f.adapter.resolve();
    const observe = (state, id) => observed.push([id, state]);
    await f.adapter.watch(['light.one', 'light.two'], observe, () => {}, assert.fail);
    await new Promise(setImmediate);
    f.emit('light.one', { entity_id: 'light.one', state: 'on' });
    f.emit('light.other', { state: 'on' });
    await f.adapter.watch(['light.two', 'light.three'], observe, () => {}, assert.fail);
    f.emit('light.one', { state: 'off' }); f.emit('light.three', null);
    assert.deepEqual(observed.map(([id]) => id), ['light.one', 'light.three']);
    assert.equal(f.adapter.state('light.one').state, 'off'); assert.equal(f.adapter.state('light.three'), undefined);
    assert.equal(f.subscriptions.length, 1); await f.adapter.close();
    f.emit('light.two', { state: 'on' }); assert.equal(observed.length, 2); assert.equal(f.releases(), 1);
});
test('registry response arriving after invalidation is rejected rather than cached', async () => {
    const f = fixture(); f.adapter.onRegistryChange(() => {}); await f.adapter.resolve();
    let finish;
    f.ha.websocket.send = message => message.type === 'config/entity_registry/list' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve([]);
    const resolving = f.adapter.registries(); f.bus.emit('entity_registry_updated'); finish([]);
    await assert.rejects(resolving, /changed during resolution/); await f.adapter.close();
});
test('registry TTL refresh bounds staleness even if an update event is missed', async () => {
    const f = fixture(); await f.adapter.resolve(); await f.adapter.registries();
    const now = Date.now; Date.now = () => now() + 31000;
    try { await f.adapter.registries(); assert.equal(f.requests.length, 8); }
    finally { Date.now = now; await f.adapter.close(); }
});
