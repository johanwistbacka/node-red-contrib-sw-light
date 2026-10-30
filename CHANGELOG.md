# Changelog

## 0.1.30 — Date and time of the latest status change

- Append the latest displayed status change date and time (`DD/MM HH:mm:ss`, Node-RED local timezone) to Entity and aggregate statuses, including errors. Preserve the timestamp on identical refreshes.
- Use the Node-RED process's local timezone and reset the displayed timestamp after restart or deploy.
- Keep light commands, output event timestamps and Home Assistant compatibility unchanged; add regression coverage for repeated observations, aggregate updates and status icon changes.

## 0.1.29 — Preserve the geometric polar horizon

- Include SunCalc 2.1.1 and package support links, with explicit handling of absent polar sunrise/sunset events.
- Preserve the geometric noon-horizon rule after SunCalc 2 added atmospheric refraction to reported altitude. Near-horizon polar nights remain at the warmest Kelvin instead of switching to the daytime curve.
- Add polar-transition regressions and update comparison/installation documentation. HA-contrib compatibility and light-command behavior are unchanged.

## 0.1.28 — Current solar dependency and support links

- Rejected local candidate, not published. Independent review found that apparent altitude could change the polar-night fallback; corrected in 0.1.29.
- Upgrade SunCalc from 1.9.0 to 2.1.1 and handle absent polar sunrise/sunset events in its updated API. Dynamic retains its configured Kelvin curve, range limits and command behavior; astronomical event times may change slightly.
- Include the repository, issue-tracker and homepage metadata prepared in 0.1.27, plus updated support and installation documentation.
- Keep HA-contrib compatibility at the verified >=0.80.3 <0.82.0 range. No automatic HA-provider upgrade or registry patch.

## 0.1.27 — Package support links

- Superseded local candidate, not published. The following candidate also addresses the dependency warning.
- Add the public GitHub repository, issue tracker and homepage to package metadata so Node-RED's scorecard can identify a support contact.
- Add a support link to README and update installation references. Runtime, editor, dependencies and HA-provider repair are unchanged from 0.1.26.

## 0.1.26 — Automatic defaults for older temperature fields

- Treat missing or blank optional Dynamic Kelvin bounds as 2000–5500 K in runtime and saved-node/editor validation, for every target and color mode. Older nodes can deploy without individual manual resaving.
- Populate the editor's optional temperature fields when opening an older node, including when Lamp default hides them. Cancel preserves the saved configuration; explicit bounds and strict invalid-value/range checks remain.
- Add eight regression tests covering saved nodes, dialog initialization/cancel, partial bounds, runtime configuration, browser number-input coercion, incomplete typed tokens and preservation of explicit numeric strings.
- Keep malformed saved bounds visible and invalid through Done. Use text controls with a numeric keyboard hint for optional Kelvin bounds so incomplete tokens remain invalid. Normalize valid saved numeric strings without changing their effective values, including inverted ranges.
- Update installation/version references and remove transient unpublished-candidate wording from README. Development release; no automatic HA-provider patch.

## 0.1.25 — Rejected local candidate

- Fixed malformed saved-value coercion, but native browser testing found that an incomplete typed token such as `-` becomes an empty value in number controls and incorrectly passes optional-default validation.
- Not published. Corrected in 0.1.26, with text controls that preserve input for strict validation.

## 0.1.24 — Rejected local candidate

- Built and installed only in an isolated test environment. Independent review found that browser number inputs could erase malformed saved bounds and silently substitute defaults on Done.
- Not published. Corrected in the following installation candidates, with the complete fix in 0.1.26; the original 0.1.24 archive is retained for review evidence.

## 0.1.23 — Supported HA registry repair and quiet diagnostics

- Ship the opt-in `sw-light-ha-registry` CLI and check/apply/restore guide for the reproduced HA contrib 0.80.3/0.81.0 registry disconnect failure. Guard exact provider bytes, preserve an original-file backup, and refuse unknown artifacts or unrelated edits. No automatic dependency mutation or postinstall hook.
- Make structural debug logging opt-in with `SW_LIGHT_DEBUG=1`; retain ordinary node errors and output events.
- Verify real Area ON/dimming/OFF with four available lamps and one unavailable member; restore the original saved flow and lamp states.
- Update installation and live validation notes. HA restart recovery remains verified with the explicit provider repair, not an unpatched installation.
- Published on npm as `latest` on 2026-10-06 from the exact reviewed archive; downloaded contents and checksum verified. No Git tag or GitHub release.

