# SW Light — v0.1.30

A reusable Node-RED node for a Home Assistant `light.*` Entity, Multiple entities, Label, Area or Group. Select an
existing HA server, select a target, deploy in a **development** environment,
and select Action **On**, **Off**, **Toggle**, or **From msg**. Display name:
**SW Light**; flow type: `sw-light`.

The basic flow is **Trigger → SW Light → Home Assistant**. SW Light reads the
selected light, checks manual override and calls the HA light service itself.
No external HA Action node is required; the two outputs are for observation
and integration only. With a fixed Action, a normal timestamp Inject is enough.

## Support

Report bugs and request support in the
[GitHub issue tracker](https://github.com/johanwistbacka/node-red-contrib-sw-light/issues).

## Status timestamps in 0.1.30

The status under each node now includes the date and time of its latest displayed
text or icon change, for example `AUTO · ON · 94% · 30/10 14:32:08`.
Identical observations keep the timestamp. Entity, multiple-light and error
statuses use the Node-RED process's local timezone. Restarting or deploying
starts a new timestamp; this is not confirmation of a physical lamp change.

## Existing-node temperature bounds in 0.1.26

Missing or blank optional Dynamic Kelvin bounds now use **2000–5500 K** in
both runtime and editor validation, for every target and color mode. Existing
saved nodes can deploy without being opened and saved individually. Opening
an older node fills those fields in the dialog; Cancel leaves its saved
configuration unchanged. Explicit numeric bounds are preserved. Invalid
numbers, nonnumeric values and an inverted effective range remain errors.
Malformed saved values stay visible and invalid when the dialog is saved;
opening a node cannot silently replace them with defaults.

This fixes hidden empty Kelvin fields marking **Lamp default** nodes invalid,
including the reproduced Hall Tak 10 case. Update the package, restart Node-RED
and reload the editor to load both corrected validators and runtime.

## Dynamic temperature refresh in 0.1.13

Every plain ON command now refreshes solar temperature, including already-on
lights. Absolute and relative brightness commands preserve temperature while
on. Explicit message color and manual override retain their precedence.

For a local installation, use the uniquely versioned archive
`johanwistbacka-node-red-contrib-sw-light-0.1.30.tgz` and restart Node-RED.

## Area and multiple entities since 0.1.16

Choose **Target → Area** and select the HA name; only its stable Area ID is saved.
SW Light resolves lights in that area, including lights that inherit their device's
area. An explicit entity area takes precedence over its device area. Hidden,
disabled, non-light and diagnostic/config entities are excluded from Area expansion.
A deleted Area fails closed; an existing area with no matching lights returns an
empty aggregate and **AREA EMPTY**. Membership refreshes while idle and on reconnect.

Choose **Target → Multiple entities**, then select the lights with Cmd/Ctrl-click.
**Add by ID** can add a known light that is unavailable or absent from suggestions.
The saved `entityIds` array is explicit: unavailable members report individual
failures and duplicates execute once. This target does not require HA registries.

Each light keeps independent capabilities, override, brightness limits and Dynamic
CT. Area and Multiple entities use the same aggregate output contract as Label.
Runtime overrides accept `{type: "area", id: "area_id"}` or
`{type: "entities", ids: ["light.one", "light.two"]}` in `msg.target`.

## Group targets since 0.1.18

Choose **Target → Group** and select a Home Assistant light group (`light.*`) or
legacy group (`group.*`). Suggestions show friendly names; only the entity ID is
saved. SW Light expands the state's `attributes.entity_id` list recursively,
ignores non-light members and deduplicates leaf lights. Each lamp keeps its own
capabilities, manual override, brightness limit and Dynamic temperature behavior.
Commands go to those lamps individually. Brightness-only dimming keeps CT while on.

Membership is read afresh on every input and refreshed while idle on root/nested
group state changes, reconnect and a 30-second fallback. Empty groups report
**GROUP EMPTY**. Missing or malformed group membership and cycles fail closed;
an unavailable leaf reports its own failure without blocking other lamps. Known
nested group identities are retained until successful membership removes them;
a missing light never previously identified as a group remains a leaf failure.
Runtime override: `msg.target = {type: "group", id: "light.room"}`.

Existing Entity, Label, Area and Multiple entities selections retain their target
semantics. Selecting a light group as **Entity** still controls its aggregate
entity; choose **Group** for expansion and independent per-lamp control.

## Local validation on 2026-10-05 and 2026-10-06

Real HA service/state tests verified repeated ON refreshing Dynamic CT,
brightness-only dimming preserving CT, per-lamp manual override/release, mixed
Label and Group protection, Group toggle and partial success with an unavailable
member. Explicit out-of-range Kelvin was clamped per lamp: requested 5000 K
reported 4000 K; requested 1000 K reported the advertised minimum 2202 K.
Observed rounding includes 2800 K reported as 2801 K and 100% as 254/255.
These state checks do not prove perceived physical color.

The window lamps previously showed a device-specific interaction between CT,
brightness and a one-second ON fade. The approved local workaround was On fade
0 for those two nodes; global fade defaults remain unchanged. The exact HA/device
cause remains unknown. Editor save/reopen and server-switch retention were checked
for Area, Multiple entities and Group selection. Full Area ON, 70% dimming and OFF passed on four available lights with an
unavailable fifth member reported separately. Dimming preserved each lamp's
CT. The original lamp states and saved flow were restored after testing. Live
nested Group membership changes are not verified.

A real HA restart initially crashed the HA provider. With the explicit registry
repair below, a repeated test passed without a Node-RED restart or deploy:
no failed input replay was observed, new ON inputs worked, and direct HA
brightness changes activated/released override in idle nodes after recovery.
This applies to patched HA contrib 0.80.3, not an unpatched standard installation.
See [the repair's scope and verification](docs/ha-registry-reconnect.md).

## Existing-node compatibility in 0.1.12

Older saved Entity and Label nodes can omit the newer Dynamic temperature
fields. The editor now validates those absent fields using the same
2000–5500 K defaults as the runtime, without modifying flow data or requiring
each node to be opened and saved. Explicit invalid values remain invalid.
Entity nodes saved before Target selection also keep their default Entity target.

Light service failures retain Home Assistant's `code` and include
`phase: "light_service_call"`, `domain: "light"` and the attempted `service`
on output 2 and per-light failure results. An unavailable observed entity,
failed Label resolution and an unavailable HA connection retain their distinct
existing events/status. A device-response error still needs investigation in
Home Assistant; this editor fix does not repair an unreachable device.

## Dynamic color temperature introduced in 0.1.10

Select **Dynamic (sun-based)** to calculate color temperature directly from Home
Assistant's configured location. Defaults are 2000–5500 K using an Adaptive
Lighting-like daylight parabola; each lamp's physical range clamps the result.
Each ON command sends current Kelvin with brightness in one `light.turn_on`,
including when the lamp is already on. Messages with `brightness_pct`,
`brightness`, `brightness_step_pct` or `brightness_step` preserve CT while
the lamp is already on; from OFF they also set initial solar CT.
Explicit message color/CT wins.
Missing/invalid HA location falls back to normal ON with a generic warning.
No Adaptive Lighting profile, polling or global variable is required.

Keep current stays the default and all saved legacy modes retain their behavior.
Legacy Adaptive Lighting is available under its collapsed compatibility section;
Dynamic bypasses it, including saved/message opt-in, to avoid competing CT writes.
Advanced Dynamic settings contain only Warmest/Coolest Kelvin.

See [the model, upstream comparison and one-lamp test sequence](docs/solar-temperature.md).
The numerical comparison sampled 384 instants across solstices/equinoxes; maximum
absolute difference from the recorded upstream normal CT reference is 20 K with SunCalc 2.1.1. This remains an experimental development release. Live service/state and
browser checks are recorded below; perceived physical color remains unverified.

## Label targets (introduced in 0.1.9)

Choose **Target → Entity** (the default, including existing flows), **Multiple entities**, **Label**, **Area**, or **Group**.
Label autocomplete displays the HA name and stores the stable Label ID. Current
members are resolved from entity, device and labeled-area registry relationships;
non-lights are excluded and duplicate light IDs are removed.

Each resolved light reuses the same controller with independent override,
capabilities, brightness limits and Adaptive Lighting. One overridden/unavailable
member does not stop the others. Output 1 for group targets contains `target`,
`resolved_entity_ids`, per-light `results` and success/skipped/failure/manual counts;
output 2 identifies the actual entity for per-light events. Status aggregates
last observed states.

Membership refreshes on provider registry/reconnect events and a 30-second cache
expiry/idle reconciliation fallback. One filtered state subscription per node is
reconciled without per-light subscription leaks. Optional `msg.target =
{type: "label", id: "label_id"}` or `{type: "entity", id: "light.example"}` overrides
configuration for one input; that target remains observed until the next input.
Departed target members discard their controller's explicit latch.

See [Label architecture, API evidence and exact multi-light test sequence](docs/labels.md).
Live mixed-override Label service/state checks are recorded above. Physical
Label behavior and the broader membership/lifecycle sequence still need verification.

## Package identity and migration

The permanent npm package name is `@johanwistbacka/node-red-contrib-sw-light`.
The Node-RED type stays `sw-light` and its display name stays **SW Light**.
The scoped package started at version 0.1.4; version numbers are independent
for each npm package name. Version 0.1.5 fixes observation before the first command; 0.1.6 also tolerates
null/non-array observed HA color attributes.

If upgrading from the old unscoped `node-red-contrib-sw-light`, export your
flows first. Remove the old package from the Node-RED user directory before
installing the scoped one; do not install both together because they register
the same node type. Use Palette Manager's package removal/installation controls
or, with Node-RED stopped, run these commands in its user directory:

```sh
npm uninstall node-red-contrib-sw-light
npm install @johanwistbacka/node-red-contrib-sw-light@0.1.30
```

Restart Node-RED and reload the editor. Existing flow nodes retain type
`sw-light`; verify the scoped package/version in Palette Manager before testing.
The scoped package is published. A version can be installed from the registry
once it is available there; a prepared local version can use its frozen archive.

## Compatibility and installation

**HA restart reliability:** HA contrib 0.80.3 and 0.81.0 contain a reproduced
registry rejection defect. This package supplies the opt-in `sw-light-ha-registry`
command and [check/apply/restore instructions](docs/ha-registry-reconnect.md).
Follow that explicit repair step for the verified affected versions and recheck
after provider updates. Installing SW Light alone does not patch the provider.


Requires Node.js >=18.2.0, Node-RED >=3.1.1 and
`node-red-contrib-home-assistant-websocket` **>=0.80.3 <0.82.0**. The adapter
uses that package's internal shared-client module and has been checked against
the published 0.80.3 and 0.81.0 packages. HA contrib 0.81.x requires Node.js >=20. It does not require the HA Node-RED companion integration.
HA contrib itself requires Home Assistant >=2023.12. Label targets additionally
require HA >=2024.4 (the Label registry). Area targets fetch only entity, device
and area registries and do not require the Label API. Numeric bounds and
capabilities are read from the selected light.

This is an experimental development release. The 0.1.13 runtime was installed
from its frozen archive and verified after restart in local Node-RED 5.0.7 with
HA contrib 0.80.3 and the existing Home Assistant server. The new candidate adds
Area, Multiple entities and Group runtime/editor support to that tested baseline. The adapter uses internal HA contrib APIs;
compatibility outside >=0.80.3 <0.82.0 is unsupported. Structural diagnostics
are opt-in. Test with a development light before relying on this node.

To install this version from npm when available, run in your Node-RED user directory:

```sh
npm install @johanwistbacka/node-red-contrib-sw-light@0.1.30
```

To install the version currently published under npm latest:

```sh
npm install @johanwistbacka/node-red-contrib-sw-light@latest
```

Restart Node-RED after installation and verify the version in Palette Manager.

Select/create a Home Assistant server using the existing HA contrib config
node. A new server must be deployed before its entities are available in the
autocomplete. The text field also accepts an entity ID directly. This package
does not store tokens, create connections, change global context, or alter the
server config. Installation commands above are for your separate dev instance;
do not replace a working installation's versions without checking compatibility.

For edits, use npm's local directory installation/link or reinstall an archive
created with `npm pack`. Restart the isolated Node-RED runtime after changes.
There is no compilation step. Dynamic temperature uses the pinned SunCalc 2.1.1 runtime dependency.

SunCalc 2 uses more accurate solar event times and returns `null` for absent polar
sunrise/sunset events; SW Light handles those events explicitly. Its polar
fallback retains the geometric noon-horizon rule despite SunCalc's new apparent
altitude output. The configured
Kelvin curve and command behavior are unchanged, although event times and
calculated temperatures may differ slightly from releases using SunCalc 1.9.0.
The HA contrib peer range remains limited to the verified 0.80.3/0.81.x APIs;
0.82.0 has not been validated and is not automatically accepted.

The current development release uses the normal SemVer version `0.1.30` and
npm tag `latest` for Node-RED compatibility. This version remains experimental;
it is not a SemVer prerelease. Every installation/publication candidate needs a
unique version. Use `npm version patch --no-git-tag-version` for the next normal
development version. Separate prerelease builds may use `beta` tags. Git tags,
GitHub releases and npm publication require an explicit request.

Publishing to npm does not automatically add a node to the Community Catalogue.
After publication, submit the package through the
[Node-RED Flow Library](https://flows.nodered.org/add/node), or request a refresh
if it is already listed.

## Temporary runtime diagnostics

Structural diagnostics are **off by default**. To troubleshoot, start Node-RED
with `SW_LIGHT_DEBUG=1` in its environment and restart the instance. This enables
`[SW Light debug]` at construction and when relevant structure/readiness changes.
It reports the package version, server-ID presence, method/property presence,
provider version and client readiness. It does not log credentials, server IDs,
entity IDs, hosts or full state snapshots through these structural messages.
Ordinary node errors and output-2 diagnostic events remain available by default.

Verify the installed version in Palette Manager. With diagnostics enabled,
retain the prefixed lines and any relevant error/stack. Remove the environment
setting and restart when troubleshooting is finished.

The adapter follows the accessor used by official Current State and Action,
using one Node module resolution anchored at `RED.settings.userDir`. HA contrib
0.80.3 and 0.81.0 expose no documented public third-party transport API or client method
on their server config node. The internal dependency remains isolated and bounded;
there is no `require.cache` scan or search for alternate package copies.

## Configuration

| Setting | Default | Meaning |
|---|---|---|
| Action | From msg | On/Off always choose that behavior; Toggle resolves the current state; From msg reads the message |
| On brightness | 94% | Used when no message brightness is supplied |
| Automatic maximum | 94% | Ceiling for every automatic ON/step |
| Minimum | 1% | Floor for nonzero brightness, including manual commands |
| On/off transition | 1s each | Sent only with light transition capability |
| Manual override | Enabled | Pause automatic commands while override is active |
| Detection | Brightness threshold + flag | Alternative: explicit flag only |
| Threshold | 98% | Lamp brightness at/above this value activates override |
| Color mode | Keep current | Normal behavior and fallback |
| Adaptive Lighting | Off | Current temperature once on automatic OFF → ON |
| Advanced profile | Automatic | Unique exact light membership; explicit selection if ambiguous |

Require `minimum <= on brightness <= automatic maximum`. When threshold
detection is enabled, automatic maximum must be below the threshold.
Transitions are 0–3600 seconds. Configuration errors prevent action calls.
Known lamp capabilities disable irrelevant fixed color choices in the editor;
runtime validation is authoritative.

Color modes: Adaptive Lighting, Keep current, Fixed Kelvin, Fixed mired, Lamp
default, Fixed color (`#rrggbb`). Kelvin and mired are normalized to Kelvin,
clamped to the lamp's advertised minimum/maximum and sent as
`color_temp_kelvin`. Fixed RGB translates to RGB, HS, XY, RGBW or RGBWW
according to capabilities. For example, 5000 K on a 2202–4000 K lamp sends
4000 K. This applies to Fixed Kelvin, Fixed mired and explicit message values;
invalid input remains an error. `sw_light.service_data.color_temp_kelvin` (or each
aggregate member result) shows the sent value. White channels are zero when expanding RGB.
White channels supplied explicitly are never silently discarded.

Keep current and Lamp default both omit configured color in v0.1. They use
HA/device restoration behavior; Keep current cannot guarantee that a device
or HA default profile preserves color across an OFF/ON cycle. Brightness
defaults still apply in every color mode.

## Input contract

Properties are on the **top-level message**, not nested under `payload`:

```json
{ "action": "on" }
{ "action": "off" }
{ "action": "toggle" }
{ "action": "on", "brightness_pct": 45, "transition": 3 }
{ "action": "on", "color_temp_kelvin": 2200 }
{ "action": "on", "source": "manual", "brightness_pct": 100 }
{ "action": "on", "source": "manual", "manual_override": true }
{ "action": "on", "source": "manual", "manual_override": false }
```

With Action **From msg**, `msg.action` is required; `msg.auto_light.action`
is accepted when the top-level action property is absent. Top-level action
takes precedence, including invalid values (which produce a clear error).
Fixed Action settings ignore message action properties. From msg remains the
default for backward compatibility. `source` is `automatic` (default) or `manual`.
Manual source bypasses the automatic ceiling and automatic command blocking;
it does not automatically latch override. Use the boolean `manual_override`
with `source: "manual"` for an explicit latch or release. An invalid source or
flag produces an error before service calls.

Message values override configuration for that command. Within a conflicting
group the first supplied property in the following order wins; other properties
are reported in `ignored_conflicts`. **All supplied recognized values are
validated**, even those that lose precedence.

| Group, in precedence order | Accepted values |
|---|---|
| `brightness_pct`, `brightness`, `brightness_step_pct`, `brightness_step` | 0–100, integer 0–255, -100–100, integer -255–255 |
| `color_temp_kelvin`, `color_temp` | Integer 1000–40000 K; 25–1000 mired, then lamp limits |
| `rgbww_color`, `rgbw_color`, `rgb_color` | Arrays of 5, 4, 3 integer bytes 0–255 |
| `hs_color`, `xy_color`, `color_name` | [0–360,0–100], [0–1,0–1], HA color name |
| `transition` | 0–3600 seconds |
| `adaptive_lighting` | Boolean; overrides Adaptive Lighting for one command |

The complete color precedence follows the table top to bottom. `color_name`
is passed to HA for name resolution/validation, only on a color-capable lamp.
Unrecognized message fields are preserved and never forwarded as service data.
Scalar numeric strings are accepted (useful for config); empty strings, null,
booleans, NaN, infinity and values outside bounds are errors.

Absolute brightness is clamped to the configured nonzero minimum and source's
maximum. Steps resolve against the last observed HA brightness (zero when off),
then clamp to 0–100 and the configured bounds. Step commands fail when an ON
lamp's brightness is unknown. Resolved zero turns the light off; it passes the
same override protection as ordinary OFF. HA uses byte brightness; the automatic
ceiling rounds **down** so 94% sends at most 239/255 (93.7%). Other values round
to the nearest byte, so a 1% minimum becomes 3/255 (1.2%).

`toggle` resolves current ON to `light.turn_off`, and current OFF to
`light.turn_on` with ON defaults. Brightness and color parameters supplied with an OFF command or
an ON→OFF toggle are omitted with an unsupported event. Transition is filtered
using the light's `supported_features` bit 32. Unknown/missing color capabilities
are treated conservatively. RGB/HS can translate between supported RGB/HS/XY
modes. XY and white-channel representations need their matching native mode.

## Manual override

**ON at 100% = manual override: automatic ON, OFF and Toggle do nothing.**
This hard guard requires brightness exactly **255/255**, so 94%, 95%, 99% and
254/255 do not trigger it. It applies even if the optional threshold detector
is disabled or set to explicit-only. Lowering the light below 255 allows
automatic control again unless an additional configured override is active.

Threshold detection observes HA state, not requested brightness. Each node starts
its state subscription after flow startup, before its first command, and retries
temporary provider initialization failures. This includes separate ON/OFF nodes
for the same physical light. The configured
threshold is converted to a byte; default 98% means brightness 250 or above.
With defaults, automation uses 1–94%, and observed brightness at/above this threshold activates
override. It pauses **all automatic commands**, including ON, OFF, toggle and
brightness zero, so an automatic ON cannot accidentally lower and release a
manual setting. A manually lowered observed brightness releases the threshold
flag. OFF releases all flags. Missing/unknown/unavailable state preserves flags
and rejects commands.

Existing nodes retain their saved threshold. Change a saved 100% threshold to
98% manually to use the new default behavior.

An explicit latch is independent of the threshold. It persists until explicit
release or observed OFF. A release flag clears both flags for its command;
subsequent threshold observations can reactivate override. Flags are in memory,
so redeployment rebuilds threshold state from HA but loses explicit latches.
This detector is separated from the planner for future HA-context-based origin
detection. `source` is the v0.1 command-origin contract.

## Adaptive Lighting

The primary editor control is **Adaptive Lighting: On / Off** (off for new nodes).
Color mode independently defines normal/fallback color behavior; the default is
Keep current. Advanced profile selection is collapsed. Discovery selects only
one exact light-membership match in a main switch's `configuration.lights`.
No entity names or undocumented `lights` attributes are guessed. Configuration
attributes must be exposed in HA (`include_config_in_attributes`) for discovery;
otherwise select the main switch explicitly. Multiple matches never choose the
first profile. Group membership expansion is not performed.

Keep the selected Adaptive Lighting **main switch OFF** to use its calculation
without continuous control or ON interception. The supported `adaptive_lighting.apply`
action works with that switch off and calculates fresh values for every call.
SW Light never toggles that switch, changes profile settings, clears manual
control or starts a continuous adaptation loop. Choose a profile using
color-temperature sleep color; RGB sleep profiles are rejected with a warning.

Precedence for each command:

1. Explicit message color/temperature wins, including unsupported color that
   is omitted with an event. It always suppresses Adaptive Lighting.
2. Otherwise, Adaptive Lighting runs only after a successful automatic OFF → ON
   service, on a color-temperature-capable light.
3. Otherwise, normal configured SW Light color behavior applies.
4. Keep current/lamp default omit color and leave normal HA/device behavior.

`msg.adaptive_lighting` (boolean) overrides the checkbox for that command.
Brightness, automatic maximum, override protection and fade stay with SW Light.
An already-ON brightness command, manual command, OFF or zero-brightness command
never invokes Adaptive Lighting. Configured fixed color still follows normal
SW Light behavior on these commands. Legacy adaptive flows with optional apply
already enabled retain their opt-in; former inactive adaptive flows stay off.
Legacy discover/respect-manual controls are retired.

After `light.turn_on`, SW Light calls `adaptive_lighting.apply` for exactly one
light with `adapt_brightness: false`, `adapt_color: true`, `prefer_rgb_color: false`,
`turn_on_lights: true`, and the SW Light command transition (0 if unsupported).
The true flag avoids silently skipping color when HA has not yet observed the
successful ON. Adaptive Lighting clamps temperature to the light's range.
The two actions are not atomic: a brief initial/default color may be visible,
and an external OFF between them can race with the second action. Service
acknowledgement reports an accepted action, not physical temperature confirmation.

Missing/unavailable/ambiguous/running profiles, a missing apply action or its
failure emit output 2 `warning`, with `phase: "adaptive_apply"`, structured
`reason`, and `light_service_completed: true`. Normal ON and output 1 survive,
retaining the configured color fallback. Non-CT lights emit `unsupported` and
still turn on without temperature parameters. A running HA profile or other
external automation can still alter lights independently; turn those off for
this ownership model. SW Light cannot cancel their behavior.

Investigation: [upstream apply documentation](https://adaptive-lighting.nijho.lt/services/)
and [source inspected on 2026-09-30](https://github.com/basnijholt/adaptive-lighting/blob/283fec08ae7d34901d13c32e91fb001f92395fe7/custom_components/adaptive_lighting/switch.py).
The main switch exposes last calculated `color_temp_kelvin` when on, but null
when off; reading that cache cannot deliver the requested fresh calculation.
`apply` recalculates in `prepare_adaptation_data` even while off. No dedicated
read-only temperature calculation service is exposed. Calculations remain in
Adaptive Lighting, including sun/time and sleep settings.

### Real-world verification

1. Install the local 0.1.30 archive, restart Node-RED, and verify its startup
   version. Use a test light with `color_temp` support. Connect both outputs to Debug.
2. In HA, expose the profile's configuration attributes for automatic discovery
   (or select it under Advanced). Keep its main switch off, use color-temperature
   sleep color, and disable any other automatic controllers for this test light.
3. In SW Light select Action On, brightness/max 94%, Keep current, Adaptive Lighting
   On. Turn the light off in HA and wait until Node-RED observes OFF. Trigger ON.
4. Verify `adaptive.applied: true` and brightness 239/255 (about 93.7%). After the
   fade, inspect HA light state and physically check the light. To get a comparison
   value while the profile is off, call HA's `adaptive_lighting.apply` yourself
   with the same profile/light, brightness false, color true, RGB preference false,
   turn-on true and transition 0; verify the light's temperature stays the same
   (allow calculation changes around a time boundary and device rounding).
5. Turn the light off and wait for OFF. Repeat at another time, or toggle the
   profile's sleep-mode helper with a distinct configured sleep temperature.
   Trigger ON; verify the new value rather than the previous temperature is used.
   Restore the sleep helper after testing.
6. While ON, send another automatic ON with `brightness_pct: 80`. Verify brightness
   changes and `adaptive.applied: false`; with Keep current, temperature stays put.
7. From OFF, send ON with `color_temp_kelvin: 3000`, then a supported explicit
   color command. Verify each wins and no adaptive action runs. Try a manual ON
   and verify the same suppression.
8. Set brightness to 100% externally. Automatic OFF must remain blocked. Lower
   below the configured threshold and verify OFF works again.
9. Test missing/ambiguous profiles, the main switch ON, and a non-CT light. Confirm
   normal ON plus the corresponding warning/unsupported event. Redeploy/reconnect
   and verify fresh discovery, safe observation and no duplicate adaptive calls.

Actual Adaptive Lighting version, exposed configuration, sleep behavior, lamp
latency/rounding and the two-action race still require verification on your HA
installation. Automated tests mock that service boundary, not its algorithm.

## Test the updated 0.1.30 in your HA Node-RED installation

1. Save/export your current test flow. Transfer the frozen local
   `johanwistbacka-node-red-contrib-sw-light-0.1.30.tgz` to the Node-RED host. Check that HA contrib
   is 0.80.3 or 0.81.0 (Node.js >=20 for 0.81.0).
2. In a terminal for that Node-RED instance, find **User directory** in its
   startup log. Change to that directory (not a global npm directory) and run
   `npm install ./johanwistbacka-node-red-contrib-sw-light-0.1.30.tgz --ignore-scripts --no-audit --no-fund`.
   Use the add-on's supported local package installation mechanism if its terminal
   does not expose that user directory/npm. Restart Node-RED/the Node-RED add-on
   and reload the editor so the updated runtime and HTML are both loaded.
3. Add a timestamp Inject directly into SW Light. Choose your **existing HA
   server**, one `light.*` entity, Action **On**, and the desired On brightness
   (94% by default). Keep Adaptive Lighting off for this basic test.
   Remove downstream HA Action nodes; leave outputs unconnected or use Debug.
4. Deploy. SW Light constructs without resolving HA and initially shows
   `HA NOT READY`. With the light OFF, click Inject: the light should turn on at the
   configured automatic level. Select Action **Off**, redeploy and inject:
   it should turn off. Test **Toggle** from both ON and OFF.
5. Set the lamp to 100% manually in HA (verify attribute `brightness: 255`).
   Try On, Off and Toggle: no automatic light service should run, and the node
   should show `MANUAL · 100% · BLOCK ...`. Lower the light manually to 94%, 95%
   then retry; automatic control should resume with default override settings.
6. Select **From msg** and use Inject properties `action` (string) with `on`,
   `off` and `toggle`. Also test `auto_light.action` when top-level action is
   absent. A missing/invalid action should show an error, emit output 2, and
   perform no service call. After HA disconnects, the node shows `HA NOT READY`;
   retry after HA reconnects. Initialization failures are retried on the next input.
   Also inject before HA is ready, then after it becomes ready without redeploying:
   the second input should succeed. Test partial redeploy and reconnect as well.

These are manual acceptance steps, not evidence of a live deployment.

## Outputs and status

Both outputs preserve original message properties. Only `sw_light` (output 1)
or `sw_light_event` (output 2) is assigned by this node.

For an Entity target, output 1 follows successful light service acknowledgement.
For Multiple entities, Label, Area and Group it instead contains an aggregate
with per-member results and succeeded/skipped/failed/manual counts, even when
some or all members fail or are blocked. Output 2 reports individual events and
can accompany that aggregate. Empty targets return an empty aggregate.

Example Entity result:

```json
{
  "action": "on",
  "sw_light": {
    "entity_id": "light.example", "state": "on",
    "brightness": 115, "brightness_pct": 45.1,
    "color_mode": "color_temp", "color_temp_kelvin": 2700,
    "color_temp": null, "color": {},
    "manual_override": false, "adaptive_lighting": true,
    "action": "turn_on", "requested_action": "on", "source": "automatic",
    "service_data": { "brightness": 115, "transition": 1 },
    "ignored_conflicts": [], "state_confirmation": "last_observed",
    "observed_at": "2026-09-30T10:00:00Z",
    "adaptive": { "entity_id": null, "active": false, "state": null, "candidates": [], "applied": false, "reason": "not_requested" }
  }
}
```

`adaptive_lighting` means the command's effective enablement (message overrides node).
`adaptive.active` means a resolved profile is available with its main switch OFF.
`adaptive.applied` reports successful action acknowledgement, not measured Kelvin.
The state is the **last observed HA snapshot**, possibly preceding the action
or an unfinished transition. Service acknowledgement does not confirm a physical
lamp change. No requested value is fabricated as observed state. The first input
resolves the selected server through the provider accessor and starts observation.
Every subsequent input revalidates the server/client; temporary failures remain
retryable. Once attached, status updates live from HA events (including
brightness-only changes), reconnects and deletions. A replaced provider client
gets fresh listeners; closing/redeploying removes this node's old subscriptions.
Output 1 does not emit every unsolicited state change in v0.1.

Inputs received before HA readiness are rejected explicitly: output 2 reports
`unavailable` and `done(error)` triggers Catch-node handling. They are not queued
or replayed. Send a new input after readiness. The node stays alive and retries
resolution on the next input. Readiness observation begins with the first input.

If a constructor stack shows `sw-light.js:54`, `ha-adapter.js:33` and
`light.js:16`, it identifies the original 0.1.0 implementation, not this
candidate. After installation, restart Node-RED and verify Palette Manager
and, if SW_LIGHT_DEBUG=1 is enabled, the startup debug version before interpreting a new runtime failure.


Status distinguishes `CONFIG ERROR` (invalid/missing server or local config),
`HA NOT READY` (client/connection/states initializing), and `ENTITY UNAVAILABLE`
(missing, unknown or unavailable light). Blocked commands show
`MANUAL · 100% · BLOCK ON/OFF`; completed commands show `AUTO · ON · 94%`
or `AUTO · OFF` with the actual command level.

Every displayed status ends with the date and time of its latest change,
for example `AUTO · ON · 94% · 30/10 14:32:08` (`DD/MM HH:mm:ss`).
The timestamp uses the Node-RED process's local timezone. It changes when the
displayed text or status icon changes, including errors and aggregate statuses.
Repeated observations and registry refreshes with identical status preserve the
timestamp. It is not a live clock or confirmation of a physical lamp change;
after a restart or deploy, the first status receives a new timestamp.

Output 2 has a stable versioned event envelope:

```json
{
  "sw_light_event": {
    "version": 1, "type": "manual_override", "entity_id": "light.example",
    "timestamp": "2026-09-30T10:00:00Z", "active": true,
    "blocked": true, "requested_action": "off"
  }
}
```

Types: `manual_override`, `override_released`, `unavailable`, `unsupported`,
`warning`, `error`. Details include `reason`, `parameters`, `message`, `phase` as applicable.
Unsupported parameters are omitted and the supported action still runs.
A blocked Entity command emits only output 2; multi-target commands also return
their aggregate on output 1. Invalid input and transport failures also
call Node-RED `done(error)` for Catch-node handling. Connection/state events have
no incoming message, so only the event property is supplied.

## Architecture and checks

`lib/light.js` owns config validation, override detection, capabilities, color
normalization and the pure command planner. `lib/adaptive.js` owns discovery and
apply behavior. `lib/ha-adapter.js` owns the sole internal HA dependency,
state-cache access, service calls and resubscribing event subscriptions.
`nodes/sw-light.js` connects Node-RED lifecycle, sequential inputs, status and
the two output contracts. `nodes/sw-light.html` implements the editor/help.

```sh
npm test
npm run check
npm pack --dry-run
```

Run these checks from the source checkout; test tooling is not included in the npm package.
Tests use Node's built-in test runner and the pinned SunCalc dependency. Most
tests mock HA; optional integration tests use an isolated published HA contrib
installation via `SW_LIGHT_HA_USER_DIR`. They cover
numeric ranges, precedence, max/min, manual override, color translation,
unsupported capabilities, one-shot adaptive discovery/fallback, runtime outputs,
async errors, reconnect readiness and listener cleanup. The source checkout retains a separate development integration report; it is
excluded from the public npm package. Importable examples are in `examples/`; select your
own HA server and light before deploying them in a dev instance.

## Known limits and next steps

- Local Node-RED 5.0.7 and HA contrib 0.80.3 were inspected and exercised;
  real HA restart recovery was verified with the explicit provider repair.
  The actual HA core/Adaptive Lighting versions and external profile membership
  were not established; compatibility outside the stated contrib baseline is unverified.
- Service results contain cached state, without physical confirmation. Rapid
  relative commands and toggles can use stale state despite serial service calls.
- A v0.1 raw state subscription receives all state changes and filters locally;
  one is created per SW Light node. It is removed on close, and HA's websocket
  resubscription handles reconnects. Sharing subscriptions is a v0.2 improvement.
- Adaptive discovery requires exposed configuration and exact light membership.
  Use Advanced selection when discovery is unavailable; verify the installed profile.
- Keep current depends on HA/device behavior. Color gamut correction and XY to
  other color-space conversion are not implemented. ON/OFF lights remain usable
  without brightness/color capabilities.

Before relying on a new installation, test server selection/autocomplete, each lamp capability,
external brightness changes, threshold/explicit release, adaptive one-shot behavior,
long transitions, deletion/unavailability, reconnect and repeated redeployment
in your real editor with a development light. Local test installation does not
authorize npm publication or a GitHub release.

Recommended v0.2: verify and add your installed HA contrib version to the
adapter's tested compatibility matrix, then add state-confirmation/relative-command
coordination and shared per-server subscriptions.
