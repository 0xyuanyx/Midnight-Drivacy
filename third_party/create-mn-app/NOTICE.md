The local developer wallet/provider setup in `packages/midnight/probe/local-probe.ts`
and `infra/midnight/local-probe.yml` are adapted from midnightntwrk/create-mn-app,
commit `bdc86733d2a9d2e381cb050aec4fdde7b33559b4` (hello-world template).

Source: https://github.com/midnightntwrk/create-mn-app

The upstream Apache License 2.0 is preserved in this directory. Drivacy changes
include the state-transition probe, evidence assertions, isolated harness, and
loopback-only Docker port bindings and disabled verbose proof request logging. Upstream comments are retained in the
Compose file to explain the pinned local development configuration.
