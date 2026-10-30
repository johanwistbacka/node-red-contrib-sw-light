# Label, Area, multiple-entity and Group targets

## Investigated APIs and membership

The installed/published HA contrib **0.80.3** artifact was inspected, including
`Websocket.send`, `subscribeMessage`, registry collections, registry event names,
private editor selector and HTTP routes. It already owns registry subscriptions
but does not expose a public custom-node Label selector or Label HTTP endpoint.
SW Light continues to share its authenticated client through the existing adapter.
No separate connection, credentials or provider shutdown are introduced.

HA official WebSocket commands used:

- `config/label_registry/list`: `label_id`, human-readable `name`.
- `config/entity_registry/list`: `entity_id`, `labels`, `device_id`, `area_id`,
  `hidden_by`, `disabled_by`, `entity_category`.
- `config/device_registry/list`: `id`, `labels`, `area_id`.
- `config/area_registry/list`: `area_id`, `labels`.

Membership follows HA 2026.9 service target semantics: directly labeled entities,
entities of directly labeled devices, and entities reached through labeled areas.
An entity's explicit area takes precedence over its device's area. A label on a
parent device is not inherited through `via_device_id`. Hidden entries are excluded;
indirect device/area expansion excludes config/diagnostic entities, whereas a
directly labeled entity may have a category. SW Light additionally excludes disabled
entries and non-`light.*` IDs, and deduplicates the final list. These are registry
entities; Label resolution does not expand a light group's members or custom integration
relationships. Explicit Group selection expands members as described below. A `light` group can therefore coexist with its physical members;
avoid putting both in the test Label if independent physical control is required.

Primary sources:

- [HA Labels](https://www.home-assistant.io/docs/organizing/labels/)
- [HA 2026.9.0 target resolution](https://github.com/home-assistant/core/blob/2026.9.0/homeassistant/helpers/target.py)
- [HA WebSocket API](https://developers.home-assistant.io/docs/api/websocket/)
- [HA contrib 0.80.3](https://www.npmjs.com/package/node-red-contrib-home-assistant-websocket/v/0.80.3)

Area relationships are necessary for Label semantics. Since 0.1.16, **Area** is also
an exposed target type. It uses direct entity areas or inherited device areas,
with explicit entity area precedence; hidden/disabled/non-light/category members
are excluded. No occupancy, scene or mode logic is added. Multiple entities uses
an explicit nonempty `entityIds` array, deduplicated without registry expansion.

## Explicit Group selection (0.1.18)

Known nested light-group identities remain group targets during missing or malformed
state, until successful reconciliation removes them from membership. Group identity
for an initially missing `light.*` cannot be inferred; it remains a leaf failure.

Group accepts `light.*` modern light groups and legacy `group.*` IDs whose HA
state contains `attributes.entity_id`. Root/nested group membership is expanded
recursively; duplicate leaf lights execute once and non-light members are ignored.
Missing/malformed group lists and cycles fail closed before any dispatch. Missing
or unavailable leaf lights remain in the list and produce per-member failures.
Group suggestions use the existing authenticated `homeassistant/states` route,
display friendly names, and save `groupId`. No new registry API is required.

Every command resolves fresh membership. The single state subscription watches
both the root/nested groups and the leaf lights. Group state changes debounce
reconciliation by 100 ms; reconnect and the 30-second timer provide a fallback.
Existing controllers retain their overrides when members remain. After a resolution
failure the root and last known nested groups remain observed, preserving raw
deletions and enabling idle repair recovery. Group aggregate brightness never controls a
member's override. Empty groups report `target_empty` and **GROUP EMPTY**.

`msg.target = {type:"group", id:"light.room"}` follows the same temporary target
contract. Existing Entity/Label/Area/Multiple entities do not gain recursive group
expansion implicitly: select Group for independent physical lamp control.

[Home Assistant Group membership](https://www.home-assistant.io/integrations/group/)

## Architecture and editor

`targets.js` validates `{type,id}`, resolves registry membership and builds aggregate
status. `controller.js` owns the existing execution path, one Override detector per
entity, command planning, capability filtering and Adaptive Lighting. `sw-light.js`
coordinates controllers and output. `ha-adapter.js` alone knows provider internals.
Area, Multiple entities and Group reuse these same controllers.

Target choices are **Entity** (default), **Multiple entities**, **Label**, **Area** and **Group**. Missing `targetType` in old
flows means Entity; `entityId` and old outputs/status remain compatible. Label uses
`labelId`, a stable HA ID. Autocomplete displays `name (label_id)` and a separate
name helper; it stores only the ID. Changing server aborts requests and ignores
obsolete responses. Cancel/save destroys autocompletes and handlers.

Entity autocomplete still uses HA contrib's `homeassistant/states` route. Label
uses `/sw-light/labels/:serverId`, protected by Node-RED `server.read`, fetching
`config/label_registry/list` through the shared adapter. A deployed connected server
is required for suggestions; entering a known stable Label ID remains possible.
Area uses the equivalent `/sw-light/areas/:serverId` guarded route and shared
`config/area_registry/list` transport. Its autocomplete stores `area_id`, not name.
Multiple entities displays friendly names and saves only IDs from the multiple
selection. Add by ID supports unavailable lights; server refresh retains selected IDs.

## Refresh, subscriptions and overrides

A node caches an immutable registry snapshot for **30 seconds**. Resolved lists are
cached per snapshot, target type and stable ID, so repeated brightness inputs do not rescan all
registries. Provider events `labels_updated`, `entity_registry_updated`,
`devices_updated`, `areas_updated` invalidate the snapshot and debounce reconciliation
by 100 ms. The provider itself throttles registry updates. Ready/connect/state-loaded
and disconnect events also invalidate it. A 30-second timer reconciles idle nodes,
providing a fallback if an update event is missed; commands refresh expired snapshots.
An invalidated in-flight snapshot is rejected rather than installed as fresh data.

There is **one raw state_changed subscription per node**, with a reconciled Set of
member IDs, rather than a subscription for every light. Departed IDs stop updating
that node; added IDs get their own controller. Remaining controllers retain their
explicit/threshold flags. Removed controllers are discarded; rejoining lights start
with fresh flags and observe their actual state. Registry resolution failure clears
the watched membership and reports TARGET UNAVAILABLE; existing controllers are
retained until successful reconciliation. No stale members receive a command.

The shared WebSocket library handles reconnect resubscription. Closing/redeploying
removes this node's listeners, subscription, timers and controllers; it leaves the
provider's listeners and connection intact. Close during an in-flight service prevents
later light/adaptive calls and output from that node.

`msg.target = {type:"label", id:"cozy"}` or
`msg.target = {type:"entity", id:"light.example"}` overrides configuration for that
input. Its members remain observed until the next input; an input without `target`
restores configured targeting. Reconciliation discards controllers that leave the
active target, including their explicit latch. Use a stable target when retaining
explicit latches across commands. Area accepts `{type:"area", id:"area_id"}`; Multiple entities accepts
`{type:"entities", ids:["light.one", "light.two"]}`. Unknown types fail validation.

Each light retains independent state, automatic maximum, capability filtering,
override flags and Adaptive eligibility. With max 94%, threshold 98%, window 94%,
table 100% and floor 70%, automatic OFF controls window/floor and skips table only.
Lowering table below threshold releases table only. Explicit latches still require
explicit release or observed OFF; manual-source commands keep their existing bypass.
The brightness-255 guard remains independent of the configured detector.

ON/OFF-only lights receive no brightness/color parameters. RGB, CT, brightness-only
and transition support are inspected per actual entity. Unsupported parameters emit
entity-specific events and are omitted. A member's range/transport/availability error
does not prevent later members from running.

Adaptive Lighting behavior remains unchanged: eligible automatic observed OFF → ON
first executes the light action, then applies one-shot CT adaptation for that light
only. Profile discovery uses that light's exact configuration membership. Unsupported
members turn on normally; missing/running/ambiguous profiles or failed apply emit
warnings while the successful light action stays successful. No solar algorithm is
copied or shared between members.

## Outputs and status

Entity output 1 retains the prior normalized result; blocked Entity commands still
emit their event without a result. Label output 1 retains the incoming message and
adds `sw_light` with `version:1`, `target:{type,id}`, `resolved_entity_ids`, `results`
and `counts:{succeeded,skipped,failed,manual}`. Each result identifies `entity_id`,
observed state/override and its outcome. Successful results include service data and
Adaptive details; skipped results explain manual override; failed results contain
error type/message and whether the light action completed. Adaptive warnings alone
are not counted as light-action failure.

Success means service completion, **not confirmed physical state**. Output and Label
status use last observed HA states. The aggregate can show `2 on · 1 manual · 2 off`
or `4 on · 1 unavailable`; manual members are counted separately from automatic ON.
Empty Labels emit `target_empty`, an empty aggregate and LABEL EMPTY. Deleted Labels
or missing registries emit `target_resolution_failure`, TARGET UNAVAILABLE and Catch
error handling, without controlling old members. Per-member partial failure returns
an aggregate and entity-specific output 2 events without failing the whole input.

## Exact real-world verification sequence

This sequence is pending; do it after separately authorizing/installing the local
candidate in your development HA/Node-RED environment.

1. Export the test flow and note the currently installed version. Restart Node-RED
   after installing 0.1.9, reload the editor and verify the startup `version=0.1.9`.
   Keep one old Entity node in the flow and confirm it operates without reconfiguration.
2. Create one HA Label named **SW Light test**, record its generated stable ID, and
   use physical test lights (not a group entity): a dimmable CT light A, an RGB or
   brightness-only light B, and an ON/OFF light C where available. Add A directly,
   B through its device, and C directly. Also add one sensor. If A's device is shared
   with other lights, labeling it deliberately includes those primary lights too.
3. Select Target **Label**, choose SW Light test by name, save/reopen and verify the
   stable ID remains selected. Configure From msg, brightness/max 94%, threshold 98%,
   1-second fades. Connect both outputs to complete-message Debug nodes.
4. Start all members OFF. Inject `{action:"on"}`. Confirm all physical members turn
   on; A/B receive at most 94%, C receives plain ON. Check IDs, independent service
   data, success counts and subsequent observed aggregate status.
5. Set A to approximately 94%, B to 100% manually in HA, and leave C ON. Wait for
   output 2's B `manual_override` event. Inject `{action:"off"}`. A and C must turn
   OFF while B remains ON; aggregate must show B skipped/manual and two successes.
   Optionally use three dimmable lights with values 94/100/70 to match the exact example.
6. Lower B to 70% through HA and wait for its `override_released`. Inject automatic
   ON and OFF; B now follows both. Raise A to 100%, leave B below threshold, repeat
   OFF and confirm only A is protected. Inject `{action:"off",source:"manual"}` and
   confirm the manually overridden member also turns OFF.
7. Start A/B/C OFF. Enable Adaptive Lighting on SW Light and keep the relevant
   profile main switch OFF, CT sleep color configured, configuration attributes
   enabled. Inject ON. Confirm A receives its own one-shot CT apply while B/C turn on
   normally. Verify no Adaptive brightness change, correct per-light profiles and
   warnings for unsupported members. Already-ON brightness changes must not reapply.
8. Add a fourth physical light D to the same Label while the node is idle. Wait for
   reconciliation (normally provider event delay + 100 ms; fallback about 30 seconds)
   and confirm D appears in status/next result. Remove C; changing C in HA must no
   longer produce events for this node. No flow edit should be necessary.
9. Label A's device as well as A directly; confirm A appears once. Where convenient,
   label a test area with the same Label and verify the documented area precedence
   and extra primary lights. Remove that area assignment afterward.
10. Make B unavailable through the test device/integration's normal controls. Inject
    automatic ON/OFF. Available members must still succeed; output identifies B as
    failed/unavailable. Restore B and verify recovery.
11. Disconnect/reconnect the HA connection in the development environment, then send
    a fresh command after ready. Verify refreshed membership, external override
    observation and no duplicate events. Redeploy only the SW Light node, then remove
    it; confirm removed nodes no longer emit events/status or light actions.
12. Remove all light assignments while retaining the Label/sensor: expect LABEL EMPTY
    and no calls. Delete the Label: expect target_resolution_failure and no old calls.
    Recreate a Label and select its actual new ID; do not assume the name restores identity.

Still requires real HA verification: actual registry permissions/schema on the
installed HA version, rendered autocomplete/save/reopen, physical service/state timing,
live membership update latency, real network reconnect/redeploy and Adaptive profile
behavior. Local tests simulate transport and never connect to or install into HA.

## Changed files and local checks

Runtime/editor: `nodes/sw-light.js`, `nodes/sw-light.html`, `lib/light.js`,
`lib/ha-adapter.js`, new `lib/controller.js`, new `lib/targets.js`.
Package/documentation: `package.json`, `README.md`, `CHANGELOG.md`,
`docs/integration.md`, new `docs/labels.md`.
Tests: `test/published-integration.test.js`, new `test/targets.test.js`,
`test/label-runtime.test.js`, `test/label-adapter.test.js`, `test/label-editor.test.js`.
Existing Adaptive Lighting implementation and example flows are unchanged.

`npm run check` passed. Full suite with the isolated 0.80.3 installation enabled:
**65 tests passed, zero failures/skips**. Version is prepared through
`npm version 0.1.9 --no-git-tag-version`. No Git repository exists in this workspace;
no commit/tag/release/publication/HA deployment is part of this candidate.
