# signum-smartc-scd

A full fledge web based IDE for Signum SmartC Development

> [!WARNING]
> **Alpha / experimental.** The Studio is under active development. Expect rough edges,
> missing features and breaking changes — including to the locally stored project data.
> Export your projects (zip) regularly and use testnet when deploying.

## Releasing

Releases are cut from `development` with `bun run release`:

1. Add the release notes to `CHANGELOG.md` under `## <version> — YYYY-MM-DD`.
2. `bun run release <version>` checks the branch, the tag and the changelog, bumps
   `apps/studio/package.json` and `bun.lock`, runs the tests and the build, then
   commits `chore(release): <version>` and tags `v<version>`. Nothing is pushed.
3. `bun run release <version> --publish` does the same and then pushes
   `development` and the tag, and fast-forwards `main` — which deploys production.
