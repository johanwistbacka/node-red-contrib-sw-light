'use strict';

const { createRequire } = require('node:module');
const path = require('node:path');
const { fault } = require('./light');
const PACKAGE = 'node-red-contrib-home-assistant-websocket';

// This is the ONLY module allowed to depend on HA contrib's internal APIs.
// Inspect the published package before adding another version to this allowlist.
function loadIntegration(RED, diagnostic = () => {}) {
    // Use one standard Node module resolution anchored at the runtime userDir.
    // No cache scanning, alternate installation search or checkout fallback.
    if (!RED.settings?.userDir) throw fault('Node-RED user directory is not available', 'unsupported');
    let packagePath;
    try { packagePath = createRequire(path.join(RED.settings.userDir, 'package.json')).resolve(`${PACKAGE}/package.json`); }
    catch (_) { throw fault(`Install ${PACKAGE}@0.80.3 in the Node-RED user directory`, 'unsupported'); }
    const req = createRequire(packagePath), metadata = req(packagePath);
    if (metadata.version !== '0.80.3') throw fault(`Unsupported HA contrib ${metadata.version}; adapter verified against 0.80.3`, 'unsupported');
    diagnostic(`providerVersion=${metadata.version} resolution=runtime-userDir`);
    const integration = req('./dist/homeAssistant/index.js');
    if (typeof integration.getHomeAssistant !== 'function') throw fault('HA contrib client API changed', 'unsupported');
    return integration;
}
function createAdapter(RED, serverId, integration, diagnostic = () => {}) {
    integration = integration || loadIntegration(RED, diagnostic);
    // Construct a handle, not a ready client. Resolve the provider on each input.
    let ha, stopped = false, observers, installing = false;
    const listeners = [], subscriptions = new Set(), rawStates = new Map();
    let pendingSubscription = Promise.resolve();
    let registryBound = false, connectionBound = false;
    let registryListener, registryCache, registryPending, registryGeneration = 0;
    let entityIds = new Set();
    function invalidateRegistries() {
        registryGeneration++; registryCache = undefined;
        if (!stopped) registryListener?.();
    }
    const diagnostics = new Map();
    function report(server, client, phase) {
        const info = { phase, serverIdPresent: Boolean(serverId), serverResolved: Boolean(server),
            serverTypeIsServer: server?.type === 'server', serverConstructor: server?.constructor?.name || 'absent',
            configPresent: Boolean(server?.config), configNodeClientPresent: Boolean(server?.homeAssistant),
            configNodeGetState: typeof server?.getState === 'function', configNodeCallService: typeof server?.callService === 'function',
            providerAccessor: typeof integration.getHomeAssistant === 'function', clientPresent: Boolean(client),
            websocketPresent: Boolean(client?.websocket), getState: typeof client?.websocket?.getState === 'function',
            callService: typeof client?.websocket?.callService === 'function', subscribeMessage: typeof client?.websocket?.subscribeMessage === 'function',
            eventBus: typeof client?.eventBus?.on === 'function', connected: Boolean(client?.isConnected),
            statesLoaded: Boolean(client?.websocket?.isStatesLoaded) };
        const line = JSON.stringify(info);
        if (line !== diagnostics.get(phase)) { diagnostics.set(phase, line); diagnostic(line); }
    }
    function connected() { return Boolean(!stopped && ha?.isConnected && ha.websocket.isStatesLoaded); }
    function listen(event, callback) {
        ha.eventBus.on(event, callback);
        listeners.push([ha.eventBus, event, callback]);
    }
    async function detach() {
        for (const [bus, event, fn] of listeners) bus.removeListener(event, fn);
        listeners.length = 0; registryBound = false; connectionBound = false;
        await pendingSubscription;
        await Promise.allSettled([...subscriptions].map(fn => Promise.resolve().then(fn)));
        subscriptions.clear();
        rawStates.clear();
        invalidateRegistries();
    }
    async function install() {
        if (stopped || installing || subscriptions.size || !connected() || !observers) return;
        installing = true;
        const client = ha;
        try {
            const unsubscribe = await client.websocket.subscribeMessage(event => {
                if (stopped || ha !== client || !entityIds.has(event.data?.entity_id)) return;
                const state = event.data.new_state;
                rawStates.set(event.data.entity_id, state ?? undefined);
                try { observers.onState(state, event.data.entity_id); } catch (error) { observers.onError(error); }
            }, { type: 'subscribe_events', event_type: 'state_changed' }, { resubscribe: true });
            if (stopped || ha !== client) await unsubscribe();
            else subscriptions.add(unsubscribe);
        } catch (error) { if (!stopped) observers.onError(error); }
        finally { installing = false; }
    }
    function refresh() {
        rawStates.clear();
        invalidateRegistries();
        if (!stopped && observers) {
            observers.onConnection(connected());
            if (!installing && !subscriptions.size && connected()) pendingSubscription = install();
        }
    }
    function bindRegistries() {
        if (!ha || !registryListener || registryBound || stopped) return;
        registryBound = true;
        for (const event of ['labels_updated', 'entity_registry_updated', 'devices_updated', 'areas_updated']) listen(event, invalidateRegistries);
    }
    function bind() {
        bindRegistries();
        if (!ha || !observers || stopped || connectionBound) return;
        connectionBound = true;
        for (const event of ['ha_client:ready', 'ha_client:states_loaded', 'ha_client:connected']) listen(event, refresh);
        for (const event of ['ha_client:close', 'ha_client:connecting', 'ha_client:error']) {
            listen(event, () => { rawStates.clear(); invalidateRegistries(); if (!stopped) observers.onConnection(false); });
        }
        refresh();
    }
    return {
        connected,
        async resolve() {
            if (stopped) throw fault('HA NOT READY: node closed', 'unavailable');
            const server = RED.nodes.getNode(serverId);
            report(server, undefined, 'server-resolution');
            if (!server || server.type !== 'server') throw fault('CONFIG ERROR: selected HA server is missing or invalid', 'config_error');
            if (!server.config) throw fault('HA NOT READY: server config is still initializing', 'unavailable');
            if (server.config.addon === false && typeof integration.hasCredentials === 'function' &&
                !integration.hasCredentials(server.credentials || {})) {
                throw fault('CONFIG ERROR: HA server credentials are not configured', 'config_error');
            }
            // Same accessor as provider Action/Current State. The provider owns
            // initialization/reuse and authentication; no independent client.
            let next;
            try { next = integration.getHomeAssistant(server); }
            catch (_) { report(server, undefined, 'provider-accessor-threw'); throw fault('HA NOT READY: provider could not supply its client', 'unavailable'); }
            report(server, next, 'provider-client');
            if (!next || typeof next.websocket?.getState !== 'function' ||
                typeof next.websocket?.subscribeMessage !== 'function' || !next.eventBus) {
                throw fault('HA NOT READY: Home Assistant server client is not initialized', 'unavailable');
            }
            if (next !== ha) {
                await detach();
                if (stopped) throw fault('HA NOT READY: node closed', 'unavailable');
                ha = next;
                bind();
            } else if (observers && !installing && !subscriptions.size && connected()) {
                pendingSubscription = install();
            }
        },
        state: id => rawStates.has(id) ? structuredClone(rawStates.get(id)) : ha?.websocket.getState(id),
        states: () => ha?.websocket.getStates() || {},
        services: () => ha?.websocket.getServices() || {},
        async call(domain, service, data, target) {
            if (!connected()) throw fault('HA NOT READY: disconnected or loading states', 'unavailable');
            return ha.websocket.callService(domain, service, data, target);
        },
        onRegistryChange(callback) { registryListener = callback; bindRegistries(); },
        async labels() {
            if (!connected()) throw fault('HA NOT READY', 'unavailable');
            return ha.websocket.send({ type: 'config/label_registry/list' });
        },
        async registries() {
            if (!connected() || typeof ha.websocket.send !== 'function') throw fault('HA registries unavailable', 'target_resolution_failure');
            if (registryCache && Date.now() - registryCache.time < 30000) return registryCache.data;
            if (registryPending) return registryPending;
            const generation = registryGeneration, client = ha;
            const pending = Promise.all(['label', 'entity', 'device', 'area'].map(name =>
                client.websocket.send({ type: `config/${name}_registry/list` }))).then(([labels, entities, devices, areas]) => {
                if (stopped || ha !== client || generation !== registryGeneration) throw fault('HA registries changed during resolution; retry', 'target_resolution_failure');
                const data = { labels, entities, devices, areas };
                if (!Object.values(data).every(Array.isArray)) throw fault('Invalid HA registry response', 'target_resolution_failure');
                registryCache = { time: Date.now(), data };
                return data;
            });
            registryPending = pending;
            try { return await pending; } finally { if (registryPending === pending) registryPending = undefined; }
        },
        async watch(ids, onState, onConnection, onError) {
            entityIds = new Set(ids);
            for (const id of rawStates.keys()) if (!entityIds.has(id)) rawStates.delete(id);
            observers = { onState, onConnection, onError };
            bind();
        },
        async subscribe(entityId, onState, onConnection, onError) {
            entityIds = new Set(entityId ? [entityId] : []);
            observers = { onState, onConnection, onError };
            bind();
        },
        async close() {
            stopped = true;
            await detach();
            ha = undefined;
        }
    };
}

module.exports = { loadIntegration, createAdapter };