## 0.1.22 — Clamp explicit color temperature

- Clamp Fixed Kelvin/mired and explicit message temperatures to each lamp's advertised Kelvin bounds, with legacy mired fallback, instead of rejecting valid out-of-range requests.
- Reuse Dynamic's physical-range validation and capability handling; preserve input validation, explicit-color precedence and manual override.
- Clarify Entity versus aggregate results on output 1 and diagnostics/events on output 2.


## 0.1.21 — Preserve Group observations during errors

- Keep root and known nested group subscriptions during resolution failure, preserving raw deletion observations against stale provider caches and enabling idle repairs.
- Add a real-adapter-plus-node regression covering nested deletion, repeated invalid commands, repair and membership removal.


## 0.1.20 — Deleted nested Group protection

- Retain known modern nested group identities while resolving the same active Group target, so deleted/malformed groups fail closed instead of becoming leaves.
- Discard removed identities after successful reconciliation; ordinary missing lights remain per-member failures.
- Actual five-member group resolved in the local browser on 0.1.19 using invalid brightness to prevent lamp service calls; physical Group ON/dimming remains unverified.


## 0.1.19 — Group observation fixes

- Read group membership through raw-aware per-entity observations, so fresh membership/deletion events take precedence over a stale provider collection.
- Retain failed runtime target overrides for idle root repair and restore the configured target on the next plain input.
- Add regressions for root/nested changes, missing/malformed membership and failed Group override recovery.
- Group autocomplete, stable-ID save/reopen and server-switch retention checked locally on the unchanged 0.1.18 editor.


## 0.1.18 — Group targets

- Add Group selection with friendly-name autocomplete and stable modern light/legacy group IDs.
- Expand nested membership, deduplicate leaves and preserve independent capabilities, override, brightness and Dynamic CT per lamp.
- Refresh membership on commands, idle group events and reconnect; fail closed on malformed/missing/cyclic groups and report unavailable leaves individually.
- Preserve existing targets and support structured Group message overrides.


## 0.1.17 — independent Area registry compatibility

- Resolve Area through entity/device/area registries without requiring the newer Label API; keep separate cached snapshots and invalidation.
- Correct release scope and minimum-HA documentation. Area/multiple editor save/reopen and server-switch retention were checked in local Node-RED.
- Preserve the frozen 0.1.16 archive; use a new installation candidate for these reviewed changes.

## 0.1.16 — Area and multiple-entity targets

- Add Area autocomplete with stable IDs and direct/inherited light membership, including explicit entity-area precedence and idle/reconnect refresh.
- Add Multiple entities selection and Add by ID, with deduplication, independent capabilities/override and aggregate per-light results.
- Preserve legacy Entity/Label configuration and outputs; distinguish Area/Label cache keys and fail closed on deleted targets.
- Document the verified zero-On-fade workaround for affected window lamps. This is a local flow setting, not a global fade change.
- Validate with 112 tests against HA contrib 0.80.3 and 0.81.0; new editor and live target checks follow local installation.

## 0.1.15 — final candidate documentation corrections

- Correct remaining README claims about installed runtime inspection, test dependencies and live Label evidence.
- Retain the validated executable code from 0.1.13. Use a fresh version because 0.1.14 was already packed and reviewed.
- Local candidate only; publication remains a separate action.

## 0.1.14 — local validation and installation guidance

- Correct active installation/archive/startup references to this unique candidate; retain historical version notes.
- Record live browser/HA checks of Dynamic ON refresh, dimming, override/release, mixed Label protection and explicit Kelvin/RGB, with restored lamp states and unchanged saved configuration.
- Document device rounding, the unreproduced brightness afterchange and remaining physical/external-controller verification limits. Executable files are unchanged from 0.1.13.
- Local candidate only; no npm publication, commit, tag or GitHub release.

