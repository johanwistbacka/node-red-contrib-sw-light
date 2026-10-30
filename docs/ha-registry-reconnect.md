# HA registry reconnect repair

SW Light includes an **opt-in** repair tool for the verified HA contrib 0.80.3
and 0.81.0 registry failure. Installing SW Light alone does not modify HA
contrib. There is no postinstall hook or automatic dependency mutation.

## When this repair applies

Those provider versions contain five registry event refresh handlers without
rejection handling. A disconnect with a refresh pending can terminate Node-RED
with an unhandled Promise rejection. The repair retains the last valid registry
state; the existing collection refresh reloads it on reconnect. A refresh error
while still connected emits a generic warning without exposing error contents.
Light commands, authentication and command queues are unchanged.

The tool checks the provider version and exact original source SHA-256 before
writing. It supports only 0.80.3 and 0.81.0 with this verified source:

`120e0cacf500e8bd80409325773013ea277f8df583ed5547724af06b7de534c5`

The repaired file has SHA-256:

`a0da8eccaf05e2a5ff62460121e2df6b549a3d3bcddeb8f34f64c61a0583be2d`

Other versions or altered files are refused. This is not a global Promise
rejection handler; it repairs this reproduced registry failure path only.

## Check, apply and restore

Run in the **Node-RED user directory** that contains the active installation,
not a different checkout. For a standard local installation this is
`~/.node-red`; add-on/container users must use their active user directory.

First install the SW Light package through your usual package installation
mechanism, then check the active provider without changing it:

```sh
cd ~/.node-red
./node_modules/.bin/sw-light-ha-registry check .
```

The JSON result identifies the resolved file, provider version and checksum.
`status: "repair-required"` means the recognized original is still installed;
`status: "applied"` means the exact repair is present. Both are successful
read-only checks (exit 0); unknown artifacts and invalid arguments exit 1.
`sw-light-ha-registry --help` prints command syntax. If local executable links
are unavailable, use `node node_modules/@johanwistbacka/node-red-contrib-sw-light/scripts/patch-ha-registry-reconnect.js`
with the same arguments.

**Stop the intended Node-RED instance** using its normal service/add-on controls
before applying or restoring. The tool does not stop services itself. Choose a
fresh backup name and keep it outside node_modules:

```sh
mkdir -p sw-light-backups
./node_modules/.bin/sw-light-ha-registry apply . ./sw-light-backups/registry-2026-10-06-01
./node_modules/.bin/sw-light-ha-registry check .
```

The installer saves the original file and a hash manifest before atomic
replacement. It creates the fresh backup directory with private permissions.
Applying the exact repair again returns `changed: false`. Start Node-RED again
after checking `status: "applied"`, so the repaired module is loaded. If it
fails to start, stop it and restore with the same backup directory:

```sh
./node_modules/.bin/sw-light-ha-registry restore . ./sw-light-backups/registry-2026-10-06-01
./node_modules/.bin/sw-light-ha-registry check .
```

Restoration validates backup identity and refuses to overwrite unrelated edits.
It returns `changed: false` if that original is already restored. Start Node-RED
after restoration. Save the backup with your deployment records; an npm update
can replace the patched provider file and the tool cannot restore without the
matching original backup.

## Updates and support boundary

Installing/updating HA contrib or recreating a container can replace this
repair. Check again after such changes. Reapply only if the tool recognizes the
newly installed artifact; review an unknown artifact separately instead of
bypassing the guard. Provider version metadata is deliberately unchanged.
Keep SW Light and provider compatibility requirements from the README.

For deployment, perform a real HA restart with Node-RED left running: an input
during the outage should report HA NOT READY, should not replay on reconnect,
and a new input after state loading should work. Check external brightness
changes and manual override after recovery. Service/state readback does not
prove perceived physical color.

## Verification

Regression tests run the real published provider registry code and WebSocket
Connection in strict-rejection child processes. They reproduce the original
failure for all five registries, then verify retained state, reconnect refresh,
subsequent updates, sanitized warnings, guarded backup/restore, idempotence and
the public CLI. Optional integration tests are enabled in the source checkout
with `SW_LIGHT_HA_USER_DIR` pointing to an isolated provider installation.

A real HA restart on 2026-10-06 passed with the patched 0.80.3 provider: the
same Node-RED process survived two disconnects, no replay was observed, new ON
commands worked and external manual override activated, protected one lamp and
released below the threshold. No Node-RED restart or deploy was needed for
recovery. Automated coverage also exercises the 0.81.0 provider; its real HA
restart was not tested. An unpatched standard installation has not passed this
same recovery test. The public repair workflow is supplied as the explicit
installation step for the verified affected versions until a suitable upstream
fix is verified.
