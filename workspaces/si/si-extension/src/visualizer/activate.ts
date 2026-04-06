/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as vscode from "vscode";
import { StateMachine, openView } from "../stateMachine";
import { extension } from "../SIExtensionContext";
import { VS_CODE_COMMANDS, UI_COMMANDS, SIDDHI_HOME_CONFIG } from "../constants";
import { DiagramVisualizerWebview } from "./diagram-webview";
import { processMetaData, encodeToBase64, decodeFromBase64 } from "../utils/utils";
import { SimulatorVisualizerWebview } from "./simualtor-webview";
import { MACHINE_VIEW, EVENT_TYPE } from "@wso2/si-core";
import { ExportResponse } from "@wso2/si-core";
import * as path from "path";
import { ExtensionInstallerWebview } from "./extension-installer-webview";
import versionsConfig from "../config/versions.json";

let simulatorVisualizerWebview: SimulatorVisualizerWebview | undefined;
let diagramVisualizerWebview: DiagramVisualizerWebview | undefined;
let visualizerMetaData: any;
let latestPublishedDesign: string | undefined;
let isDesignRefreshInProgress = false;
let hasPendingDesignRefresh = false;
let pendingFocusTarget: GraphNodeFocusTarget | undefined;
let clearPendingFocusTimer: NodeJS.Timeout | undefined;

interface GraphNodeFocusTarget {
    id?: string;
    type?: string;
    name?: string;
}

interface ShowGraphicalViewArgs {
    fileUri?: vscode.Uri;
    focusTarget?: GraphNodeFocusTarget;
}

function isVisualizerTargetDocument(document: vscode.TextDocument): boolean {
    return (
        !!diagramVisualizerWebview &&
        !!extension.fileUri &&
        document.uri.toString() === extension.fileUri.toString()
    );
}

async function getVisualizerMetaData() {
    if (visualizerMetaData) {
        return visualizerMetaData;
    }
    const metaData = await StateMachine.context().langClient?.getMetaData();
    if (!metaData || !metaData.content) {
        vscode.window.showErrorMessage("Failed to retrieve metadata.");
        return undefined;
    }
    visualizerMetaData = processMetaData(metaData.content);
    return visualizerMetaData;
}

async function publishDesignForVisualizer(forceUpdate = false): Promise<void> {
    if (!diagramVisualizerWebview || !extension.fileUri) {
        return;
    }

    let document: vscode.TextDocument;
    const targetUri = extension.fileUri;

    const openDoc = vscode.workspace.textDocuments.find(
        (doc) => doc.uri.toString() === targetUri.toString()
    );
    if (openDoc) {
        document = openDoc;
    } else {
        document = await vscode.workspace.openTextDocument(targetUri);
    }

    const designModel = await StateMachine.context().langClient?.getDesignModel(encodeToBase64(document.getText()));
    if (!designModel || !designModel.content) {
        vscode.window.showErrorMessage("Failed to retrieve design model.");
        return;
    }

    const decoded = decodeFromBase64(designModel.content);
    if (!forceUpdate && latestPublishedDesign === decoded) {
        return;
    }

    const metaData = await getVisualizerMetaData();
    if (!metaData) {
        return;
    }

    latestPublishedDesign = decoded;
    diagramVisualizerWebview.publishMessageToWebview(UI_COMMANDS.SEND_DESIGN, {
        data: JSON.parse(decoded),
        metaData,
        focusTarget: pendingFocusTarget,
    });
}

async function triggerDesignRefresh(forceUpdate = false): Promise<void> {
    if (isDesignRefreshInProgress) {
        hasPendingDesignRefresh = true;
        return;
    }

    isDesignRefreshInProgress = true;
    try {
        do {
            hasPendingDesignRefresh = false;
            await publishDesignForVisualizer(forceUpdate);
            forceUpdate = false;
        } while (hasPendingDesignRefresh);
    } finally {
        isDesignRefreshInProgress = false;
    }
}

function resetVisualizerSyncState() {
    visualizerMetaData = undefined;
    latestPublishedDesign = undefined;
    isDesignRefreshInProgress = false;
    hasPendingDesignRefresh = false;
    if (clearPendingFocusTimer) {
        clearTimeout(clearPendingFocusTimer);
        clearPendingFocusTimer = undefined;
    }
}