## 0.1.13 — Dynamic temperature refresh on ON

- Refresh Dynamic solar color temperature on each ON command, including already-ON lamps. Preserve temperature for absolute/relative dimming while ON; brightness supplied when turning an OFF lamp ON still sets initial solar temperature.
- Recheck command eligibility and manual override after location lookup. Preserve explicit color precedence, per-lamp limits and legacy Adaptive Lighting behavior.
- Add repeated-ON, dimming, state-race and Label regression coverage; update editor help and the Dynamic contract.
- Remove an accidental self-dependency on the previous local archive. Local installation candidate; no npm publication.

## 0.1.12 — saved-node validation compatibility fix

- Validate absent Dynamic temperature fields with the existing runtime defaults, preserving older Entity/Label nodes without rewriting flows or requiring an editor save.
- Accept the default Entity target for nodes saved before Target selection; continue rejecting explicitly invalid configurations.
- Preserve HA error codes and identify failed light service calls with phase/domain/service diagnostics, without changing requests or adding retries.
- Add regression tests for legacy editor configurations and distinct entity/connection/service failures. Verify against published HA WebSocket 0.80.3 and 0.81.0.
- Local candidate only; no npm publication, deployment, commit, tag or GitHub release.

## 0.1.11 — HA WebSocket compatibility fix

- Relax the HA WebSocket peer dependency to >=0.80.3 <0.82.0, retaining 0.80.3 support and allowing 0.81.x without ERESOLVE.
- Update the adapter version guard consistently; the shared-client APIs were checked against published 0.80.3 and 0.81.0 packages.
- Add peer/version-guard regression coverage and reuse provider integration tests for both versions, awaiting asynchronous provider cleanup. HA WebSocket 0.81.x requires Node.js >=20.
- No npm publication, deployment, commit, tag or GitHub release.

## 0.1.10 — local dynamic solar color-temperature candidate

- Add opt-in Dynamic (sun-based) CT with HA location, a deterministic 2000–5500 K daylight curve and direct pinned SunCalc dependency.
- Send Kelvin with brightness once on OFF → ON; preserve explicit message color and already-on brightness CT. Clamp each selected lamp to its physical range; non-CT lamps retain normal ON.
- Read HA location through public `get_config` on the shared contrib adapter; bound stalled requests to 2 seconds and omit precise location from output/diagnostics.
- Recheck observed state/override after lookup, including failed retrieval; preserve manual override and brightness policy.
- Keep default/saved color modes unchanged. Move legacy Adaptive Lighting UI into compatibility settings; retain legacy runtime and bypass it in Dynamic.
- Add fixed-time solar/runtime/adapter/editor tests and a reproducible upstream comparison: 384 samples, maximum difference 70 K in normal night mode.
- No npm publication, HA deployment, commit or tag. Physical lamp/editor interaction verification remains pending.

## 0.1.9 — Label target development candidate

- Adds Entity/Label targets, stable Label ID autocomplete, and structured `msg.target` overrides; old Entity flows keep their default behavior.
- Resolves direct entity/device labels and HA's labeled-area relationships, filters non-light/hidden/disabled entries and deduplicates members. Area is not exposed as a target.
- Extracts the existing light-control path into one controller per entity, preserving independent override, capability filtering, automatic limits and Adaptive Lighting.
- Adds cached membership, registry/reconnect invalidation, idle refresh and reconciled state observation; close/redeploy cleans node-owned resources.
- Adds aggregate Label results/status, per-entity partial failures and empty/deleted target events.
- Documents the APIs, refresh/lifecycle contract and exact physical multi-light verification sequence in `docs/labels.md`.
- Local check and full tests include the published HA contrib 0.80.3 integration. Real HA/physical-device verification is pending. No npm publication or HA installation.

## 0.1.8 — 2026-09-30

