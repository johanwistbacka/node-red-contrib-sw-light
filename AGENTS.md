# Local installation builds

- Use unique normal development versions on npm latest, starting with 0.1.3,
  for Node-RED compatibility. Increment patch for each next installation candidate.
  Separate prerelease builds may increment a beta counter and publish under beta.
  Update README/archive references and use npm's version mechanism without tags.
- Do not rebuild an installation candidate under an already-used version.
- Run `npm run check` and `npm test`; enable the optional published integration
  tests when the isolated HA contrib installation is available.
- Do not create a Git tag, GitHub release or npm publication unless the user
  explicitly requests it. Local test-build authorization does not authorize
  publication or live deployment.
