# Integration inspection and verification — 2026-09-30

## Local discovery

- Project directory was empty and not a Git repository; no pre-existing code
  or tracked changes were overwritten.
- `~/.node-red` did not exist. `/usr/local/lib/node_modules` contained only
  npm and corepack. No HA contrib or Adaptive Lighting installation was found
  in the accessible Hass project or local config paths.
- Local tools: Node.js 24.12.0 and npm 11.6.2.
- No HA credentials, global Node-RED configuration or unrelated projects were
  read/changed. No connection was made to a live HA instance.
- npm registry baseline: HA contrib 0.80.3 (published Node >=18.2.0,
  Node-RED >=3.1.1); latest Node-RED was 5.0.7, but isolated testing used 4.1.3.

## Source evidence

Primary sources:

- [HA contrib source](https://github.com/zachowj/node-red-contrib-home-assistant-websocket),
  inspected main commit `2c2d2b35433838e57759fe8c1b21b72361d3e38d`.
- The **published npm 0.80.3 tarball** was also inspected. Its modular
  `dist/homeAssistant/index.js` exports `homeAssistantConnections`; this is
  the actual artifact against which compatibility is checked. Main had some
  newer lifecycle changes, so the tarball, not main, defines runtime assumptions.
- [Adaptive Lighting source](https://github.com/basnijholt/adaptive-lighting),
  inspected commit `283fec08ae7d34901d13c32e91fb001f92395fe7`.
- [HA light documentation](https://www.home-assistant.io/integrations/light/)
  and [Node-RED node lifecycle](https://nodered.org/docs/creating-nodes/node-js).

HA contrib does not expose a documented external custom-node transport API.
Its own action/state nodes import `getHomeAssistant` from the internal module.
Server config nodes are registered as `server` and populate the shared map at
construction. SW Light now uses `getHomeAssistant(server)`, the same provider
accessor used by Action and Current State. It reuses the shared map and lets
the provider initialize a valid config when no client exists. SW Light does
not create its own client, request credentials, or close the shared client.

The original adapter looked up the map once and threw "Home Assistant server
client is not initialized" when no entry existed. The runtime then saved that
constructor error permanently, so later inputs could not recover. This failure
is reproduced by the new valid-server/missing-client regression test. The 0.1.1 adapter
also searched the module cache for the active `server` constructor. That
discovery approach is removed in 0.1.2. The precise triggering
condition in the user's running HA installation was not inspected locally.

The subsequently supplied real `Flow.start` stack identifies `light.js:16`,
`ha-adapter.js:33` and the direct constructor call at `sw-light.js:54`.
Those locations match the preserved initial 0.1.0 archive exactly. They do not
match the previous local fix, which had different locations and a retry wrapper.
The evidence therefore indicates that the earlier runtime implementation was
still executing; the actual host installation path/cache was not inspected.

The current fix performs no HA module/client resolution in the SW Light
constructor. Each input resolves the active provider module, validates the
selected server, then calls `getHomeAssistant(server)` and checks connection
and state readiness before reading the entity or issuing a service. The adapter
revalidates the current provider client on every input and replaces its listeners
when that client changes. Missing clients, provider initialization exceptions
and disconnected/loading states remain retryable. Local invalid config is the
only permanently saved constructor error. Status separates `CONFIG ERROR`,
`HA NOT READY` and `ENTITY UNAVAILABLE`.

The internal adapter assumptions, all isolated in `lib/ha-adapter.js`, are:

| Artifact/API | Use |
|---|---|
| `dist/homeAssistant/index.js` → `getHomeAssistant(server)` | Provider-owned per-server client accessor |
| `ha.isConnected`, `ha.websocket.isStatesLoaded` | Availability/readiness |
| `websocket.getState/getStates/getServices` | Copied state and capability/service snapshots |
| `websocket.callService(domain, service, data, target)` | HA light and optional adaptive action |
| `websocket.subscribeMessage(callback, message, {resubscribe:true})` | HA `subscribe_events` for state changes |
| `ha.eventBus` client lifecycle topics | Ready, states loaded, connected, connecting, close, error |

Raw HA events are used because contrib 0.80.3 drops `new_state: null` in its
normalized state_changed event bus. The raw callback handles deletions and
maintains the selected light's observed snapshot. HA's websocket library handles
reconnect resubscription. All listener callbacks and the unsubscribe function
are scoped to the node; cleanup never closes the shared client.

The HA editor's selector components are bundled private implementations without
a documented external component API. Its own `haserver.ts` fetches the protected
`homeassistant/states/:serverId` editor route. SW Light uses that same endpoint
with Node-RED's jQuery UI autocomplete, filters to `light.*` / `switch.*`, and
displays friendly names plus entity IDs. This is a dynamic autocomplete, not
the full private HA multiselect component. Changing server reloads states;
late responses from an old selection are discarded. Existing admin auth applies.

Adaptive Lighting's `services.yaml` defines `apply` with entity_id, lights,
adapt_brightness, adapt_color, and turn_on_lights. `switch.py` exposes
configuration and manual-control lists. These observations support the manual
fallback and conservative attribute-based discovery; they do not prove what
schema/version is installed in the user's HA instance.

## Development validation

Built-in Node tests cover pure logic, runtime handling with a mocked adapter,
and adapter subscriptions/lifecycle with a mocked client. The optional
published-package test loads actual HA contrib 0.80.3 classes and shared map,
using a fake websocket transport. Run it with:

```sh
SW_LIGHT_HA_USER_DIR=/path/to/disposable/userDir npm test
```

An isolated Node-RED 4.1.3 with HA contrib 0.80.3 was installed in
`/tmp/sw-light-dev`, with SW Light linked from this checkout. It was bound to
`127.0.0.1:18891` and started with empty flows. Browser inspection verified:

- SW Light appears in the Home Assistant palette and has two outputs.
- Editor opens with 94/94/1%, 1s transitions, enabled manual override,
  100% threshold, Adaptive mode and optional apply disabled.
- Fixed Kelvin displays its field and hides Adaptive fields.
- Explicit-only override hides its threshold field.
- Cancel and reopening restore defaults without autocomplete lifecycle errors.
- No browser console errors during those interactions.

Initial v0.1 checks: all **18 tests passed**, including the optional published-package
adapter check; JavaScript syntax, editor field parity and both example JSON files
passed; `npm pack --dry-run` included the intended 11 distribution files.

The follow-up action/initialization fix passes **25 tests** with the published
integration tests enabled (23 dependency-free tests plus 2 provider tests).
The added provider test constructs the actual published server config node
and runs SW Light without an Action node, with only the network transport
simulated. It also checks a valid server before its client registry entry
exists; the provider accessor initializes it successfully. Runtime tests cover
fixed/dynamic actions, toggle resolution, 94/95/99% vs 255/255 protection,
blocked decision status, missing actions and retry after initialization failure.
The updated editor was also opened in the isolated Node-RED 4.1.3 instance:
Action showed On/Off/Toggle/From msg, defaulted to From msg, and retained On
after saving and reopening. No console errors were reported. No test flow
was deployed to the user's HA instance.

Live server entity autocomplete, lamp state/service behavior, physical
confirmation, real Adaptive Lighting ownership and reconnect behavior remain
to be tested in the actual environment. The isolated checks are not live HA
evidence. The temporary runtime is stopped at the end of this task.

The startup lifecycle fix passes **27 tests**, including 2 tests against the
published provider (25 dependency-free tests). The new startup regression
constructs SW Light while a valid server has no client, asserts zero provider
lookups during construction, rejects the first unready input safely, and then
executes the next input through the real adapter after readiness. It also checks
disconnect/reconnect, temporarily absent clients after a previous connection,
entity unavailability, missing/restored server and listener cleanup.
The published-provider runtime test additionally exercises its actual server
constructor, lazy provider initialization, delayed state readiness and partial
redeploy, with only the network transport simulated. A separate adapter test
checks replacement-client subscription cleanup. Syntax, editor field parity
and example checks also pass. The requested candidate remains 0.1.1 for this
replacement; subsequent real installation builds must increment the patch.


## 0.1.2 runtime comparison and diagnostic candidate

The real 0.1.1 test still reported a missing client while official nodes and
editor state lookup worked. The editor uses an HTTP admin endpoint; success
there does not demonstrate which client module SW Light loads in runtime.
No access to the real host's module resolution, server object or complete new
stack was available. The exact cause of that host failure is therefore **not
established**, and this candidate must not be described as a proven live fix.

Published 0.80.3 runtime paths, verified directly from its installed artifact:

- `dist/nodes/current-state/index.js`: `getServerConfigNode(config.server)`
  calls provider `globals.RED.nodes.getNode(id)` and validates config/credentials.
  `getHomeAssistant(server)` supplies the shared client to
  `createControllerDependencies` / `CurrentStateController`. Input reads
  `homeAssistant.websocket.getState(entityId)` and `getStates()`.
- `dist/nodes/action/index.js`: the same server helper and client accessor feed
  `ActionController`; it checks connection readiness and calls
  `homeAssistant.websocket.callService(domain, service, data, target)`.
- `dist/nodes/config-server/index.js`: the server creates `config` and
  `exposedNodes` and asks its provider to initialize the shared client. It does
  **not** expose public `getState`, `callService` or `homeAssistant` properties.
- `dist/homeAssistant/index.js`: `getHomeAssistant` returns its shared map entry
  or initializes through the provider if absent. This is an internal API used
  by its own runtime nodes, not a documented third-party extension contract.

SW Light 0.1.1 also used `RED.nodes.getNode(serverId)` then
`getHomeAssistant(server)` and `websocket.getState/callService`. Its divergence
was how it obtained that provider module: constructor identity search in
`require.cache`, then userDir resolution and a checkout fallback. Inspection
does **not** prove that the accessor itself was wrong or that this divergence
caused the reported error. The old error string in 0.1.1 appears only in the
adapter's incomplete-client shape check, prefixed `HA NOT READY:`. The provided
short error alone cannot identify that branch versus an older loaded artifact.

0.1.2 removes cache scanning and fallback searches. It uses a single standard
Node resolution anchored at the Node-RED runtime userDir, retains the same
provider accessor as official nodes and keeps every lookup lazy/retryable.
It never directly reads the provider registry or creates/closes a separate
connection. As in official nodes, the provider owns initialization. Missing
server/config/client/readiness and entity state retain their distinct statuses.
All action, message, brightness, transition and override contracts are retained.

Temporary `[SW Light debug]` logs report the build version, resolution policy,
provider version, server presence/constructor/type, expected method/property
presence and client readiness. They exclude IDs, host/URLs, credentials,
state snapshots and complete objects. Structural lines are deduplicated per
phase; initialization exception details are not printed. The next real test
must verify the `version=0.1.2` line, inject once, and capture these lines plus
the complete error stack if it still fails.

Validation: **28 tests passed**, including a new test using
`node-red-node-test-helper` with real Node-RED **4.1.15** and HA contrib **0.80.3**.
The helper uses the real node registry and flow startup to register/create the
published server constructor with disposable credentials and retrieve that
same instance via `RED.nodes.getNode(config.server)`. Only websocket network
transport is simulated. Production SW Light reads state and sends a service;
o adapter or client-registry entry is injected. Official Current State and
Action run in the same flow/client; Action emits the same service wire payload.
The test asserts only one provider connection, unready-input rejection,
recovery after readiness and disconnect/reconnect, and diagnostic privacy.
The disposable helper dependency install emitted deprecation notices for its
transitive test packages; no runtime dependency was added to SW Light.
Syntax, editor field parity and example JSON checks passed. These checks
remain local evidence and do not establish success in the user's HA host.


## Real stack fingerprint and Node-RED 5.0.7 verification

The supplied stack (`light.js:16`, `ha-adapter.js:33`, constructor
`sw-light.js:54`) matches the preserved original 0.1.0 package exactly.
Its constructor directly creates the adapter; the adapter reads
`homeAssistantConnections.get(serverId)` once and throws if the entry is absent.
The constructor saves the failure permanently. Provider startup order or a
separate module registry can leave that read empty. Which caused the original
empty entry on the real host is not established; working official nodes do
not make an independent registry read reliable.

The npm-published 0.1.3 runtime files were downloaded and compared byte for
byte with this checkout. Those files cannot produce the supplied constructor
stack: they defer adapter creation to input and use the provider accessor.
If the stack is from the current run, older source is still executing.
Installation directory/restart/cache provenance must be checked on the host;
no access to it was available during this investigation.

No additional runtime/API change was made for the 0.1.4 verification candidate.
It retains the existing fix: config-node lookup, internal provider
`getHomeAssistant(server)`, `websocket.getState/getStates/getServices`,
`websocket.callService`, raw `subscribeMessage` with `resubscribe:true`, and
`eventBus` readiness/close/connecting/error listeners. Dependency internals
remain confined to the adapter and pinned to 0.80.3. Official Current State
and Action use the same provider accessor and websocket state/service methods;
there is no documented external public config-node client API.

The disposable runtime now uses Node-RED **5.0.7**, provider **0.80.3**.
All 28 tests/checks pass. The real-registry integration test was extended to
close a node after it attaches while HA is unready, asserting removal of all
six node listeners and no status updates after later HA readiness. Existing
regressions cover construction before client initialization, first unready
input, subsequent successful input, disconnect/reconnect, ready operation,
client replacement, and close during pending subscription acknowledgement.

Commands received while HA is unready are rejected with output 2 and
`done(error)` (Catch-node handling); they are not queued or replayed. After
readiness, the caller must send a fresh command. Observation attaches on the
first input, and thereafter readiness/state events update status automatically.
Closing one SW Light removes only its own listeners/subscriptions, not the
shared provider connection. Local transport simulation does not prove live
network/device behavior; verify the running source/version on the HA host.


## Adaptive Lighting simplification — 0.1.8 (2026-09-30)

Investigated upstream commit `283fec08ae7d34901d13c32e91fb001f92395fe7`:
`handle_apply_service`, `extra_state_attributes`, `prepare_adaptation_data`,
`color_and_brightness.py`, and the service schema. `apply` is the supported
fresh-calculation boundary; there is no read-only calculation service. Switch
Kelvin attributes contain cached calculations when on and null when off.
No additional WebSocket calculation API is exposed by this integration.

Main switches expose `configuration.lights` only with configuration attributes
enabled; auxiliary switches do not expose it. Discovery uses a unique exact
membership, not guessed names, `lights` attributes or inferred groups. Advanced
selection supports unavailable discovery. This is schema-based discovery rather
than an entity-registry proof of integration identity; the actual action validates
the selected profile and failures remain nonfatal.

The main profile must be off to avoid continuous listeners and interception.
One-shot apply works off and forces calculation without changing that switch.
`adapt_brightness:false`, `adapt_color:true`, `prefer_rgb_color:false`, explicit
command transition, and `turn_on_lights:true` follow successful SW Light ON.
The last flag avoids a no-op if HA's state observation still says off. RGB sleep
profiles are refused because upstream can force RGB despite the preference flag.

All generic brightness/override/provider lifecycle behavior is retained.
Command intent and last observed OFF determine eligibility; physical ON and final
Kelvin remain asynchronous observations. The two actions are non-atomic; external
commands may race and a brief initial color can be visible. No attempt is made
to cancel other HA controllers. README contains setup and real-world verification.

Baseline: 30 dependency-free tests passed, 3 optional tests skipped before the
isolated installation was identified. Final: 42/42 passed, zero skipped, with
`SW_LIGHT_HA_USER_DIR=/tmp/sw-light-dev`; `npm run check` passed. Adaptive service
fixtures simulate only its integration boundary, never its solar algorithm.
Live Adaptive Lighting and physical light behavior remain unverified.

The workspace has no Git repository. A pre-edit local snapshot was saved under
`/tmp/sw-light-baseline-017` for scoped comparison; existing archives were retained.
No tags, GitHub release, npm publication or live deployment were performed.

## Label targets — 0.1.9 (2026-09-30)

See `docs/labels.md` for the inspected official registry commands, pinned HA
2026.9.0 target semantics, architecture, refresh behavior and physical test sequence.
HA contrib's published/installed 0.80.3 Websocket `send` and registry event topics
were inspected directly; its private editor selector is not reused as an external
component. A server.read-protected editor endpoint supplies dynamic Label choices
through the shared adapter. No credentials or live HA connection were used.

Pre-edit snapshot: `/private/tmp/sw-light-label-research/baseline`.
The workspace still has no Git metadata. Existing files and historical archives
are preserved; no tag, commit, publication or HA installation was performed.

Validation: `npm run check` passed. Full suite with
`SW_LIGHT_HA_USER_DIR=/private/tmp/sw-light-dev npm test`: **65 passed, zero failed,
zero skipped**, including all four optional tests using actual published-provider
classes with simulated transport. Added coverage includes stable Label identity,
editor serialization/unsaved target validation/request cleanup, protected Label
endpoint, direct/device/labeled-area memberships, deduplication/filtering,
empty/deleted/unavailable registries, snapshot caching/TTL/in-flight invalidation,
independent override/brightness/heterogeneous capabilities, mixed Adaptive Lighting,
partial failure, dynamic subscription membership, reconnect and close during command.

Editor verification is a local execution harness, not a rendered live editor check.
Physical lamps, the installed HA registry version/permissions, live membership
latency, network reconnect and Adaptive Lighting still require the documented test.
