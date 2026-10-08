/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { applyKnownIssues, loadKnownIssues } from "./knownIssues";
import { javaMajorVersion, lsLaunch } from "./launch";
import { LS_FIXTURES_ROOT, KNOWN_ISSUES_FILE, PACKAGE_ROOT, SCENARIOS_ROOT } from "./paths";
import { runLsCheck } from "./lsCheck";
import { composeDown, composeUp, isRunning, mysqlConnectionCount, requiredServices } from "./infra";
import { extractPack, isUrl, resolveZip } from "./pack";
import { prepareExtensions } from "./prepare";
import { RunSummary, overallExitCode, renderMarkdown } from "./report";
import { CheckResult, ScenarioResult } from "./results";
import { extensionSkipReason, runScenario } from "./runScenario";
import { SERVICE_NAMES, Service, loadScenarios } from "./scenario";
import { describeError, isPortInUse, registerCleanup, run, runCleanups } from "./exec";
import { LsJars, extractLsJars, findLsJars, readVsixVersion } from "./vsix";

export interface CliOptions {
    pack?: string;
    vsix?: string;
    lsDir?: string;
    javaHome?: string;
    only: string[];
    containerPrefix: string;
    out: string;
    workDir?: string;
    skipInfra: boolean;
    skipLs: boolean;
    skipIde: boolean;
    keepInfra: boolean;
    keepWork: boolean;
    dryRun: boolean;
    help: boolean;
}

const VALUE_FLAGS: Record<string, (options: CliOptions, value: string) => void> = {
    "--pack": (options, value) => (options.pack = value),
    "--vsix": (options, value) => (options.vsix = value),
    "--ls-dir": (options, value) => (options.lsDir = value),
    "--java-home": (options, value) => (options.javaHome = value),
    "--only": (options, value) => (options.only = value.split(",").filter((id) => id !== "")),
    "--container-prefix": (options, value) => (options.containerPrefix = value),
    "--out": (options, value) => (options.out = value),
    "--work-dir": (options, value) => (options.workDir = value),
};

const BOOLEAN_FLAGS: Record<string, (options: CliOptions) => void> = {
    "--skip-infra": (options) => (options.skipInfra = true),
    "--skip-ls": (options) => (options.skipLs = true),
    "--skip-ide": (options) => (options.skipIde = true),
    "--keep-infra": (options) => (options.keepInfra = true),
    "--keep-work": (options) => (options.keepWork = true),
    "--dry-run": (options) => (options.dryRun = true),
    "--help": (options) => (options.help = true),
};

export const USAGE = `Usage: pnpm run test:integrator-e2e -- --pack <zip-url|zip-path> [options]

  --pack <zip-url|zip-path>   SI pack zip (required)
  --vsix <path>               extension VSIX (default: the only streaming-integrator-*.vsix in the package root)
  --ls-dir <dir>              use these language server jars instead of the VSIX's
  --java-home <dir>           JDK to use (default: JAVA_HOME)
  --only <id,id>              run only these scenarios
  --container-prefix <p>      container name prefix for docker services (default: si-e2e)
  --out <dir>                 results directory (default: e2e-results)
  --work-dir <dir>            root for the downloaded zip and the extraction; must not exist, and is removed on success (default: a new temp directory)
  --skip-infra                do not start docker services; use the ones already running
  --skip-ls                   skip the language server checks
  --skip-ide                  skip the IDE smoke test (not implemented yet; always skipped)
  --keep-infra                leave docker services running
  --keep-work                 keep the work directory
  --dry-run                   validate scenarios and print the plan, run nothing
  --help                      show this text
`;

