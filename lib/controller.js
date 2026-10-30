'use strict';
const light = require('./light');
const adaptive = require('./adaptive');
const solar = require('./solar-temperature');
// A fresh ON refreshes CT; brightness messages to an already-ON lamp only dim.
const needsDynamicTemperature = command => command.turningOn && !command.explicitColor &&
    command.supportsTemperature && (command.offToOn || !command.explicitBrightness);

// One independent controller per entity, shared by every target type.
function createController(c, adapter, node, isClosed, now = Date.now) {
    const detector = new light.Override(c);
    const legacyEnabled = c.colorMode !== 'dynamic' && c.adaptiveEnabled;
    let lastAvailability;
    const protectedAtFullBrightness = state => state?.state === 'on' && state.attributes?.brightness === 255;
    const overrideActive = state => detector.active || protectedAtFullBrightness(state);
    function event(type, detail = {}, msg = {}, send = node.send.bind(node)) {
        if (isClosed()) return;
        send([null, { ...msg, sw_light_event: { version: 1, type, entity_id: c.entityId,
            timestamp: new Date().toISOString(), ...detail } }]);
    }
    function overrideUpdate(fn, msg, send) {
        const before = detector.active;
        fn();
        if (before !== detector.active) event(detector.active ? 'manual_override' : 'override_released',
            { active: detector.active, strategy: c.overrideStrategy }, msg, send);
    }
    function observe(state) {
        if (isClosed()) return;
        overrideUpdate(() => detector.observe(state));
        const availability = !state ? 'missing' : state.state;
        if (['missing', 'unknown', 'unavailable'].includes(availability)) {
            node.status({ fill: 'red', shape: 'ring', text: 'ENTITY UNAVAILABLE' });
            if (lastAvailability !== availability) event('unavailable', { reason: availability });
        } else {
            const active = overrideActive(state);
            const info = light.normalized(state, active, legacyEnabled, 'state_changed');
            let text = active ? 'MANUAL' : `AUTO · ${info.state.toUpperCase()}`;
            if (info.state === 'on' && info.brightness_pct !== null) text += ` · ${info.brightness_pct}%`;
            if (info.state === 'on' && info.color_temp_kelvin) text += ` · ${info.color_temp_kelvin}K`;
            if (info.state === 'on' && legacyEnabled) text += ' · adaptive';
            node.status({ fill: active ? 'yellow' : info.state === 'on' ? 'green' : 'grey', shape: 'dot', text });
        }
        lastAvailability = availability;
    }

    function blockedResult(state, command, msg, send) {
        event('manual_override', { active: true, blocked: true, requested_action: command.action }, msg, send);
        const percent = Number.isFinite(state.attributes?.brightness) ? Math.round(light.pct(state.attributes.brightness)) : '?';
        node.status({ fill: 'yellow', shape: 'dot', text: `MANUAL · ${percent}% · BLOCK ${command.action.toUpperCase()}` });
        return { ...light.normalized(state, overrideActive(state), command.adaptiveEnabled, command.service), entity_id: c.entityId, outcome: 'skipped', reason: 'manual_override', source: command.source, requested_action: command.action, state_confirmation: 'last_observed' };
    }

    async function execute(msg, send) {
        let command, serviceCompleted = false, callingLightService = false;
        try {
            const state = adapter.state(c.entityId);
            if (!state || !['on', 'off'].includes(state.state)) throw light.fault(`Light is ${state?.state ?? 'missing'}`, 'unavailable');
            observe(state);
            const requestedOverride = Object.prototype.hasOwnProperty.call(msg, 'manual_override');
            if (requestedOverride && (msg.source ?? 'automatic') !== 'manual') throw light.fault('manual_override requires source: manual');
            if (requestedOverride && typeof msg.manual_override !== 'boolean') throw light.fault('manual_override must be boolean');
            command = light.plan(c, msg, state, overrideActive(state));
            if (requestedOverride) {
                overrideUpdate(() => detector.set(msg.manual_override), msg, send);
                command.blocked = false; // validated manual source
            }
            if (command.unsupported.length) event('unsupported', { parameters: command.unsupported, reason: 'lamp_capabilities_or_action' }, msg, send);
            if (command.blocked) return blockedResult(state, command, msg, send);
            let dynamicResult;
            if (c.colorMode === 'dynamic') {
                dynamicResult = { applied: false, reason: 'not_applicable' };
                if (needsDynamicTemperature(command)) {
                    let location;
                    try { location = await adapter.location(); } catch (_) { /* graceful fallback below */ }
                    if (isClosed()) return { entity_id: c.entityId, outcome: 'skipped', reason: 'node_closed' };
                    // Recheck even after failed lookup: external state/override may
                    // have changed while get_config was in flight.
                    const fresh = adapter.state(c.entityId);
                    if (!fresh || !['on', 'off'].includes(fresh.state)) throw light.fault('Light unavailable after location lookup', 'unavailable');
                    observe(fresh);
                    command = light.plan(c, msg, fresh, overrideActive(fresh));
                    if (command.blocked) return blockedResult(fresh, command, msg, send);
                    if (!needsDynamicTemperature(command)) dynamicResult.reason = 'state_changed';
                    else {
                        try {
                            const calculated = solar.calculate({ timestamp: now(), ...location,
                                minKelvin: c.dynamicMinKelvin, maxKelvin: c.dynamicMaxKelvin });
                            const payload = light.dynamicPayload(calculated.kelvin, fresh);
                            Object.assign(command.data, payload);
                            dynamicResult = { applied: true, desired_kelvin: calculated.kelvin,
                                sent_kelvin: payload.color_temp_kelvin, phase: calculated.phase };
                        } catch (_) {
                            dynamicResult = { applied: false, reason: 'dynamic_ct_unavailable' };
                            event('warning', { phase: 'dynamic_ct', reason: dynamicResult.reason,
                                message: 'Dynamic color temperature unavailable; keeping current color.' }, msg, send);
                        }
                    }
                } else if (!command.supportsTemperature) dynamicResult.reason = 'unsupported_color_temperature';
                else if (command.explicitColor) dynamicResult.reason = 'explicit_color';
                else if (command.turningOn && command.explicitBrightness) dynamicResult.reason = 'brightness_only';
            }
            if (isClosed()) return { entity_id: c.entityId, outcome: 'skipped', reason: 'node_closed' };
            callingLightService = true;
            await adapter.call('light', command.service, command.data, { entity_id: c.entityId });
            callingLightService = false;
            serviceCompleted = true;
            if (isClosed()) return { entity_id: c.entityId, outcome: 'skipped', reason: 'node_closed' };
            let adaptiveResult;
            try {
                adaptiveResult = await adaptive.apply(adapter, c, command);
                if (adaptiveResult.reason === 'unsupported_color_temperature') event('unsupported',
                    { phase: 'adaptive_apply', reason: adaptiveResult.reason, light_service_completed: true }, msg, send);
            }
            catch (error) {
                adaptiveResult = { applied: false, reason: error.reason || 'apply_failed' };
                event('warning', { message: error.message, reason: adaptiveResult.reason,
                    phase: 'adaptive_apply', light_service_completed: true }, msg, send);
            }
            if (isClosed()) return { entity_id: c.entityId, outcome: 'skipped', reason: 'node_closed' };
            const current = adapter.state(c.entityId);
            observe(current);
            const result = { ...light.normalized(current, overrideActive(current), command.adaptiveEnabled, command.service),
                entity_id: c.entityId, source: command.source, requested_action: command.action,
                service_data: command.data, ignored_conflicts: command.ignoredConflicts,
                ...(dynamicResult ? { dynamic_ct: dynamicResult } : {}),
                state_confirmation: 'last_observed', adaptive: { ...adaptive.inspect({ ...c, adaptiveEnabled: command.adaptiveEnabled }, adapter.states()), ...adaptiveResult } };

            const level = command.data.brightness === undefined ? '' : ` · ${Math.round(light.pct(command.data.brightness))}%`;
            node.status({ fill: command.source === 'manual' ? 'yellow' : command.turningOn ? 'green' : 'grey', shape: 'dot',
                text: `${command.source === 'manual' ? 'MANUAL' : 'AUTO'} · ${command.turningOn ? 'ON' : 'OFF'}${level}` });
            return { ...result, outcome: 'succeeded' };
        } catch (error) {
            const failure = { type: error.eventType || 'error', message: error.message,
                ...(callingLightService ? { phase: 'light_service_call', domain: 'light', service: command.service } : {}),
                ...(typeof error.code === 'string' ? { code: error.code } : {}) };
            event(failure.type, { ...failure, light_service_completed: serviceCompleted }, msg, send);
            if (!isClosed()) node.status({ fill: 'red', shape: 'ring', text: error.eventType === 'config_error' ? 'CONFIG ERROR' :
                error.eventType === 'unavailable' ? (error.message.startsWith('HA NOT READY:') || !adapter || !adapter.connected() ? 'HA NOT READY' : 'ENTITY UNAVAILABLE') : error.message });
            return { ...light.normalized(adapter.state(c.entityId), overrideActive(adapter.state(c.entityId)), legacyEnabled), entity_id: c.entityId, outcome: 'failed', error: failure, light_service_completed: serviceCompleted, cause: error };
        }

    }
    return { observe, execute, info: () => { const state = adapter.state(c.entityId); return light.normalized(state, overrideActive(state), legacyEnabled); } };
}
module.exports = { createController };
