# Integrator E2E harness

Runs Siddhi apps and the language server from a built VSIX against an SI pack, the way the WSO2 Integrator launches them, and reports class-loading errors, failed assertions and known issues. It is for checking a pack and a VSIX before a release. It does not gate pull requests.

## Requirements

macOS or Linux; Node 22; a JDK (25 for CI); `unzip`, `curl`; Docker with the compose plugin (unless you use `--skip-infra`); `lsof` (optional; adds the open-jar list to the report).

## Run it locally

```bash
cd workspaces/si/si-extension
pnpm run test:integrator-e2e -- \
  --pack <zip-url|zip-path> \
  --vsix <path-to>.vsix \
  --java-home "$JAVA_HOME"
```

The pack must be a `.zip`; it is extracted into a new directory on every run. Results go to `e2e-results/` (`report.md`, `report.json`, `logs/`).

| Option | Meaning |
|---|---|
| `--ls-dir <dir>` | Test these language server jars instead of the VSIX's (for example an unreleased build). |
| `--only a,b` | Run only these scenario ids. |
| `--skip-infra` | Do not start Docker services; use the ones already running. |
| `--container-prefix <p>` | Container name prefix (`si-e2e` by default). Use `si-test` for the older local stack. |
| `--skip-ls` | Skip the language server checks. |
| `--dry-run` | Validate scenarios and print the plan. |
| `--keep-infra`, `--keep-work` | Leave services or the work directory in place. |

If other services already use ports 9092, 3307 or 5433, either stop them or pass `--skip-infra --container-prefix <prefix>` to use them.

## What a run does

1. Extracts the pack fresh and takes the language server jars from the VSIX (or `--ls-dir`).
2. Prepares the pack the way the IDE does: runs `install-jars`, installs each scenario's extensions through the language server's `extensionInstaller/*` requests, then runs `install-jars` again. The files this changes are listed in the report.
3. Starts the language server, opens every scenario app, and checks there are no diagnostics, that repeated edits do not grow MySQL connections, and that it exits 0.
4. Runs each scenario: starts its apps through the runner, executes its steps, stops the apps, and scans the runner logs for class-loading and linkage errors and unexpected ERROR/WARN lines.

Each extension is installed independently. If the installer cannot install one (for example it answers `manuallyInstall` because its dependency jars are not downloadable), the remaining extensions are still installed, the problem is listed in the report under "Extension installation problems", and the scenarios that need that extension are skipped. The run then exits non-zero, because an extension the IDE cannot install is a pack or IDE problem. A failing `install-jars` still aborts the run.

A scenario whose services or ports are unavailable is reported as skipped, never passed. A run in which no scenario passed exits non-zero.

## Scenarios

Each scenario is a directory `scenarios/<area>/<id>/` with one or more `.siddhi` apps and a `scenario.json`:

```json
{
  "description": "what is verified",
  "requires": ["kafka"],
  "extensions": ["kafka"],
  "ports": [8201],
  "apps": ["app.siddhi"],
  "allow": ["regex of a benign log line"],
  "setup": [],
  "steps": []
}
```

`requires` may list `kafka`, `mysql` and `postgres`. The `sql` and `expect-sql` steps take an optional `"service"` (`"mysql"` by default, or `"postgres"`); a step that names a service needs it in `requires`.

Step types: `wait`, `http-post`, `kafka-create-topic`, `kafka-produce`, `sql`, `expect-log`, `expect-no-log`, `expect-kafka-topic`, `expect-sql`. `{{runId}}` in any string is replaced by a per-run id, so events and rows from earlier runs never match. Use names that describe the behaviour, not numbers.

## Known issues

`known-issues.json` lists checks that fail until a fix ships. A matching failure is reported as a known issue and does not fail the run; when the check starts passing, the report says the entry can be removed.

## In CI

The workflow `Integrator E2E` (`.github/workflows/integrator-e2e.yml`) runs the same command. Trigger it manually with the pack URL. An opt-in release gate is planned as a separate change.

## Development

`pnpm run test:e2e-unit` builds the harness and runs its unit tests. `drift.test.js` compares the harness's launch flags with `src/debugger/debugHelper.ts` and `src/server/server.ts`; if it fails, update `e2e/src/launch.ts` to match the extension.
