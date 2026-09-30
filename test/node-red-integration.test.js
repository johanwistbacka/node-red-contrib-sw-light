'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');

test('Node-RED creates and resolves the published HA config node for production SW Light',
    { skip: !process.env.SW_LIGHT_HA_USER_DIR }, async () => {
        const userDir = process.env.SW_LIGHT_HA_USER_DIR;
        const req = createRequire(path.join(userDir, 'package.json'));
        const helper = req('node-red-node-test-helper');
        helper.init(req.resolve('node-red'), { userDir });
        const haReq = createRequire(req.resolve('node-red-contrib-home-assistant-websocket/package.json'));
        const globals = haReq('./dist/globals.js'), previousRED = globals.RED;
        const Server = haReq('./dist/nodes/config-server/index.js').default;
        const Websocket = haReq('./dist/homeAssistant/Websocket.js').default;
        const provider = haReq('./dist/homeAssistant/index.js');
        const connect = Websocket.prototype.connect, close = Websocket.prototype.close;
        const calls = []; let connections = 0, runtimeRED;
        Websocket.prototype.connect = async function () {
            connections++;
            this.connectionState = 0;
            this.client = { haVersion: '2026.9.0', sendMessagePromise: async wire => { calls.push(wire); return {}; },
                subscribeMessage: async () => () => {} };
            this.services = { light: { turn_on: {}, turn_off: {} } };
        };
        Websocket.prototype.close = function () {};
        try {
            await helper.load(red => {
                runtimeRED = red;
                globals.setRED(red);
                red.nodes.registerType('server', Server, { credentials: { host: { type: 'text' }, access_token: { type: 'password' } } });
                red.nodes.registerType('api-current-state', haReq('./dist/nodes/current-state/index.js').default);
                red.nodes.registerType('api-call-service', haReq('./dist/nodes/action/index.js').default);
                require('../nodes/sw-light')(red);
            }, [
                { id: 'tab', type: 'tab' },
                { id: 'ha-server', type: 'server', version: 6, addon: false, enableGlobalContextStore: false },
                { id: 'current', type: 'api-current-state', z: 'tab', version: 3, server: 'ha-server', entity_id: 'light.example', state_type: 'str', halt_if: '', halt_if_compare: 'is', halt_if_type: 'str', for: 0, forType: 'num', forUnits: 'minutes', outputProperties: [{ property: 'observed', propertyType: 'msg', value: '', valueType: 'entityState' }], wires: [['observer'], []] },
                { id: 'action', type: 'api-call-service', z: 'tab', version: 7, server: 'ha-server', action: 'light.turn_on', entityId: ['light.example'], data: '{"brightness":239,"transition":1}', dataType: 'json', queue: 'none', outputProperties: [], wires: [[]] },
                { id: 'observer', type: 'helper', z: 'tab' },
                { id: 'waiting', type: 'sw-light', z: 'tab', server: 'ha-server', entityId: 'light.example', action: 'on', wires: [[], []] },
                { id: 'sw', type: 'sw-light', z: 'tab', server: 'ha-server', entityId: 'light.example', action: 'on', wires: [[], []] }
            ], { 'ha-server': { host: 'http://127.0.0.1:1', access_token: 'never-log-this-test-token' } });
            const server = helper.getNode('ha-server'), node = helper.getNode('sw');
            assert.ok(server instanceof Server);
            assert.equal(runtimeRED.nodes.getNode('ha-server'), server);
            const client = provider.getHomeAssistant(server);
            assert.equal(connections, 1);
            const input = (target = node) => new Promise(resolve => {
                const complete = target._complete;
                target._complete = function (msg, error) {
                    target._complete = complete;
                    complete.call(this, msg, error);
                    resolve(error);
                };
                target.receive({});
            });
            assert.ok(await input()); assert.equal(calls.length, 0);
            assert.equal(node.status.lastCall.args[0].text, 'HA NOT READY');
            // Close a real runtime node after an input attaches while HA is
            // unready. Its listeners must leave the shared provider untouched.
            const waiting = helper.getNode('waiting');
            const listenerCount = () => client.eventBus.eventNames().reduce((sum, event) => sum + client.eventBus.listenerCount(event), 0);
            const beforeWaiting = listenerCount();
            assert.ok(await input(waiting));
            assert.equal(listenerCount(), beforeWaiting + 6);
            await waiting.close(false);
            assert.equal(listenerCount(), beforeWaiting);
            const waitingStatuses = waiting.status.getCalls().filter(call => call.thisValue === waiting).length;
            client.websocket.connectionState = 1;
            client.websocket.onClientStates({ 'light.example': { entity_id: 'light.example', state: 'off', attributes: { supported_color_modes: ['brightness'], supported_features: 32 } } });
            assert.equal(waiting.status.getCalls().filter(call => call.thisValue === waiting).length, waitingStatuses);
            assert.equal(await input(), undefined);
            assert.equal(calls[0].service, 'turn_on');
            assert.equal(calls[0].service_data.brightness, 239);
            assert.equal(calls[0].target.entity_id, 'light.example');
            assert.equal(provider.getHomeAssistant(server), client); assert.equal(connections, 1);
            client.websocket.connectionState = 0; client.eventBus.emit('ha_client:close');
            assert.ok(await input()); assert.equal(calls.length, 1);
            client.websocket.connectionState = 1; client.eventBus.emit('ha_client:ready');
            assert.equal(await input(), undefined); assert.equal(calls.length, 2);
            const current = helper.getNode('current'), action = helper.getNode('action');
            const observation = new Promise(resolve => helper.getNode('observer').once('input', resolve));
            assert.equal(await input(current), undefined);
            assert.equal((await observation).observed, 'off');
            assert.equal(await input(action), undefined);
            assert.deepEqual(calls[2], calls[0]);
            assert.equal(connections, 1);
            const logs = node.log.getCalls().filter(call => call.thisValue === node).map(call => call.args[0]).join('\n');
            assert.match(logs, /\[SW Light debug\]/);
            assert.match(logs, /"serverResolved":true/);
            assert.match(logs, /"callService":true/);
            assert.doesNotMatch(logs, /never-log-this-test-token|127\.0\.0\.1|light\.example/);
        } finally {
            await helper.unload();
            Websocket.prototype.connect = connect; Websocket.prototype.close = close;
            globals.setRED(previousRED);
        }
    });
