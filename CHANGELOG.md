# Changelog

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