export function makeRunId(date: Date): string {
    return `r${date.toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv): CliOptions {
    const options: CliOptions = {
        only: [],
        containerPrefix: "si-e2e",
        out: "e2e-results",
        javaHome: env.JAVA_HOME,
        skipInfra: false,
        skipLs: false,
        skipIde: false,
        keepInfra: false,
        keepWork: false,
        dryRun: false,
        help: false,
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--") {
            continue;
        }
        if (arg in VALUE_FLAGS) {
            const value = argv[index + 1];
            if (value === undefined || value.startsWith("--")) {
                throw new Error(`${arg} requires a value`);
            }
            VALUE_FLAGS[arg](options, value);
            index++;
        } else if (arg in BOOLEAN_FLAGS) {
            BOOLEAN_FLAGS[arg](options);
        } else {
            throw new Error(`Unknown option ${arg}\n\n${USAGE}`);
        }
    }
    if (!options.pack && !options.dryRun && !options.help) {
        throw new Error(`--pack is required\n\n${USAGE}`);
    }
    return options;
}

const log = (message: string): void => console.log(`[e2e ${new Date().toISOString().slice(11, 19)}] ${message}`);

function requireTool(name: string, args: string[]): void {
    if (run(name, args).status !== 0) {
        throw new Error(`Required tool '${name}' was not found on the PATH`);
    }
}

function resolveVsix(options: CliOptions): string | undefined {
    if (options.vsix) {
        return path.resolve(options.vsix);
    }
    const candidates = fs.readdirSync(PACKAGE_ROOT).filter((name) => /^streaming-integrator-.*\.vsix$/.test(name));
    return candidates.length === 1 ? path.join(PACKAGE_ROOT, candidates[0]) : undefined;
}

async function dryRun(options: CliOptions): Promise<number> {
    const scenarios = loadScenarios(SCENARIOS_ROOT, options.only);
    const services = requiredServices(scenarios, ["mysql"]);
    const extensions = Array.from(new Set(scenarios.flatMap((scenario) => scenario.extensions))).sort();
    log(`${scenarios.length} scenario(s) valid`);
    for (const scenario of scenarios) {
        const busy: number[] = [];
        for (const port of scenario.ports) {
            if (await isPortInUse(port)) {
                busy.push(port);
            }
        }
        log(
            `  ${scenario.area}/${scenario.id}: ports [${scenario.ports.join(", ")}]${busy.length > 0 ? ` (BUSY: ${busy.join(", ")})` : ""}, services [${scenario.requires.join(", ")}], extensions [${scenario.extensions.join(", ")}]`
        );
    }
    log(`services needed: ${services.join(", ") || "none"}`);
    log(`extensions to install: ${extensions.join(", ") || "none"}`);
    return 0;
}

export async function main(argv: string[]): Promise<number> {
    const options = parseArgs(argv, process.env);
    if (options.help) {
        console.log(USAGE);
        return 0;
    }
    if (process.platform === "win32") {
        throw new Error("The Integrator E2E harness supports macOS and Linux only");
    }
    if (options.dryRun) {
        return dryRun(options);
    }

    const startedAt = new Date();
    const started = Date.now();
    requireTool("unzip", ["-v"]);
    requireTool("curl", ["--version"]);
    if (!options.javaHome || !fs.existsSync(path.join(options.javaHome, "bin", "java"))) {
        throw new Error("A JDK is required: pass --java-home or set JAVA_HOME");
    }
    const javaHome = options.javaHome;
    const javaMajor = javaMajorVersion(path.join(javaHome, "bin", "java"));
    const vsixPath = resolveVsix(options);
    if (!options.lsDir && !vsixPath) {
        throw new Error("Pass --vsix <path> (or --ls-dir) so the language server jars can be found");
    }

    const scenarios = loadScenarios(SCENARIOS_ROOT, options.only);
    const wanted = requiredServices(scenarios, options.skipLs ? [] : ["mysql"]);
    const services = { prefix: options.containerPrefix };
    const out = path.resolve(options.out);
    const logDir = path.join(out, "logs");
    fs.mkdirSync(logDir, { recursive: true });

    const root = options.workDir ? path.resolve(options.workDir) : fs.mkdtempSync(path.join(os.tmpdir(), "si-e2e-"));
    if (options.workDir && fs.existsSync(root)) {
        throw new Error(`Work directory ${root} already exists; a previous one is never reused`);
    }
    fs.mkdirSync(root, { recursive: true });
    const workDir = path.join(root, "work");
    let startedInfra = false;

    let exitCode = 1;
    try {
        log(`resolving the pack: ${options.pack}`);
        const zip = resolveZip(options.pack as string, path.join(root, "download"));
        const { home, zipSha256 } = extractPack(zip, workDir);
        log(`pack extracted to ${home}`);

        const ls: LsJars = options.lsDir ? findLsJars(path.resolve(options.lsDir)) : extractLsJars(vsixPath as string, workDir);
        const vsixVersion = vsixPath ? readVsixVersion(vsixPath) : "n/a (--ls-dir)";

        if (wanted.length > 0 && !options.skipInfra) {
            requireTool("docker", ["compose", "version"]);
            log(`starting services: ${wanted.join(", ")}`);
            composeUp(services, wanted);
            startedInfra = true;
            registerCleanup(async () => {
                if (!options.keepInfra) {
                    composeDown(services);
                }
            });
        }
        const availableServices: Service[] = SERVICE_NAMES.filter((service) => isRunning(services, service));
        log(`services running: ${availableServices.join(", ") || "none"}`);

        const extensions = Array.from(
            new Set([...scenarios.flatMap((scenario) => scenario.extensions), ...(options.skipLs ? [] : ["rdbms-mysql"])])
        ).sort();
        log(`preparing the pack (extensions: ${extensions.join(", ") || "none"})`);
        const { changes: installerChanges, failedExtensions } = await prepareExtensions({ javaHome, javaMajor, packHome: home, ls, extensions, logDir });

        const issues = loadKnownIssues(KNOWN_ISSUES_FILE);
        let lsChecks: CheckResult[] = [];
        if (!options.skipLs) {
            log("running the language server checks");
            lsChecks = applyKnownIssues(
                await runLsCheck({
                    launch: lsLaunch({ javaHome, javaMajor, packHome: home, ls }),
                    logPath: path.join(logDir, "language-server.log"),
                    apps: scenarios
                        .filter(
                            (scenario) =>
                                scenario.requires.every((service) => availableServices.includes(service)) &&
                                extensionSkipReason(scenario.extensions, failedExtensions) === undefined
                        )
                        .flatMap((scenario) =>
                            scenario.appPaths.map((appPath, index) => ({ name: `${scenario.id}/${scenario.apps[index]}`, path: appPath }))
                        ),
                    leakApp: { path: path.join(LS_FIXTURES_ROOT, "connection-leak.siddhi") },
                    connectionCount:
                        availableServices.includes("mysql") && !Object.hasOwn(failedExtensions, "rdbms-mysql")
                            ? () => mysqlConnectionCount(services)
                            : undefined,
                }),
                issues
            );
        }

        const runId = makeRunId(startedAt);
        const results: ScenarioResult[] = [];
        for (const scenario of scenarios) {
            log(`scenario ${scenario.area}/${scenario.id}`);
            const result = await runScenario(scenario, {
                java: { home: javaHome, major: javaMajor },
                packHome: home,
                ls,
                services,
                runId,
                logDir,
                availableServices,
                failedExtensions,
            });
            result.checks = applyKnownIssues(result.checks, issues);
            log(`  -> ${result.status}`);
            results.push(result);
        }

        const summary: RunSummary = {
            startedAt: startedAt.toISOString(),
            durationSeconds: Math.round((Date.now() - started) / 1000),
            packSource: options.pack as string,
            packSha256: zipSha256,
            vsixVersion,
            lsJarSha1: ls.sha1,
            javaHome,
            javaMajor,
            installerChanges,
            failedExtensions,
            ls: lsChecks,
            scenarios: results,
            ideRun: false,
        };
        fs.writeFileSync(path.join(out, "report.md"), renderMarkdown(summary));
        fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(summary, null, 2));
        log(`report written to ${path.join(out, "report.md")}`);
        exitCode = overallExitCode(summary);
        if (exitCode === 0 && !options.keepWork) {
            fs.rmSync(root, { recursive: true, force: true });
        } else {
            log(`work directory kept at ${root}`);
        }
    } finally {
        await runCleanups();
        if (startedInfra && options.keepInfra) {
            log("services left running (--keep-infra)");
        }
    }
    return exitCode;
}

if (require.main === module) {
    const onSignal = (): void => {
        runCleanups().finally(() => process.exit(130));
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    main(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (error) => {
            console.error(describeError(error));
            process.exit(2);
        }
    );
}
