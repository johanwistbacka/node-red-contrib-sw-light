'use strict';

const { fault } = require('./light');

// Main Adaptive Lighting switches expose configuration.lights in upstream
// extra_state_attributes. Auxiliary switches do not. Never infer entity names.
function candidates(c, states) {
    return Object.values(states).filter(s => s.entity_id?.startsWith('switch.') &&
        Array.isArray(s.attributes?.configuration?.lights) &&
        s.attributes.configuration.lights.includes(c.entityId)).map(s => s.entity_id);
}
function select(c, states) {
    if (c.adaptiveEntity) return c.adaptiveEntity;
    const matches = candidates(c, states);
    return matches.length === 1 ? matches[0] : null;
}
function inspect(c, states) {
    const matches = candidates(c, states), entityId = select(c, states);
    const state = entityId ? states[entityId] : null;
    return { entity_id: entityId, active: c.adaptiveEnabled && state?.state === 'off',
        state: state?.state ?? null, candidates: matches };
}
async function apply(adapter, c, command) {
    if (!command.adaptiveEnabled || !command.offToOn || command.source !== 'automatic' || command.explicitColor) {
        return { applied: false, reason: 'not_requested' };
    }
    if (!command.supportsTemperature) return { applied: false, reason: 'unsupported_color_temperature' };
    const info = inspect(c, adapter.states());
    const fail = (reason, message) => {
        const error = fault(message, 'warning'); error.reason = reason; throw error;
    };
    if (!info.entity_id) fail(info.candidates.length > 1 ? 'ambiguous_configuration' : 'configuration_missing',
        'Adaptive Lighting: no unique profile for this light; select a profile under Advanced.');
    if (!['on', 'off'].includes(info.state)) fail('profile_unavailable', 'Adaptive Lighting profile is unavailable.');
    // A running profile can intercept ON and continuously adapt brightness/color.
    // One-shot apply also works with the main switch off, without installing listeners.
    if (info.state !== 'off') fail('profile_running', 'Turn off the Adaptive Lighting main switch to use it as a one-shot profile.');
    const configuration = adapter.states()[info.entity_id]?.attributes?.configuration;
    if (configuration?.sleep_rgb_or_color_temp === 'rgb_color') fail('profile_uses_rgb',
        'Adaptive Lighting profile uses RGB sleep color; choose a color-temperature sleep profile.');
    if (!adapter.services()?.adaptive_lighting?.apply) fail('service_unavailable', 'Adaptive Lighting apply action is unavailable.');
    await adapter.call('adaptive_lighting', 'apply', {
        entity_id: info.entity_id, lights: [c.entityId], adapt_brightness: false,
        adapt_color: true, prefer_rgb_color: false, turn_on_lights: true,
        transition: command.data.transition ?? 0
    });
    return { applied: true, entity_id: info.entity_id };
}
module.exports = { candidates, select, inspect, apply };
