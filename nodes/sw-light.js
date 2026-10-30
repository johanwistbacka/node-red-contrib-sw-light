'use strict';
const light = require('../lib/light');
const { createController } = require('../lib/controller');
const { target, createTargetResolver, aggregateStatus } = require('../lib/targets');
const { createAdapter } = require('../lib/ha-adapter');
const { createStatusReporter } = require('../lib/status');

module.exports = function register(RED, adapterFactory = createAdapter) {
    // Reuse HA contrib's authenticated shared transport for registry selectors.
    if (RED.httpAdmin && RED.auth) for (const registry of ['labels', 'areas']) {
        RED.httpAdmin.get(`/sw-light/${registry}/:serverId`, RED.auth.needsPermission('server.read'), async (req, res) => {
            let handle;
            try {
                handle = adapterFactory(RED, req.params.serverId);
                await handle.resolve();
                res.json(await handle[registry]());
            } catch (error) { res.status(503).json({ error: error.message }); }
            finally { await handle?.close(); }
        });
    }
    function SWLight(raw) {
        RED.nodes.createNode(this, raw);
        const node = this;
        const reportStatus = createStatusReporter(value => node.status(value));
        const diagnosticsEnabled = process.env.SW_LIGHT_DEBUG === '1';
        const diagnostic = detail => { if (diagnosticsEnabled) node.log?.(`[SW Light debug] ${detail}`); };
        diagnostic(`version=${require('../package.json').version} constructor=created serverIdPresent=${Boolean(raw.server)}`);
        let c, configured, adapter, resolver, closed = false, ready = false, observerTimer, refreshTimer, registryTimer;
        let queue = Promise.resolve(), startup = Promise.resolve(), activeIds = [];
        const controllers = new Map();
        function event(type, detail = {}, msg = {}, send = node.send.bind(node)) {
            if (!closed) send([null, { ...msg, sw_light_event: { version: 1, type,
                entity_id: configured?.type === 'entity' ? configured.id : undefined,
                target: configured, timestamp: new Date().toISOString(), ...detail } }]);
        }
        function status() {
            if (!closed && ready && configured?.type !== 'entity') reportStatus(aggregateStatus(activeIds.map(id => controllers.get(id).info()), configured.type));
        }
        function controller(id) {
            if (!controllers.has(id)) controllers.set(id, createController({ ...c, entityId: id }, adapter, {
                send: node.send.bind(node), status: value => { if (!closed && configured.type === 'entity') reportStatus(value); }
            }, () => closed));
            return controllers.get(id);
        }
        async function reconcile(selected = configured) {
            if (closed) return [];
            const ids = await resolver(selected);
            if (closed) return [];
            // Runtime overrides become the observed target until the next input.
            configured = selected;
            activeIds = ids;
            for (const id of ids) controller(id);
            for (const id of controllers.keys()) if (!ids.includes(id)) controllers.delete(id);
            const groupIds = resolver.groupIds();
            const observe = (state, id) => {
                if (groupIds.includes(id)) { scheduleRefresh(); return; }
                if (!closed) { controllers.get(id || selected.id)?.observe(state); status(); }
            };
            if (adapter.watch) await adapter.watch([...ids, ...groupIds], observe, connection, error => event('error', { message: error.message }));
            else if (ids.length === 1) await adapter.subscribe(ids[0], state => observe(state, ids[0]), connection, error => event('error', { message: error.message }));
            for (const id of ids) controller(id).observe(adapter.state(id));
            status();
            return ids;
        }
        function scheduleRefresh() {
            if (closed || !['label', 'area', 'entities', 'group'].includes(configured?.type)) return;
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                queue = queue.then(async () => {
                    if (closed || !adapter.connected()) return;
                    try { await reconcile(); }
                    catch (error) { resolutionError(error); }
                }).catch(error => resolutionError(error));
            }, 100);
            refreshTimer.unref?.();
        }
        function resolutionError(error, msg, send, selected = configured) {
            if (closed) return;
            configured = selected;
            reportStatus({ fill: 'red', shape: 'ring', text: 'TARGET UNAVAILABLE' });
            activeIds = [];
            adapter?.watch?.(selected?.type === 'group' ? [...new Set([selected.id, ...resolver.groupIds()])].sort() : [], selected?.type === 'group' ? scheduleRefresh : () => {}, connection, failure => event('error', { message: failure.message }));
            event('target_resolution_failure', { message: error.message, target: selected }, msg, send);
        }
        function connection(value) {
            if (closed) return;
            const wasReady = ready;
            ready = value;
            if (ready) {
                if (configured.type === 'entity') controllers.get(configured.id)?.observe(adapter.state(configured.id));
                else if (!wasReady) scheduleRefresh();
            } else {
                reportStatus({ fill: 'red', shape: 'ring', text: 'HA NOT READY' });
                if (wasReady) event('unavailable', { reason: 'disconnected' });
            }
        }
        function startAdapter() {
            adapter = adapterFactory(RED, c.server, undefined, diagnostic);
            resolver = createTargetResolver(adapter);
            if (['label', 'area'].includes(configured.type)) adapter.onRegistryChange?.(scheduleRefresh);
            registryTimer = setInterval(scheduleRefresh, 30000); registryTimer.unref?.();
            // Bind connection notifications even while Label registries are unavailable.
            startup = adapter.subscribe(configured.type === 'entity' ? configured.id : '',
                state => { controllers.get(configured.id)?.observe(state); }, connection,
                error => event('error', { message: error.message }));
            connection(adapter.connected());
        }
        function startObserving() {
            if (closed || node.swLightError) return;
            startup = queue = queue.then(async () => {
                if (closed) return;
                if (!adapter) startAdapter();
                if (adapter.resolve) await adapter.resolve();
                if (!adapter.connected()) throw light.fault('HA NOT READY', 'unavailable');
                await reconcile();
            }).catch(error => {
                if (closed) return;
                event(error.eventType || 'error', { message: error.message, phase: 'state_subscription' });
                observerTimer = setTimeout(startObserving, 1000);
                observerTimer.unref?.();
            });
        }
        try {
            c = light.config(raw); configured = target(c);
            reportStatus({ fill: 'red', shape: 'ring', text: 'HA NOT READY' });
            observerTimer = setTimeout(startObserving, 0); observerTimer.unref?.();
        } catch (error) {
            reportStatus({ fill: 'red', shape: 'ring', text: 'CONFIG ERROR' });
            node.error(error.message); node.swLightError = error;
        }
        node.on('input', (msg, send, done) => {
            send = send || node.send.bind(node);
            done = done || (error => { if (error) node.error(error, msg); });
            const run = async () => {
                if (closed) { done(); return; }
                try {
                    if (node.swLightError) throw node.swLightError;
                    const selected = target(c, msg.target);
                    if (!adapter) startAdapter();
                    if (['label', 'area'].includes(selected.type)) adapter.onRegistryChange?.(scheduleRefresh);
                    if (adapter.resolve) await adapter.resolve();
                    if (closed) { done(); return; }
                    if (!adapter.connected()) throw light.fault('HA NOT READY: disconnected or loading states', 'unavailable');
                    let ids;
                    try { ids = await reconcile(selected); }
                    catch (error) { resolutionError(error, msg, send, selected); done(error); return; }
                    if (closed) { done(); return; }
                    if (!ids.length) event('target_empty', { target: selected, resolved_entity_ids: [] }, msg, send);
                    const results = [];
                    for (const id of ids) {
                        if (closed) break;
                        results.push(await controller(id).execute(msg, send));
                    }
                    if (closed) { done(); return; }
                    if (selected.type === 'entity') {
                        const { outcome, cause, ...result } = results[0];
                        if (outcome === 'succeeded') send([{ ...msg, sw_light: result }, null]);
                        done(cause); return;
                    }
                    const normalized = results.map(({ cause, ...result }) => result);
                    const counts = { succeeded: 0, skipped: 0, failed: 0, manual: 0 };
                    for (const result of results) { counts[result.outcome]++; if (result.manual_override) counts.manual++; }
                    send([{ ...msg, sw_light: { version: 1, target: selected, resolved_entity_ids: ids,
                        results: normalized, counts, state_confirmation: 'last_observed' } }, null]);
                    status(); done();
                } catch (error) {
                    event(error.eventType || 'error', { message: error.message, light_service_completed: false }, msg, send);
                    if (!closed) reportStatus({ fill: 'red', shape: 'ring', text: error.eventType === 'config_error' ? 'CONFIG ERROR' :
                        error.eventType === 'unavailable' ? 'HA NOT READY' : error.message });
                    done(error);
                }
            };
            queue = queue.then(run).catch(error => done(error));
        });
        node.on('close', (_removed, done) => {
            closed = true; clearTimeout(observerTimer); clearTimeout(refreshTimer); clearInterval(registryTimer);
            Promise.resolve().then(() => adapter?.close()).then(() => startup).catch(() => {}).finally(() => { controllers.clear(); done(); });
        });
    }
    RED.nodes.registerType('sw-light', SWLight);
};
