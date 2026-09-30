'use strict';
// Optional: SW_LIGHT_HA_USER_DIR points to a disposable Node-RED userDir.
// Exercises the actual npm artifact, without opening a network connection.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const path = require('node:path');
const { loadIntegration, createAdapter } = require('../lib/ha-adapter');

test('published HA contrib 0.80.3 shared client, services and subscription signatures',
    { skip: !process.env.SW_LIGHT_HA_USER_DIR }, async () => {
        const userDir = process.env.SW_LIGHT_HA_USER_DIR;
        const req = createRequire(path.join(userDir, 'package.json'));
        const packagePath = req.resolve('node-red-contrib-home-assistant-websocket/package.json');
        const haRequire = createRequire(packagePath);
        const HomeAssistant = haRequire('./dist/homeAssistant/HomeAssistant.js').default;
        const Websocket = haRequire('./dist/homeAssistant/Websocket.js').default;
        const bus = new EventEmitter(), calls = [];
        const ws = new Websocket({}, bus);
        ws.connectionState = 1;
        ws.onClientStates({ 'light.example': { entity_id: 'light.example', state: 'off', attributes: {} } });
        ws.services = { light: { turn_on: {} } };
        let listener, unsubscribed = false;
        ws.client = { haVersion: '2026.9.0', sendMessagePromise: async msg => { calls.push(msg); return {}; },
            subscribeMessage: async (fn, wire, options) => { listener = fn;
                assert.equal(wire.event_type, 'state_changed'); assert.equal(options.resubscribe, true);
                return () => { unsubscribed = true; }; } };
        const ha = new HomeAssistant({ websocketAPI: ws, httpAPI: {}, eventBus: bus });
        const RED = { settings: { userDir }, nodes: { getNode: () => ({ id: 'sw-light-test-server', type: 'server', config: {} }) } };
        const integration = loadIntegration(RED);
        assert.equal(integration, haRequire('./dist/homeAssistant/index.js'));
        integration.homeAssistantConnections.set('sw-light-test-server', ha);
        const adapter = createAdapter(RED, 'sw-light-test-server');
        try {
            await adapter.resolve();
            assert.equal(adapter.connected(), true);
            const states = [];
            await adapter.subscribe('light.example', s => states.push(s), () => {}, assert.fail);
            await new Promise(setImmediate);
            await adapter.call('light', 'turn_on', { brightness: 239 }, { entity_id: 'light.example' });
            assert.deepEqual(calls[0], { type: 'call_service', domain: 'light', service: 'turn_on', service_data: { brightness: 239 }, target: { entity_id: 'light.example' }, return_response: false });
            listener({ data: { entity_id: 'light.example', new_state: { entity_id: 'light.example', state: 'on' } } });
            assert.equal(adapter.state('light.example').state, 'on'); assert.equal(states.length, 1);
            await adapter.close(); assert.equal(unsubscribed, true);
            assert.equal(integration.homeAssistantConnections.get('sw-light-test-server'), ha);
        } finally { await adapter.close(); integration.homeAssistantConnections.delete('sw-light-test-server'); }
    });

