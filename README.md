# SW Light — v0.1.9

A reusable Node-RED node for a Home Assistant `light.*` Entity or Label. Select an
existing HA server, select a target, deploy in a **development** environment,
and select Action **On**, **Off**, **Toggle**, or **From msg**. Display name:
**SW Light**; flow type: `sw-light`.

The basic flow is **Trigger → SW Light → Home Assistant**. SW Light reads the
selected light, checks manual override and calls the HA light service itself.
No external HA Action node is required; the two outputs are for observation
and integration only. With a fixed Action, a normal timestamp Inject is enough.

## Label targets in 0.1.9

Choose **Target → Entity** (the default, including existing flows) or **Label**.
Label autocomplete displays the HA name and stores the stable Label ID. Current
members are resolved from entity, device and labeled-area registry relationships;
non-lights are excluded and duplicate light IDs are removed. Area is not a target
choice in this version.

Each resolved light reuses the same controller with independent override,
capabilities, brightness limits and Adaptive Lighting. One overridden/unavailable
member does not stop the others. Output 1 for Labels contains `target`,
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
This is a local development candidate; no npm publication or HA installation is
part of its preparation. Physical Label behavior still needs the documented test.

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
npm install @johanwistbacka/node-red-contrib-sw-light@0.1.9
```

Restart Node-RED and reload the editor. Existing flow nodes retain type
`sw-light`; verify the scoped package/version in Palette Manager before testing.
The scoped candidate is not published yet; registry installation becomes
available after its first authorized publication.

## Compatibility and installation

Requires Node.js >=18.2.0, Node-RED >=3.1.1 and
`node-red-contrib-home-assistant-websocket` **exactly 0.80.3**. This initial
adapter is intentionally pinned because it uses that package's internal
shared-client module. It does not require the HA Node-RED companion integration.
HA contrib itself requires Home Assistant >=2023.12. Numeric bounds and
capabilities are read from the selected light.

This is an experimental development release. Local tests pass, but the runtime integration
has not yet been confirmed with the correct installed version in the real
Home Assistant environment. The adapter uses internal HA contrib APIs;
compatibility outside 0.80.3 is unsupported. Temporary structural diagnostics
are enabled. Test with a development light before relying on this node.

After this version is published, install it in your Node-RED user directory:

```sh
npm install @johanwistbacka/node-red-contrib-sw-light@0.1.9
```

After publication, the current development release is available under npm latest:

```sh
npm install @johanwistbacka/node-red-contrib-sw-light@latest
```

This candidate has been prepared locally and is not published yet. Restart
Node-RED after installation and verify the version in Palette Manager.

Select/create a Home Assistant server using the existing HA contrib config
node. A new server must be deployed before its entities are available in the
autocomplete. The text field also accepts an entity ID directly. This package
does not store tokens, create connections, change global context, or alter the
server config. Installation commands above are for your separate dev instance;
do not replace a working installation's versions without checking compatibility.

For edits, use npm's local directory installation/link or reinstall an archive
created with `npm pack`. Restart the isolated Node-RED runtime after changes.
There is no build step or additional runtime dependency.

The current development release uses the normal SemVer version `0.1.9` and
npm tag `latest` for Node-RED compatibility. This version remains experimental;
it is not a SemVer prerelease. Every installation/publication candidate needs a
unique version. Use `npm version patch --no-git-tag-version` for the next normal
development version. Separate prerelease builds may use `beta` tags. Git tags,
GitHub releases and npm publication require an explicit request.

Publishing to npm does not automatically add a node to the Community Catalogue.
After publication, submit the package through the
[Node-RED Flow Library](https://flows.nodered.org/add/node), or request a refresh
if it is already listed.

## Temporary runtime diagnostics in 0.1.9

This build logs `[SW Light debug]` at construction and on the first input,
then when the relevant structure/readiness changes. It reports version,
server-ID presence, whether the server resolves, constructor/type checks,
expected method/property presence, provider version and client readiness.
It never logs server IDs, entity IDs, credentials, hosts, full objects or state
snapshots. Provider initialization errors are reduced to a generic message.

After installation, restart Node-RED and verify a log line containing
`[SW Light debug] version=0.1.9`. Inject once and retain the prefixed lines,
along with any error/stack. Those lines distinguish missing configuration,
a missing provider client and a connected client with unexpected methods.
The real installation problem remains unverified until this build is tested
there. Diagnostics are temporary and intended to be removed after diagnosis.

The adapter follows the accessor used by official Current State and Action,
using one Node module resolution anchored at `RED.settings.userDir`. HA contrib
0.80.3 exposes no documented public third-party transport API or client method
on its server config node. Its internal dependency remains isolated and pinned;
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
validated against the lamp's advertised limits and sent as
`color_temp_kelvin`. Fixed RGB translates to RGB, HS, XY, RGBW or RGBWW
according to capabilities. White channels are zero when expanding RGB.
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

1. Install the local 0.1.9 archive, restart Node-RED, and verify its startup
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

## Test the updated 0.1.9 in your HA Node-RED installation

1. Save/export your current test flow. Transfer the rebuilt local
   `johanwistbacka-node-red-contrib-sw-light-0.1.9.tgz` to the Node-RED host. Check that HA contrib
   is 0.80.3; do not upgrade it for this task.
2. In a terminal for that Node-RED instance, find **User directory** in its
   startup log. Change to that directory (not a global npm directory) and run
   `npm install ./johanwistbacka-node-red-contrib-sw-light-0.1.9.tgz --ignore-scripts --no-audit --no-fund`.
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

Output 1 follows successful light service acknowledgement:

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
candidate. After installation, restart Node-RED and verify both Palette Manager
and the startup debug version before interpreting a new runtime failure.


Status distinguishes `CONFIG ERROR` (invalid/missing server or local config),
`HA NOT READY` (client/connection/states initializing), and `ENTITY UNAVAILABLE`
(missing, unknown or unavailable light). Blocked commands show
`MANUAL · 100% · BLOCK ON/OFF`; completed commands show `AUTO · ON · 94%`
or `AUTO · OFF` with the actual command level.

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
Blocked commands emit only output 2. Invalid input and transport failures also
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
Tests use Node's built-in test runner without HA or npm dependencies. They cover
numeric ranges, precedence, max/min, manual override, color translation,
unsupported capabilities, one-shot adaptive discovery/fallback, runtime outputs,
async errors, reconnect readiness and listener cleanup. The source checkout retains a separate development integration report; it is
excluded from the public npm package. Importable examples are in `examples/`; select your
own HA server and light before deploying them in a dev instance.

## Known limits and next steps

- The actual installed Node-RED/HA/Adaptive Lighting versions and attributes
  could not be inspected; compatibility outside the stated baseline is unverified.
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

Before live use, test server selection/autocomplete, each lamp capability,
external brightness changes, threshold/explicit release, adaptive one-shot behavior,
long transitions, deletion/unavailability, reconnect and repeated redeployment
in your real editor with a development light. No live deployment, global config
change, npm publication or GitHub release is part of this implementation.

Recommended v0.2: verify and add your installed HA contrib version to the
adapter's tested compatibility matrix, then add state-confirmation/relative-command
coordination and shared per-server subscriptions.
