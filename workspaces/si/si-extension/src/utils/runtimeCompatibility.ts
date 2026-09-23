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

export function getRuntimeCompatibility(
    siVersion: string,
    profiles: RuntimeCompatibilityProfiles,
): CompatibilityResult {
    if (profiles[siVersion]) {
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
    const profile = profiles[siVersion];
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
