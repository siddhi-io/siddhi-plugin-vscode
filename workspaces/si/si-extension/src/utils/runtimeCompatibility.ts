export type CompatibilityStatus = "valid" | "valid-with-warning" | "not-valid";

export interface JavaCompatibilityProfile {
    minimumJavaVersion: number;
    recommendedJavaVersion: number;
    testedJavaVersion: number;
}

export type RuntimeCompatibilityProfiles = Record<string, JavaCompatibilityProfile>;

export interface CompatibilityResult {
    status: CompatibilityStatus;
    message?: string;
}

function getNumericVersion(version: string): string | undefined {
    return version.match(/\d+(?:\.\d+)*/)?.[0];
}

function findProfile(
    siVersion: string,
    profiles: RuntimeCompatibilityProfiles,
): JavaCompatibilityProfile | undefined {
    const numericVersion = getNumericVersion(siVersion);
    return profiles[siVersion] ?? (numericVersion ? profiles[numericVersion] : undefined);
}

export function compareVersions(v1: string, v2: string): number {
    const parts1 = (getNumericVersion(v1) ?? "0").split(".").map((part) => parseInt(part, 10));
    const parts2 = (getNumericVersion(v2) ?? "0").split(".").map((part) => parseInt(part, 10));
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const diff = (parts1[i] ?? 0) - (parts2[i] ?? 0);
        if (diff !== 0) {
            return diff > 0 ? 1 : -1;
        }
    }
    return 0;
}

export function getRuntimeCompatibility(
    siVersion: string,
    profiles: RuntimeCompatibilityProfiles,
): CompatibilityResult {
    if (findProfile(siVersion, profiles)) {
        return { status: "valid" };
    }

    return {
        status: "valid-with-warning",
        message: `WSO2 Integrator: SI ${siVersion} was detected. Compatibility is not guaranteed.`,
    };
}

export function evaluateJavaCompatibility(
    siVersion: string,
    javaVersion: number,
    profiles: RuntimeCompatibilityProfiles,
): CompatibilityResult {
    const profile = findProfile(siVersion, profiles);
    if (!profile) {
        return getRuntimeCompatibility(siVersion, profiles);
    }

    if (javaVersion < profile.minimumJavaVersion) {
        return {
            status: "not-valid",
            message: `WSO2 Integrator: SI ${siVersion} requires Java ${profile.minimumJavaVersion} or later.`,
        };
    }

    if (javaVersion > profile.testedJavaVersion) {
        return {
            status: "valid-with-warning",
            message: `Java ${javaVersion} has not been tested with WSO2 Integrator: SI ${siVersion}. Continue at your own discretion.`,
        };
    }

    return { status: "valid" };
}

export function getJavaMajorVersion(version: string | undefined | null): number | undefined {
    if (!version) {
        return undefined;
    }

    const match = version.match(/(\d+)(?:\.\d+)*/);
    if (!match) {
        return undefined;
    }

    const majorVersion = Number.parseInt(match[1], 10);
    return Number.isNaN(majorVersion) ? undefined : majorVersion;
}
