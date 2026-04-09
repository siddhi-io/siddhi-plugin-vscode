/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as vscode from "vscode";
import { ProjectExplorerEntryProvider } from "./project-explorer-provider";
import { VS_CODE_COMMANDS, PROJECT_EXPLORER_VIEW_ID } from "../constants";
import { stateService } from "../stateMachine";

let projectExplorerProvider: ProjectExplorerEntryProvider | undefined;
let projectExplorerInitialized = false;

interface GraphNodeFocusTarget {
    id?: string;
    type?: string;
    name?: string;
}

interface OpenGraphicalFocusedArgs {
    fileUri: vscode.Uri;
    focusTarget?: GraphNodeFocusTarget;
}

export function activateProjectExplorer(context: vscode.ExtensionContext) {
    const initializeProjectExplorer = () => {
        if (projectExplorerInitialized) {
            return;
        }

        projectExplorerInitialized = true;
        projectExplorerProvider = new ProjectExplorerEntryProvider();
        let refreshTimeout: NodeJS.Timeout | undefined;

        const scheduleRefresh = () => {
            if (refreshTimeout) {
                clearTimeout(refreshTimeout);
            }
            refreshTimeout = setTimeout(() => {
                projectExplorerProvider?.refresh();
            }, 200);
        };

        void vscode.commands.executeCommand("setContext", "SI.project.empty", true);
        void vscode.commands.executeCommand("setContext", "SI.project.loading", false);
        void vscode.commands.executeCommand("setContext", "SI.project.error", false);
        void vscode.commands.executeCommand("setContext", "SI.project.hasContent", false);
        void vscode.commands.executeCommand("setContext", "SI.project.hasSiddhiFiles", false);

        const treeView = vscode.window.createTreeView(PROJECT_EXPLORER_VIEW_ID, {
            treeDataProvider: projectExplorerProvider,
            showCollapseAll: true,
        });
        projectExplorerProvider.setTreeView(treeView);

        // Register commands
        context.subscriptions.push(
            vscode.commands.registerCommand(VS_CODE_COMMANDS.PROJECT_EXPLORER_REFRESH, () => {
                projectExplorerProvider?.refresh();
            }),

            vscode.commands.registerCommand(
                VS_CODE_COMMANDS.PROJECT_EXPLORER_OPEN_FILE,
                (fileUri: vscode.Uri) => {
                    vscode.window.showTextDocument(fileUri, { preview: false });
                },
            ),

            vscode.commands.registerCommand(
                VS_CODE_COMMANDS.PROJECT_EXPLORER_OPEN_GRAPHICAL_FOCUSED,
                async (args: OpenGraphicalFocusedArgs) => {
                    if (!args?.fileUri) {
                        return;
                    }

                    await vscode.commands.executeCommand(VS_CODE_COMMANDS.SHOW_GRAPHICAL_VIEW, {
                        fileUri: args.fileUri,
                        focusTarget: args.focusTarget,
                    });
                },
            ),

            vscode.commands.registerCommand(
                VS_CODE_COMMANDS.PROJECT_EXPLORER_REVEAL_FILE,
                async (item: { info?: string }) => {
                    if (!item.info) {
                        return;
                    }
                    const fileUri = vscode.Uri.file(item.info);
                    const editor = await vscode.window.showTextDocument(fileUri, { preview: false });
                    await vscode.commands.executeCommand("revealInExplorer", editor.document.uri);
                },
            ),
        );

        // File watchers for .siddhi files
        const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.siddhi");

        context.subscriptions.push(
            fileWatcher,
            fileWatcher.onDidCreate(() => scheduleRefresh()),
            fileWatcher.onDidDelete(() => scheduleRefresh()),
            fileWatcher.onDidChange(() => scheduleRefresh()),
        );

        // Refresh on document save
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                if (document.languageId === "siddhi") {
                    scheduleRefresh();
                }
            }),
        );

        // Auto-refresh when tree view becomes visible
        context.subscriptions.push(
            treeView.onDidChangeVisibility((e) => {
                if (e.visible) {
                    scheduleRefresh();
                }
            }),
        );

        // Reveal tree item when active editor changes to a .siddhi file
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                scheduleRefresh();
                if (editor && editor.document.languageId === "siddhi") {
                    projectExplorerProvider?.revealInTreeView(editor.document.uri.fsPath);
                }
            }),
        );

        // Refresh when language server becomes ready
        stateService.onTransition((state) => {
            if (state.matches("ready")) {
                scheduleRefresh();
            }
        });

        context.subscriptions.push(treeView, {
            dispose: () => {
                if (refreshTimeout) {
                    clearTimeout(refreshTimeout);
                }
            },
        });
    };

    void initializeProjectExplorer();

    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            void initializeProjectExplorer();
        }),
        vscode.workspace.onDidCreateFiles((event) => {
            if (event.files.some((file) => file.path.endsWith(".siddhi"))) {
                void initializeProjectExplorer();
            }
        }),
    );
}
