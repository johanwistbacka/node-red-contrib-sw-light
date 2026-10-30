# Independent release review — SW Light 0.1.30

Date: 2026-10-30. Reviewer: separate release_030_review agent.

Decision: **PASS** for the frozen candidate. No reportable security finding or release-blocking correctness defect was found in the reviewed change. This is a scoped independent release review, not a repository-wide security scan or certification. Publication remains a separate user action.

## Exact subject

- Package: `@johanwistbacka/node-red-contrib-sw-light@0.1.30`.
- Candidate archive: `johanwistbacka-node-red-contrib-sw-light-0.1.30.tgz`.
- Candidate SHA-256: `8fbe924b229c0cae08c978c86aefd27d5d91f193cbe69d885fcb4b99dada38a9`.
- Published npm 0.1.29 baseline SHA-256: `625132909ca1b7fb7ecab5a37022c6dc81b555442d323863ce050a2ee88a0976`.
- Reviewed immutable `candidate.diff` SHA-256: `dc902871cf4182971336fa090801b1ee120579988e658dfc921717beaaebeded`.
- The Git HEAD was deliberately not used as a baseline because it predates several published releases.

The reviewer independently verified the archive checksum and all 20 delivered file names, sizes and hashes against `candidate-identity.json`. All archive entries are ordinary files under `package/`; no paths escape that prefix. The archive contains no test harness, node_modules, credentials, or symlink entries. Comparison of both actual tarballs identifies exactly six changed paths and no deleted shipped files: `lib/status.js`, `nodes/sw-light.js`, `nodes/sw-light.html`, `package.json`, `README.md`, and `CHANGELOG.md`.

## Source and boundary review

All six changed paths were reviewed. The new reporter keeps bounded per-node presentation state, uses local Date getters, copies the passed status object, and preserves the timestamp when raw text/fill/shape are identical. Clearing the status resets its history. Every actual node status route, including controller callbacks, aggregate statuses, startup/configuration errors, target resolution errors, and disconnection errors, passes through the reporter. Existing close checks remain in place.

The change introduces no external input parser, filesystem operation, request, credential use, persistent storage, timer, retry or new dependency. Home Assistant service calls, manual override decisions, output messages and ISO event timestamps are byte-identical to the published baseline outside the node's status call routing. Status text is still passed through the same Node-RED status API. The reporter never modifies incoming messages or the original status object.

The strongest plausible regressions were refreshed timestamps on identical observations, shared timestamps across nodes, omitted error/aggregate routes, and a missing packaged helper. Source inspection, the archive manifest and dedicated assertions address these. The status timestamp denotes changes in text or icon rather than physical lamp confirmation; the local timezone and restart/deploy reset semantics are documented accurately.

## Regression evidence

The reviewer inspected dedicated status tests plus Entity and aggregate runtime assertions. Coverage includes zero-padded local date/time, date rollover with identical status, text changes, fill and shape changes, independent node instances, clearing/restarting state, unchanged observations with different HA metadata, aggregate updates, repeated inputs, and disconnection/error status.

Final logs independently checked:

| Subject | Official HA-contrib | Result |
| --- | --- | --- |
| Working source | 0.80.3 | 145 passed, 0 failed, 0 skipped |
| Working source | 0.81.0 | 145 passed, 0 failed, 0 skipped |
| Extracted frozen artifact with separate harness | 0.80.3 | 145 passed, 0 failed, 0 skipped |
| Extracted frozen artifact with separate harness | 0.81.0 | 145 passed, 0 failed, 0 skipped |

These checks use Node.js 26.10.0, Node-RED 5.0.7 and fresh isolated installations. They exercise actual published provider classes with fake transports; they are not live Home Assistant or lamp verification.

One existing test fixture initially failed after its fresh transitive `home-assistant-js-websocket` dependency resolved to 9.8.1. The fixture sets `closeRequested=true` only to suppress automatic reconnect, then manually attaches a replacement socket. It previously left that flag true, which makes the current SDK reject resubscription because `_isUsable` requires `!closeRequested`. The reviewer independently traced this condition through the SDK source. Resetting the flag immediately before the fixture's manual reconnect correctly models an open connection. The fixture still reproduces the original unpatched registry crash, checks the repair, confirms resubscription, and checks a later update. This correction is test-only; it is not present in the shipped archive. The same corrected fixture passes all four repair tests against the old published 0.1.29 package, supporting classification as a harness issue rather than a 0.1.30 regression.

`package-audit.json` reports zero vulnerabilities for the package's locked dependency tree; this does not assess the complete peer installation. Pre-candidate syntax/editor/example checks and `git diff --check` were reported passing by the implementer.

## Risk and recovery

Regression likelihood is low for this bounded presentation-only diff. A defect could affect displayed status or Status-node consumers, which intentionally receive the longer text; light-control behavior and privileges are unchanged. There are no persistent-state or configuration migrations. Reinstalling the previously published 0.1.29 package and restarting Node-RED provides rollback.

No blocking unknown remains for this scoped release preparation. Live editor layout across user flows and actual HA/lamp operation were not reviewed, and the result does not claim broader assurance over unchanged historical code or third-party peers.

The implementer additionally reports `npm whoami` returning E401. This is an operational authentication prerequisite for a later publication, not a defect in the reviewed candidate and not an authorization to log in or publish. Renewing npm authentication and the user's explicit publication instruction are still required before publishing the exact reviewed archive.