test('registered HA server constructor and SW Light work together without any HA Action node',
    { skip: !process.env.SW_LIGHT_HA_USER_DIR }, async () => {
        const userDir = process.env.SW_LIGHT_HA_USER_DIR;
        const req = createRequire(path.join(userDir, 'package.json'));
        const haRequire = createRequire(req.resolve('node-red-contrib-home-assistant-websocket/package.json'));
        const globals = haRequire('./dist/globals.js');
        const previousRED = globals.RED;
        const Server = haRequire('./dist/nodes/config-server/index.js').default;
        const Websocket = haRequire('./dist/homeAssistant/Websocket.js').default;
        const integration = haRequire('./dist/homeAssistant/index.js');
        const originalConnect = Websocket.prototype.connect, originalClose = Websocket.prototype.close;
        const calls = [], nodes = new Map(); let SWLight, unsubscribeCount = 0, transportReady = true;
        const RED = { settings: { userDir }, _: value => value, comms: { publish: () => {} },
            nodes: { getType: type => type === 'server' ? Server : SWLight, getNode: id => nodes.get(id),
                registerType: (_type, ctor) => { SWLight = ctor; },
                createNode: (node, cfg) => {
                    const emitter = new EventEmitter(); node.on = emitter.on.bind(emitter); node.emit = emitter.emit.bind(emitter);
                    node.id = cfg.id; node.type = cfg.type; node.credentials = { host: 'http://127.0.0.1:1', access_token: 'test-only-not-used' };
                    node.context = () => ({ global: { set: () => {} } });
                    node.statuses = []; node.status = status => node.statuses.push(status); node.send = () => {}; node.debug = () => {}; node.warn = () => {}; node.log = () => {}; node.error = assert.fail;
                    nodes.set(node.id, node);
                } } };
        // Only the network transport is simulated. Both provider initialization
        // and SW Light's real adapter/accessor are exercised, not map injection.
        Websocket.prototype.connect = async function () {
            this.connectionState = transportReady ? 1 : 0;
            this.client = { haVersion: '2026.9.0', sendMessagePromise: async wire => { calls.push(wire); return {}; },
                subscribeMessage: async () => () => { unsubscribeCount++; } };
            if (transportReady) this.onClientStates({ 'light.example': { entity_id: 'light.example', state: 'off', attributes: { supported_color_modes: ['brightness'], supported_features: 32 } } });
            this.services = { light: { turn_on: {}, turn_off: {} } };
        };
        Websocket.prototype.close = function () {};
        globals.setRED(RED);
        let node, server, lazyServer;
        try {
            server = new Server({ id: 'sw-light-real-server', type: 'server', version: 6, addon: false, enableGlobalContextStore: false });
            assert.equal(loadIntegration(RED), integration);
            require('../nodes/sw-light')(RED);
            node = new SWLight({ id: 'sw-light-real-node', type: 'sw-light', server: server.id, entityId: 'light.example', action: 'on', brightnessPct: 70, autoMaxPct: 80 });
            await new Promise(resolve => node.emit('input', { payload: 'trigger only' }, () => {}, err => { assert.equal(err, undefined); resolve(); }));
            assert.equal(calls.length, 1); assert.equal(calls[0].service, 'turn_on');
            assert.equal(calls[0].target.entity_id, 'light.example'); assert.equal(calls[0].service_data.brightness, 179);
            const client = integration.homeAssistantConnections.get(server.id);
            await new Promise(resolve => node.emit('close', false, resolve)); node = null;
            assert.equal(unsubscribeCount, 1); assert.equal(integration.homeAssistantConnections.get(server.id), client);
            // Regression: valid server config exists before its registry entry.
            // The old map-only adapter throws here; the provider accessor owns
            // initialization and makes SW Light usable without an Action node.
            lazyServer = { config: { ...server.config }, exposedNodes: {} };
            RED.nodes.createNode(lazyServer, { id: 'sw-light-lazy-server', type: 'server' });
            assert.equal(integration.homeAssistantConnections.has(lazyServer.id), false);
            transportReady = false;
            node = new SWLight({ id: 'sw-light-lazy-node', type: 'sw-light', server: lazyServer.id, entityId: 'light.example', action: 'on' });
            assert.equal(integration.homeAssistantConnections.has(lazyServer.id), false);
            const notReady = await new Promise(resolve => node.emit('input', {}, () => {}, resolve));
            assert.ok(notReady); assert.equal(node.statuses.at(-1).text, 'HA NOT READY'); assert.equal(calls.length, 1);
            const delayedClient = integration.homeAssistantConnections.get(lazyServer.id);
            delayedClient.websocket.connectionState = 1;
            delayedClient.websocket.onClientStates({ 'light.example': { entity_id: 'light.example', state: 'off', attributes: { supported_color_modes: ['brightness'] } } });
            await new Promise((resolve, reject) => node.emit('input', {}, () => {}, err => err ? reject(err) : resolve()));
            assert.equal(calls.length, 2); assert.equal(calls[1].service, 'turn_on');
            assert.equal(integration.homeAssistantConnections.has(lazyServer.id), true);
            await new Promise(resolve => node.emit('close', false, resolve)); node = null;
            // Partial redeploy must reuse the provider and not retain old listeners.
            node = new SWLight({ id: 'sw-light-redeployed', type: 'sw-light', server: lazyServer.id, entityId: 'light.example', action: 'off' });
            await new Promise((resolve, reject) => node.emit('input', {}, () => {}, err => err ? reject(err) : resolve()));
            assert.equal(calls[2].service, 'turn_off');
            assert.equal(integration.homeAssistantConnections.get(lazyServer.id), delayedClient);
            await new Promise(resolve => node.emit('close', false, resolve)); node = null;
        } finally {
            if (node) await new Promise(resolve => node.emit('close', false, resolve));
            if (server) await new Promise(resolve => server.emit('close', false, resolve));
            if (lazyServer) integration.closeHomeAssistant(lazyServer.id);
            Websocket.prototype.connect = originalConnect; Websocket.prototype.close = originalClose;
            globals.setRED(previousRED);
        }
    });

