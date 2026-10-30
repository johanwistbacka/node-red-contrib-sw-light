'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const register = require('../nodes/sw-light');
const { createAdapter } = require('../lib/ha-adapter');

test('Flow.start before client initialization: real adapter retries on input, reconnects and distinguishes errors', async () => {
    const server = { id: 'server', type: 'server', config: {} };
    let selectedServer = server, client, Constructor, resolutions = 0;
    const calls = [], statuses = [], errors = [];
    let state = { entity_id: 'light.example', state: 'off', attributes: { supported_color_modes: ['brightness'], supported_features: 32 } };
    const RED = { nodes: { getNode: id => id === 'server' ? selectedServer : undefined,
        registerType: (_type, ctor) => { Constructor = ctor; }, createNode: node => {
            const bus = new EventEmitter(); node.on = bus.on.bind(bus); node.emit = bus.emit.bind(bus);
            node.send = () => {}; node.status = status => statuses.push(status); node.error = err => errors.push(err);
        } } };
    const provider = { getHomeAssistant: s => { assert.equal(s, server); resolutions++; return client; } };
    // This injects only the provider API; it does NOT provide a mocked ready
    // adapter. Every resolution, readiness check and service goes through the
    // actual createAdapter implementation used by production SW Light.
    register(RED, (red, id) => createAdapter(red, id, provider));
    let node;
    assert.doesNotThrow(() => { node = new Constructor({ server: 'server', entityId: 'light.example', action: 'on' }); });
    assert.equal(resolutions, 0); assert.equal(errors.length, 0);
    const input = () => new Promise(resolve => node.emit('input', {}, () => {}, resolve));
    assert.ok(await input()); assert.match(statuses.at(-1).text, /^HA NOT READY · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/); assert.equal(calls.length, 0);
    client = { isConnected: true, eventBus: new EventEmitter(), websocket: {
        isStatesLoaded: true, getState: () => structuredClone(state), getStates: () => ({}), getServices: () => ({}),
        subscribeMessage: async () => () => {}, callService: async (...args) => calls.push(args) } };
    assert.equal(await input(), undefined); assert.equal(calls[0][1], 'turn_on'); assert.equal(calls[0][2].brightness, 239);
    client.isConnected = false; client.eventBus.emit('ha_client:close');
    assert.ok(await input()); assert.match(statuses.at(-1).text, /^HA NOT READY · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/); assert.equal(calls.length, 1);
    client.isConnected = true; client.eventBus.emit('ha_client:ready');
    assert.equal(await input(), undefined); assert.equal(calls.length, 2);
    const readyClient = client;
    client = undefined;
    assert.ok(await input()); assert.match(statuses.at(-1).text, /^HA NOT READY · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/); assert.equal(calls.length, 2);
    client = readyClient;
    state = { entity_id: 'light.example', state: 'unavailable' };
    assert.ok(await input()); assert.match(statuses.at(-1).text, /^ENTITY UNAVAILABLE · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/); assert.equal(calls.length, 2);
    selectedServer = undefined;
    assert.ok(await input()); assert.match(statuses.at(-1).text, /^CONFIG ERROR · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    selectedServer = server; state = { entity_id: 'light.example', state: 'off', attributes: { supported_color_modes: ['brightness'] } };
    assert.equal(await input(), undefined); assert.equal(calls.length, 3);
    await new Promise(resolve => node.emit('close', false, resolve)); assert.equal(client.eventBus.eventNames().length, 0);
});
