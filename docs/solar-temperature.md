# Dynamic color temperature

## Investigation and independent model

Inspected Adaptive Lighting on 2026-10-01 at commit
[`283fec08ae7d34901d13c32e91fb001f92395fe7`](https://github.com/basnijholt/adaptive-lighting/blob/283fec08ae7d34901d13c32e91fb001f92395fe7/custom_components/adaptive_lighting/color_and_brightness.py),
plus its [configuration documentation](https://github.com/basnijholt/adaptive-lighting#gear-configuration).
It uses Astral with HA's observer/location to calculate sunrise, solar noon,
sunset and solar midnight. Its `sun_position` is an event-time parabola, not
physical elevation: zero at sunrise/sunset, +1 at solar noon, -1 at solar
midnight. During daylight, CT interpolates linearly in this normalized value
between minimum and maximum Kelvin, rounded to 5 K. Normal night holds minimum
Kelvin unless `adapt_until_sleep` is enabled. That option extends the night
curve toward sleep Kelvin at solar midnight; sleep mode itself selects a fixed
sleep Kelvin or RGB color. Defaults are 2000/5500 K, sleep 1000 K and
`adapt_until_sleep: false`.

Sunrise/sunset can be shifted by offsets, overridden with civil clock times,
and bounded by earliest/latest times. Explicit time overrides also change
how noon/midnight are derived. Civil times require HA's timezone. The current
upstream source synthesizes events in polar regions. Brightness linear/tanh
ramp settings are brightness controls, not separate CT ramp settings. AL's
`get_settings` samples at current time plus transition duration; transition
also controls the lamp fade. Its periodic updates, switch entities, manual
control tracking, interception and brightness ownership are separate from
this mathematical model.

SW Light implements the daylight principle independently:

- `u = (t - solarNoon) / (solarNoon - sunrise)` before noon.
- `u = (t - solarNoon) / (sunset - solarNoon)` after noon.
- `f = clamp(1 - u², 0, 1)` in daylight; otherwise `f = 0`.
- `K = clamp(roundTo5(min + (max - min) × f), min, max)`.

Defaults: **2000–5500 K**. At sunrise/sunset/night use warmest, smoothly rise to
coolest at solar noon, then fall again. Fraction is 0.75 halfway between
sunrise and noon, giving 4625 K by default. This reproduces AL's default CT
principle without importing its implementation or its brightness policy.
SW Light samples the current instant, without AL's transition look-ahead.
The configured fade is passed normally in the single light service call.
There is no database, Kelvin cache, periodic task or global context variable.

[SunCalc 2.1.1](https://github.com/mourner/suncalc/releases/tag/v2.1.1) is a direct,
exact dependency, locked with npm integrity. Its bundled CommonJS build supports
our `require()` loading without relying on another Node-RED package's dependencies.
Version 2 improves astronomical event accuracy and returns `null` for absent
polar rise/set events; SW Light handles those events explicitly. Angles are now
in degrees and altitude now includes atmospheric refraction. To retain its
geometric noon-horizon policy, SW Light compares apparent altitude with
SunCalc 2.1.1's refraction at geometric zero (approximately 0.48396 degrees).
This follows the pinned library's refraction formula, which clamps negative
geometric altitude to zero for the correction. A small positive apparent
altitude alone therefore does not create a daytime burst during polar night.
Solar event times and Kelvin samples can differ slightly from SunCalc 1.9.0.
The comparison fixture below has been recalculated for this version.
Coordinates and timestamps are explicit pure-function inputs. Timezone is
unnecessary because calculations use absolute UTC instants and solar events.
Adjacent solar days handle midnight and the international date line.

Polar behavior deliberately differs from AL: polar night stays warmest instead
of inventing a brief cool midday. Midnight sun uses a daily parabola from warmest
at solar midnight to coolest at solar noon; no synthetic one-hour night.
Neither sleep mode nor clock offsets are added to this initial feature.

## Home Assistant adapter and privacy

`adapter.location()` sends the supported WebSocket
[`get_config`](https://developers.home-assistant.io/docs/api/websocket/#get-config)
command through the existing authenticated HA contrib 0.80.3 shared client.
The exact published provider's `Websocket.send()` forwards it through
`sendMessagePromise`; isolated integration tests exercise this path.
Only latitude, longitude and timezone are returned to the integration layer.
There is no new client, token, sun entity or dependency on global Node-RED context.
Location is read on demand, so changes in HA config do not require a cache reset.
No manual coordinates are exposed in the editor: HA is the single source for
this initial version. An advanced fallback can be added later if real usage
justifies another source of location configuration.

Invalid, missing, rejected or stalled location retrieval falls back to normal
ON without CT and emits a generic `dynamic_ct_unavailable` warning. Retrieval
has a 2-second bound, implemented as a single request deadline; no polling.
Coordinates, HA URLs and location names are absent from SW Light logs/events
and normal results. A changed/closed HA client cannot supply a stale response.
Each Label member currently retrieves config independently; the pure calculator
and per-lamp clamp remain separable for future shared per-command calculation.

## Editor, compatibility and precedence

Color temperature / color offers Keep current, **Dynamic (sun-based)**, fixed
Kelvin, fixed mired, lamp default and fixed color. Existing fixed choices retain
their saved values and behavior. Dynamic needs no common-use configuration;
its Advanced section exposes only Warmest/Coolest Kelvin. Keep current remains
the default for new and existing nodes. No stored node is silently switched.

Legacy Adaptive Lighting is in a collapsed compatibility section. Its saved
fields and runtime/message opt-in remain supported outside Dynamic. Selecting
Dynamic hides that section and bypasses legacy apply even if the checkbox was
saved on or `msg.adaptive_lighting` is true. This explicit mode selection owns
CT, avoiding a subsequent legacy service overwriting solar Kelvin.

Within Dynamic, precedence is explicit message color/CT first, then solar CT
on ON commands (including already-ON lamps), then keep current for dimming.
Outside Dynamic the existing configured fixed
color/CT and legacy behavior remain unchanged. Fixed and Dynamic are mutually
exclusive node modes; inactive fixed values do not participate in Dynamic.
Message color precedence is unchanged: Kelvin, mired, RGBWW, RGBW, RGB, HS, XY,
name; unsupported explicit colors are omitted rather than replaced with solar.
Invalid explicit Kelvin input still fails numeric validation. Since 0.1.22,
valid fixed/message Kelvin and mired values clamp to each lamp's advertised
range instead of rejecting the command.

Dynamic applies to automatic and manual ON commands, including already-ON
lamps and toggles that resolve to ON. Messages with `brightness_pct`,
`brightness`, `brightness_step_pct` or `brightness_step` are dimming commands
when the lamp is already ON and never add solar CT; from OFF they also set
initial solar CT. Explicit message color may still change it.
OFF, zero-brightness OFF, blocked automatic commands, and non-CT lamps do not
fetch location or calculate. No background CT updates occur while ON.
After asynchronous lookup, state and override are reread: external ON still
permits solar CT for a plain ON command, but preserves CT for a dimming command
and makes a toggle resolve to OFF. External manual override blocks automation;
unavailable state aborts control.
Existing automatic maxima, threshold/explicit override release and full-brightness
protection remain unchanged and independently tested.

The pure desired value is first bounded by the configured range. The per-light
control layer then clamps to the actual lamp range (`min_color_temp_kelvin` /
`max_color_temp_kelvin`, with legacy mired fallback). Physical limits take priority
even when the configured range lies entirely outside the lamp's range. A light
without `color_temp` support still turns on with brightness/transition. Invalid
physical range falls back without CT. Fixed/message CT now uses the same
physical range clamping; malformed advertised ranges still reject explicit CT. Results contain `dynamic_ct.applied`, desired/sent Kelvin and phase;
these describe acknowledged service data, not a measured lamp result.

## Reproducible comparison

Public Stockholm city-centre coordinates **59.3293, 18.0686** are used only in
development scripts/tests, never in production defaults. Run:

```sh
node scripts/compare-solar.js
# In an isolated Python environment: pip install astral==3.2
# Download color_and_brightness.py from the pinned upstream commit above.
python scripts/compare-adaptive.py /path/to/color_and_brightness.py
```

The second script executes the pinned upstream's actual `SunEvents.sun_position`
and `SunLightSettings.color_temp_kelvin` methods with normal night mode. Only
unused HA color-conversion imports are removed for standalone execution.
Full 15-minute samples, UTC/local labels, source SHA-256 and Astral version are
in [solar-comparison.json](solar-comparison.json): 96 samples per date, 384 total.
For 0.1.29, SW samples were recalculated with SunCalc 2.1.1 against the recorded
AL reference values; the upstream Python reference was not rerun. Across those
384 samples, the maximum change from SW Light with SunCalc 1.9.0 is 65 K.
No live HA, lamp, AL scheduling, interception or sleep profile is simulated.

| Date (2026) | Maximum absolute difference | Mean absolute difference |
|---|---:|---:|
| Winter solstice, Dec 21 | 20 K | 1.72 K |
| Spring equinox, Mar 20 | 10 K | 0.99 K |
| Summer solstice, Jun 21 | 10 K | 1.67 K |
| Autumn equinox, Sep 22 | 5 K | 0.99 K |

| Stockholm local time | Winter SW / AL | Summer SW / AL |
|---|---:|---:|
| 06:00 | 2000 / 2000 | 3620 / 3615 |
| 09:00 | 2610 / 2590 | 4910 / 4910 |
| 12:00 | 5480 / 5480 | 5470 / 5470 |
| 15:00 | 2000 / 2000 | 5310 / 5310 |
| 18:00 | 2000 / 2000 | 4420 / 4415 |
| 21:00 | 2000 / 2000 | 2805 / 2795 |

The default shapes align closely; differences are mainly astronomical event
estimation and 5 K rounding. Near short winter daylight edges, small timing
differences cause larger Kelvin differences. Noon and night agree. This is
numerical evidence, not proof of perceived color/device behavior.

## Legacy cleanup and one-lamp real-world sequence

Dynamic requires none of `lib/adaptive.js`, profile discovery, apply calls,
legacy switch selection, sleep-profile validation or `msg.adaptive_lighting`.
Those pieces can be removed after an explicit legacy migration/deprecation
plan. They cannot safely be deleted now while preserving saved opt-in flows.
No automatic migration is included. Existing AL installations can still
intercept service calls if enabled independently; disable that lamp's profile
for an isolated real-world Dynamic test.

1. In a test Node-RED environment, install a new uniquely versioned candidate
   containing this change, restart, and verify the startup version.
2. Select one CT lamp, Keep current first, and confirm normal on/off and override.
   Disable external AL adaptation for the test lamp and note its supported range.
3. Select Dynamic, leave 2000/5500 defaults and normal brightness/fade. With the
   lamp OFF, send ON. Inspect service data: brightness 239 by default (94% cap),
   valid Kelvin clamped to the lamp, transition if supported, and exactly one
   light call with no `adaptive_lighting.apply`. Confirm physically.
4. Leave it ON and send brightness 70%, then 80%. CT should remain unchanged.
   Wait across a meaningful part of the day: SW Light should issue no CT updates.
5. Send a plain ON later without turning the lamp OFF; desired Kelvin should be
   freshly calculated. Repeat from OFF, including ON with message brightness.
   Compare actual lamp response against `dynamic_ct.desired_kelvin` / `sent_kelvin`.
6. Send explicit 3000 K within the lamp range, then a supported explicit RGB
   command. Both should win without a solar lookup, even while already ON.
7. Raise brightness externally to the configured override threshold, verify
   automatic ON/OFF/Toggle remain blocked; lower it and verify release.
8. Repeat with a narrow configured range, a non-CT lamp and isolated missing-
   location fixture. Expect safe clamping, normal non-CT ON and warning fallback.

## Local validation 2026-10-05

A frozen 0.1.13 archive was installed in local Node-RED 5.0.7 and its startup
version/shared HA connection verified with HA contrib 0.80.3. Candidate 0.1.15
retains identical executable files and changes documentation/version metadata.
Browser Inject tests used temporary properties via **inject now**, followed by
Cancel; they did not save/deploy flow edits.

| Test | Observed result |
| --- | --- |
| Plain ON while already on | Four lamps refreshed to current solar CT; a later hall ON restored CT after explicit RGB. |
| Brightness-only ON | Both hall and window pairs changed to 70% without changing CT; service data omitted CT. |
| Manual 100% | Hall lamps reported 254/255 and threshold override became active. Automatic ON, dim and Label OFF preserved their state/context. |
| Manual lowering | Lowering Hall 2 to 70% released its override. Label OFF then switched off Hall 2 while Hall 1 remained protected at 254/255. |
| Explicit color | 2800 K reported as 2801 K; explicit RGB switched both hall lamps to XY with CT null. Solar substitution did not replace either request. |
| Repeated ON afterchange check | Both hall lamps and both window lamps remained at 239/255 with unchanged update/context during bounded checks (25 and 30 seconds respectively). |
| Cleanup | Hall lamps restored OFF; window lamps restored ON at 239/255 and 2754 K. Saved flow, credentials and settings hashes unchanged. |

An earlier window brightness change from 239 to 185 and smaller hall change
were observed after ON. These did not reproduce in the bounded follow-up.
An external Adaptive Lighting profile had its main/color/brightness switches ON;
its configuration did not expose member lights. This is evidence of a possible
competing controller, not proof of the cause. The tests did not disable that
profile. SW Light's Dynamic execution issues one light service call per command
and no delayed brightness/CT service calls from its observation timers.

Remaining live gaps: perceived physical color/fade, external physical control
and Toggle at full brightness, isolated external-AL interaction, unusual lamp
ranges/non-CT hardware, and missing-location fallback in a real HA setup.
Automated tests cover those command boundaries and deterministic fallback,
but cannot prove physical behavior. The unexplained earlier afterchange needs
an HA service/state trace if it recurs; record requested service data, HA context
and device history before attributing it to SW Light or Adaptive Lighting.