test('published 0.80.3 Websocket.send supports official Label registry lists and filtered state subscriptions',
    { skip: !process.env.SW_LIGHT_HA_USER_DIR }, async () => {
        const req = createRequire(path.join(process.env.SW_LIGHT_HA_USER_DIR, 'package.json'));
        const haReq = createRequire(req.resolve('node-red-contrib-home-assistant-websocket/package.json'));
        const Websocket = haReq('./dist/homeAssistant/Websocket.js').default;
        const bus = new EventEmitter(), wire = [], observed = [];
        let callback, released = 0;
        const ws = new Websocket({}, bus);
        ws.connectionState = 1;
        ws.onClientStates({ 'light.one': { entity_id: 'light.one', state: 'off', attributes: { supported_color_modes: ['brightness'] } } });
        ws.client = { sendMessagePromise: async message => {
            wire.push(message);
            if (message.type === 'config/label_registry/list') return [{ label_id: 'cozy', name: 'Cozy' }];
            if (message.type === 'config/entity_registry/list') return [{ entity_id: 'light.one', labels: ['cozy'], device_id: null, area_id: null, hidden_by: null, entity_category: null }];
            return [];
        }, subscribeMessage: async fn => { callback = fn; return () => { released++; }; } };
        const providerListeners = bus.eventNames().reduce((sum, key) => sum + bus.listenerCount(key), 0);
        const ha = { isConnected: true, websocket: ws, eventBus: bus };
        const adapter = createAdapter({ nodes: { getNode: () => ({ type: 'server', config: {} }) } }, 'selected', { getHomeAssistant: () => ha });
        const { createTargetResolver } = require('../lib/targets');
        await adapter.resolve();
        const resolve = createTargetResolver(adapter), selected = { type: 'label', id: 'cozy' };
        assert.deepEqual(await resolve(selected), ['light.one']);
        assert.deepEqual(await resolve(selected), ['light.one']); assert.equal(wire.length, 4);
        assert.deepEqual(wire.map(m => m.type), ['config/label_registry/list', 'config/entity_registry/list', 'config/device_registry/list', 'config/area_registry/list']);
        await adapter.watch(['light.one'], (state, id) => observed.push([state, id]), () => {}, assert.fail);
        await new Promise(setImmediate);
        callback({ data: { entity_id: 'light.one', new_state: null } }); assert.equal(observed[0][1], 'light.one');
        assert.equal(adapter.state('light.one'), undefined);
        assert.equal((await adapter.labels())[0].label_id, 'cozy');
        await adapter.close(); assert.equal(released, 1); assert.equal(bus.eventNames().reduce((sum, key) => sum + bus.listenerCount(key), 0), providerListeners);
    });