export function activateVisualizer(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(SIDDHI_HOME_CONFIG)) {
                vscode.window
                    .showInformationMessage(
                        "The workspace setting has changed. A window reload is required for changes to take effect.",
                        "Reload Window"
                    )
                    .then((selectedAction) => {
                        if (selectedAction === "Reload Window") {
                            vscode.commands.executeCommand("workbench.action.reloadWindow");
                        }
                    });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(VS_CODE_COMMANDS.SHOW_SOURCE, async () => {
            diagramVisualizerWebview?.dispose();
            diagramVisualizerWebview = undefined;
            resetVisualizerSyncState();
            vscode.commands.executeCommand("setContext", "SI.isVisualizerActive", "false");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(VS_CODE_COMMANDS.EVENT_SIMULATE, async () => {
            simulatorVisualizerWebview = undefined;
            activateEventSimulator();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(VS_CODE_COMMANDS.SHOW_GRAPHICAL_VIEW, async (args?: ShowGraphicalViewArgs) => {
            const editor = vscode.window.activeTextEditor;
            const targetFileUri = args?.fileUri || editor?.document.uri;

            if (!targetFileUri) {
                return;
            }

            extension.fileUri = targetFileUri;
            pendingFocusTarget = args?.focusTarget;
            if (clearPendingFocusTimer) {
                clearTimeout(clearPendingFocusTimer);
                clearPendingFocusTimer = undefined;
            }
            if (pendingFocusTarget) {
                clearPendingFocusTimer = setTimeout(() => {
                    pendingFocusTarget = undefined;
                    clearPendingFocusTimer = undefined;
                }, 3000);
            }

            const existingPanel = diagramVisualizerWebview?.getWebview();
            if (existingPanel) {
                existingPanel.reveal(vscode.ViewColumn.One);
                await triggerDesignRefresh(true);
                return;
            }

            resetVisualizerSyncState();
            diagramVisualizerWebview = new DiagramVisualizerWebview();
            let panel = diagramVisualizerWebview.getWebview();
            if (!panel) {
                vscode.window.showErrorMessage("Failed to create webview panel.");
                return;
            }
            diagramVisualizerWebview.registerEventListeners();
            panel.onDidDispose(() => {
                diagramVisualizerWebview = undefined;
                resetVisualizerSyncState();
                pendingFocusTarget = undefined;
            });
            vscode.commands.executeCommand("setContext", "SI.isVisualizerActive", "true");

            await triggerDesignRefresh(true);
            [250, 800, 1600].forEach((delay) => {
                setTimeout(() => {
                    void triggerDesignRefresh(true);
                }, delay);
            });
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (!isVisualizerTargetDocument(document)) {
                return;
            }
            await triggerDesignRefresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(VS_CODE_COMMANDS.EXPORT_TO_DOCKER, async () => {
            const siddhiFiles = await vscode.workspace.findFiles("**/*.siddhi");
            if (siddhiFiles.length === 0) {
                vscode.window.showInformationMessage("No .siddhi files found in the workspace.");
                return;
            }

            const selectedFiles = await vscode.window.showQuickPick(
                siddhiFiles.map((file) => ({
                    label: vscode.workspace.asRelativePath(file),
                    filePath: file.fsPath,
                })),
                {
                    canPickMany: true,
                    placeHolder: "Select Siddhi application(s)",
                }
            );

            if (!selectedFiles || selectedFiles.length === 0) {
                vscode.window.showWarningMessage("No Siddhi application selected.");
                return;
            }

            const imageName = await vscode.window.showInputBox({
                prompt: "Enter Docker image name",
                value: versionsConfig.defaultDockerImage,
                ignoreFocusOut: true,
            });
            if (!imageName) return vscode.window.showErrorMessage("Docker image name is required.");

            let siddhiHome = vscode.Uri.file(vscode.workspace.getConfiguration().get(SIDDHI_HOME_CONFIG) as string);
            const jarsFolder = vscode.Uri.joinPath(siddhiHome, ".jars");
            const jarFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(jarsFolder, "*.jar"));
            let selectedJars: { label: string; filePath: string }[] = [];
            if (jarFiles.length > 0) {
                let jars = await vscode.window.showQuickPick(
                    jarFiles.map((file) => ({
                        label: vscode.workspace.asRelativePath(file),
                        filePath: file.fsPath,
                    })),
                    {
                        canPickMany: true,
                        placeHolder: "Select JAR files from .jars directory",
                    }
                );
                if (jars) {
                    selectedJars = jars;
                }
            }

            const bundlesFolder = vscode.Uri.joinPath(siddhiHome, ".bundles");
            const bundleFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(bundlesFolder, "*.jar"));
            let selectedBundles: { label: string; filePath: string }[] = [];

            if (bundleFiles.length > 0) {
                let bundles = await vscode.window.showQuickPick(
                    bundleFiles.map((file) => ({
                        label: path.basename(file.fsPath),
                        filePath: file.fsPath,
                    })),
                    {
                        canPickMany: true,
                        placeHolder: "Select bundles from bundles directory",
                    }
                );
                if (bundles) {
                    selectedBundles = bundles;
                }
            }

            const exportFileName = await vscode.window.showInputBox({
                prompt: "Enter export file name",
                value: toKebabCaseFileName(selectedFiles[0].label),
                ignoreFocusOut: true,
            });
            if (!exportFileName) return vscode.window.showErrorMessage("Export file name is required.");

            // Create array of Siddhi apps with appName and appContent
            const templatedSiddhiApps = await Promise.all(
                selectedFiles.map(async (file) => {
                    const fileUri = vscode.Uri.file(file.filePath);
                    const appContent = await vscode.workspace.fs.readFile(fileUri);
                    const appName = path.basename(file.filePath)
                    
                    return {
                        appName: appName,
                        appContent: new TextDecoder().decode(appContent)
                    };
                })
            );

            const payload = {
                templatedSiddhiApps: templatedSiddhiApps,
                templatedVariables: [],
                jars: selectedJars.map((jar) => jar.label),
                bundles: selectedBundles.map((bundle) => bundle.label),
                dockerConfiguration: {
                    isExistingImage: true,
                    imageName: imageName,
                    userName: "",
                    password: "",
                    email: "",
                    downloadDocker: true,
                    pushDocker: false,
                },
            };

            const response = (await StateMachine.context().langClient?.exportDocker(payload)) as ExportResponse;
            if (!response || !response.success) {
                const errorMessage = response?.errorMsg;
                vscode.window.showErrorMessage(errorMessage);
                return;
            }

            vscode.window.showInformationMessage(`Exported Siddhi application(s) to Docker: ${exportFileName}`);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(VS_CODE_COMMANDS.EXTENSION_INSTALLER, async () => {
            let extensionInstallerWebview: ExtensionInstallerWebview = new ExtensionInstallerWebview();

            let panel = extensionInstallerWebview.getWebview();
            extensionInstallerWebview.registerEventListeners();
            if (!panel) {
                vscode.window.showErrorMessage("Failed to create webview panel.");
                return;
            }
            const initializeResponse = await StateMachine.context().langClient?.initializeExtensionInstaller();
            if (!initializeResponse || !initializeResponse.success) {
                vscode.window.showErrorMessage(
                    initializeResponse?.message || "Failed to initialize extension installer."
                );
                return;
            }
            const extensionStatuses = await StateMachine.context().langClient?.getAllExtensionStatuses();
            setTimeout(() => {
                extensionInstallerWebview.publishMessageToWebview(
                    UI_COMMANDS.SEND_EXTENSION_STATUSES,
                    extensionStatuses
                );
            }, 3000);
        })
    );
}

export async function activateEventSimulator() {
    if (simulatorVisualizerWebview) {
        simulatorVisualizerWebview.publishMessageToWebview(
            UI_COMMANDS.UPDATE_SIDDHI_APP_NAMES,
            createRunningSiddhiAppMap()
        );
        return;
    }
    simulatorVisualizerWebview = new SimulatorVisualizerWebview();
    let initializeResponse = await StateMachine.context().langClient?.initializeEventSimulator();
    if (!initializeResponse || !initializeResponse.success) {
        vscode.window.showErrorMessage(initializeResponse?.message || "Failed to initialize event simulator.");
        return;
    }
    let simulatePanel = simulatorVisualizerWebview.getWebview();
    if (!simulatePanel) {
        vscode.window.showErrorMessage("Failed to create simulation panel.");
        return;
    }
    simulatorVisualizerWebview.registerEventListeners();
}

export function deactivateEventSimulator() {
    if (extension.runningSiddhiApps.length == 0 && simulatorVisualizerWebview) {
        simulatorVisualizerWebview.dispose();
        simulatorVisualizerWebview = undefined;
    }
}

function toKebabCaseFileName(fileName: string): string {
    const baseName = fileName.replace(/\.siddhi$/i, "");
    return baseName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

export function createRunningSiddhiAppMap() {
    return extension.runningSiddhiApps.map((app) => ({ siddhiAppName: app, mode: "RUN" }));
}
