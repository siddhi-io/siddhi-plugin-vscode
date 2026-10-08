/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import { COMPOSE_FILE } from "./paths";
import { run, runOrThrow } from "./exec";
import { Service } from "./scenario";

export interface Services {
    prefix: string;
}

export const MYSQL_USER = "sitest";
export const MYSQL_PASSWORD = "sitest123";
export const MYSQL_DATABASE = "si_test_db";

export const POSTGRES_USER = "sitest";
export const POSTGRES_PASSWORD = "sitest123";
export const POSTGRES_DATABASE = "si_test_db";

const COMPOSE_PROJECT = "si-e2e";

export function containerName(services: Services, service: Service): string {
    return `${services.prefix}-${service}`;
}

export function requiredServices(scenarios: Array<{ requires: Service[] }>, extra: Service[] = []): Service[] {
    const wanted = new Set<Service>(extra);
    for (const scenario of scenarios) {
        scenario.requires.forEach((service) => wanted.add(service));
    }
    return Array.from(wanted).sort();
}

export function isRunning(services: Services, service: Service): boolean {
    const result = run("docker", ["inspect", "-f", "{{.State.Running}}", containerName(services, service)]);
    return result.status === 0 && result.stdout.trim() === "true";
}

const composeEnv = (services: Services): NodeJS.ProcessEnv => ({ ...process.env, E2E_PREFIX: services.prefix });

export function composeUp(services: Services, wanted: Service[]): void {
    runOrThrow(
        "docker",
        ["compose", "-f", COMPOSE_FILE, "-p", COMPOSE_PROJECT, "up", "-d", "--wait", "--wait-timeout", "300", ...wanted],
        { env: composeEnv(services), timeoutMs: 10 * 60 * 1000 }
    );
}

export function composeDown(services: Services): void {
    run("docker", ["compose", "-f", COMPOSE_FILE, "-p", COMPOSE_PROJECT, "down", "-v"], {
        env: composeEnv(services),
        timeoutMs: 5 * 60 * 1000,
    });
}

export function mysqlQuery(services: Services, statement: string): string {
    return runOrThrow(
        "docker",
        [
            "exec",
            containerName(services, "mysql"),
            "mysql",
            `-u${MYSQL_USER}`,
            `-p${MYSQL_PASSWORD}`,
            MYSQL_DATABASE,
            "-N",
            "-B",
            "-e",
            statement,
        ],
        { timeoutMs: 60000 }
    ).stdout.trim();
}

export function postgresQuery(services: Services, statement: string): string {
    return runOrThrow(
        "docker",
        [
            "exec",
            "-e",
            `PGPASSWORD=${POSTGRES_PASSWORD}`,
            containerName(services, "postgres"),
            "psql",
            "-U",
            POSTGRES_USER,
            "-d",
            POSTGRES_DATABASE,
            "-t",
            "-A",
            "-c",
            statement,
        ],
        { timeoutMs: 60000 }
    ).stdout.trim();
}

export function mysqlConnectionCount(services: Services): number {
    return Number(
        mysqlQuery(services, `SELECT COUNT(*) FROM information_schema.processlist WHERE user='${MYSQL_USER}'`)
    );
}

export function kafkaExec(services: Services, args: string[], input?: string): string {
    const docker = ["exec"];
    if (input !== undefined) {
        docker.push("-i");
    }
    return runOrThrow("docker", [...docker, containerName(services, "kafka"), ...args], {
        input,
        timeoutMs: 120000,
    }).stdout;
}