- Simplify Adaptive Lighting to an On/Off checkbox with collapsed advanced profile selection.
- Use the supported color-only `adaptive_lighting.apply` action with a fresh provider calculation, only after automatic OFF → ON on CT-capable lights. SW Light retains brightness, maximum, override protection and transitions.
- Explicit message colors and manual commands suppress adaptation; already-on brightness changes do not reapply it. Add `msg.adaptive_lighting` opt-in/out.
- Discover only unique exact `configuration.lights` matches. Missing, ambiguous, unavailable, running and RGB sleep profiles fall back with structured warnings. Non-CT lights retain normal ON.
- Require the HA profile main switch off for one-shot ownership. Preserve inactive legacy nodes; migrate former optional-apply opt-in.
- Document inspected upstream API/source, two-action timing limitations and the exact live verification sequence.
- Full syntax/editor/example check and 42 tests passed, including all 3 isolated published-provider integration tests. No live HA/device verification or publication.

## 0.1.7 — local default threshold adjustment

- Sets the runtime/editor default manual override threshold to 98% (HA brightness 250 or above), retaining the 94% automatic maximum.
- Updates example flows and documentation. Existing saved thresholds remain unchanged.
- Verifies the new default boundary and release below threshold; preserves explicit 100% threshold coverage.
- No npm publication.

## 0.1.6 — local HA state normalization fix

- Omits null/non-array observed HA color attributes instead of spreading them, preventing `a[k] is not iterable` during observation and commands.
- Keeps valid color arrays as independent copies; retains brightness and manual override behavior.
- Adds null/non-array normalization coverage and exercises all three override regressions with null HA color attributes.
- Full checks and isolated Node-RED/HA contrib integration: 33 tests passed. No npm publication; physical-device verification pending.

## 0.1.5 — local override fix candidate

- Starts per-light HA observation after flow startup, before the first input.
- Retries temporary provider initialization failures without freezing the node; preserves the shared-client/readiness adapter.
- Fixes idle OFF nodes missing external brightness changes: observed 255 activates override, observed 204 releases the default threshold, and explicit manual OFF bypasses the guard.
- Adds real-adapter regressions for automatic 94% → external 100% → suppressed OFF, external 80% release, manual OFF, and entity isolation.
- Full suite including isolated Node-RED/HA contrib 0.80.3 integration: 32 tests passed. Physical-device verification of this candidate is pending. No npm publication.

## 0.1.4 — scoped distribution candidate

- Changes npm identity to `@johanwistbacka/node-red-contrib-sw-light`.
- Keeps Node-RED type `sw-light`, display name SW Light and all runtime/editor behavior unchanged.
- Retains version 0.1.4 for the first publication under the new npm name.
- Documents replacing the unscoped package without installing both packages together.

The scoped candidate is not published yet. The unscoped 0.1.4 was already
published; the runtime verification notes below describe that implementation.


Runtime verification work carried forward from the unscoped 0.1.4.

- Identifies the reported constructor stack as the original 0.1.0 implementation.
- Verifies the existing lazy provider accessor fix on Node-RED 5.0.7 with HA contrib 0.80.3.
- Extends real-registry regression coverage to close while HA is unready.
- Documents explicit rejection/no replay of commands before readiness.

Runtime/editor behavior is unchanged from 0.1.3. The real host must verify
which source/version is executing; no new speculative API fix is claimed.

## 0.1.3

Normal SemVer development candidate for npm `latest`, prepared but not yet published.

- Promotes the unchanged beta runtime/editor to a normal development version.
- Updates publication tag and installation/version documentation.
- Keeps the explicit 11-file public package allowlist.

The release remains experimental. Community Catalogue listing requires a
separate Flow Library submission/refresh after npm publication.

## 0.1.3-beta.1

First public npm beta release.

- Controls one Home Assistant light directly: On, Off, Toggle and From msg.
- Applies automatic brightness limits, transitions and manual override protection.
- Supports optional Adaptive Lighting color-only apply.
- Retains lazy HA client resolution, reconnect handling and temporary structural diagnostics from 0.1.2.
- Adds beta publication metadata and an explicit public file allowlist.

Requires HA contrib exactly 0.80.3. Real Home Assistant runtime verification
with a confirmed installed version remains pending. No runtime behavior was
changed while preparing this beta candidate.
