'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAdapter } = require('../lib/ha-adapter');

for (const scenario of ['suppress automatic OFF', 'release at 80%', 'allow manual OFF']) {
    test(`real adapter: automatic 94% → external 100% → ${scenario}`, async () => {
        const listeners = new Set(), calls = [], nodes = [];
        const state = brightness => ({ entity_id: 'light.example', state: 'on', attributes: {
            brightness, supported_color_modes: ['brightness'], rgb_color: null, hs_color: null, xy_color: null } });
        // Deliberately stale provider collection: raw subscribed HA observations
        // must suffice, including for an OFF node that has never received input.
        const client = { isConnected: true, eventBus: new EventEmitter(), websocket: {
            isStatesLoaded: true, getState: () => state(239), getStates: () => ({}), getServices: () => ({}),
            subscribeMessage: async fn => { listeners.add(fn); return () => listeners.delete(fn); },
            callService: async (_domain, service, data, target) => calls.push({ service, data, target }) } };
        let Constructor;
        const server = { type: 'server', config: {} };
        const RED = { nodes: { getNode: () => server, registerType: (_type, ctor) => { Constructor = ctor; },
            createNode: node => { const bus = new EventEmitter(); node.on = bus.on.bind(bus); node.emit = bus.emit.bind(bus);
                node.messages = []; node.send = msg => node.messages.push(msg); node.status = () => {}; node.error = assert.fail; } } };
        require('../nodes/sw-light')(RED, (red, id) => createAdapter(red, id, { getHomeAssistant: () => client }));
        const input = (node, msg = {}) => new Promise((resolve, reject) => node.emit('input', msg, node.send, err => err ? reject(err) : resolve()));
        const external = (brightness, entityId = 'light.example') => {
            for (const fn of listeners) fn({ data: { entity_id: entityId, new_state: { ...state(brightness), entity_id: entityId } } });
        };
        try {
            const on = new Constructor({ server: 'ha', entityId: 'light.example', action: 'on' }); nodes.push(on);
            const off = new Constructor({ server: 'ha', entityId: 'light.example', action: 'off' }); nodes.push(off);
            await new Promise(resolve => setTimeout(resolve, 20));
            assert.equal(listeners.size, 2, 'both nodes observe before their first command');
            await input(on, { brightness_pct: 100 });
            assert.equal(calls[0].data.brightness, 239, 'automatic 100% request is capped at 94%');
            external(239);
            external(255, 'light.other');
            assert.equal(off.messages.some(m => m[1]?.sw_light_event.type === 'manual_override'), false);
            external(255);
            assert.ok(off.messages.some(m => m[1]?.sw_light_event.type === 'manual_override'));
            if (scenario === 'release at 80%') {
                external(204);
                assert.ok(off.messages.some(m => m[1]?.sw_light_event.type === 'override_released'));
            }
            await input(off, scenario === 'allow manual OFF' ? { source: 'manual' } : {});
            if (scenario === 'suppress automatic OFF') {
                assert.equal(calls.length, 1);
                assert.ok(off.messages.some(m => m[1]?.sw_light_event.blocked === true));
            } else {
                assert.equal(calls.length, 2); assert.equal(calls[1].service, 'turn_off');
            }
        } finally {
            for (const node of nodes) await new Promise(resolve => node.emit('close', false, resolve));
        }
        assert.equal(listeners.size, 0); assert.equal(client.eventBus.eventNames().length, 0);
    });
}

test('idle node retries provider initialization and observes without any input', async () => {
    let Constructor, client, callback, resolutions = 0;
    const messages = [], server = { type: 'server', config: {} };
    const RED = { nodes: { getNode: () => server, registerType: (_type, ctor) => { Constructor = ctor; },
        createNode: node => { const bus = new EventEmitter(); node.on = bus.on.bind(bus); node.emit = bus.emit.bind(bus);
            node.send = msg => messages.push(msg); node.status = () => {}; node.error = assert.fail; } } };
    require('../nodes/sw-light')(RED, (red, id) => createAdapter(red, id, {
        getHomeAssistant: () => { resolutions++; return client; } }));
    const node = new Constructor({ server: 'ha', entityId: 'light.example', action: 'off' });
    try {
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.ok(resolutions > 0); assert.equal(callback, undefined);
        client = { isConnected: true, eventBus: new EventEmitter(), websocket: {
            isStatesLoaded: true, getState: () => ({ state: 'off', attributes: {} }),
            subscribeMessage: async fn => { callback = fn; return () => {}; } } };
        await new Promise(resolve => setTimeout(resolve, 1050));
        assert.equal(typeof callback, 'function');
        callback({ data: { entity_id: 'light.example', new_state: { state: 'on', attributes: { brightness: 255 } } } });
        assert.ok(messages.some(m => m[1]?.sw_light_event.type === 'manual_override'));
    } finally { await new Promise(resolve => node.emit('close', false, resolve)); }
    assert.equal(client.eventBus.eventNames().length, 0);
});
