/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as vscode from "vscode";
import * as path from "path";
import {
    DIRECTORY_MAP,
    ProjectStructureArtifact,
    SiddhiProjectStructure,
    DesignModel,
    QueryLists,
} from "./types";
import { StateMachine } from "../stateMachine";
import { encodeToBase64, decodeFromBase64 } from "../utils/utils";
import { extension } from "../SIExtensionContext";

import { PROJECT_EXPLORER_VIEW_ID, VS_CODE_COMMANDS } from "../constants";

const PROJECT_CONTEXT_KEYS = {
    EMPTY: "SI.project.empty",
    LOADING: "SI.project.loading",
    ERROR: "SI.project.error",
    HAS_CONTENT: "SI.project.hasContent",
    HAS_SIDDHI_FILES: "SI.project.hasSiddhiFiles",
};

// Category display configuration
const CATEGORY_CONFIG: {
    type: DIRECTORY_MAP;
    label: string;
    icon: string;
    isCodicon: boolean;
    contextValue: string;
}[] = [
    { type: DIRECTORY_MAP.STREAM, label: "Streams", icon: "arrow-swap", isCodicon: true, contextValue: "streams" },
    { type: DIRECTORY_MAP.TABLE, label: "Tables", icon: "table", isCodicon: true, contextValue: "tables" },
    { type: DIRECTORY_MAP.WINDOW, label: "Windows", icon: "window", isCodicon: true, contextValue: "windows" },
    { type: DIRECTORY_MAP.TRIGGER, label: "Triggers", icon: "watch", isCodicon: true, contextValue: "triggers" },
    { type: DIRECTORY_MAP.AGGREGATION, label: "Aggregations", icon: "graph-line", isCodicon: true, contextValue: "aggregations" },
    { type: DIRECTORY_MAP.FUNCTION, label: "Functions", icon: "symbol-method", isCodicon: true, contextValue: "functions" },
    { type: DIRECTORY_MAP.SOURCE, label: "Sources", icon: "cloud-download", isCodicon: true, contextValue: "sources" },
    { type: DIRECTORY_MAP.SINK, label: "Sinks", icon: "cloud-upload", isCodicon: true, contextValue: "sinks" },
    { type: DIRECTORY_MAP.QUERY, label: "Queries", icon: "filter", isCodicon: true, contextValue: "queries" },
    { type: DIRECTORY_MAP.PARTITION, label: "Partitions", icon: "split-horizontal", isCodicon: true, contextValue: "partitions" },
];

/**
 * Tree item representing a single entry in the SI Project Explorer.
 */
export class ProjectExplorerEntry extends vscode.TreeItem {
    children?: ProjectExplorerEntry[];
    info: string | undefined;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        info?: string,
        icon?: string,
        isCodicon?: boolean,
        contextValue?: string,
    ) {
        super(label, collapsibleState);
        this.info = info;
        this.contextValue = contextValue || "";
        this.tooltip = label;

        if (icon) {
            if (isCodicon) {
                this.iconPath = new vscode.ThemeIcon(icon);
            } else {
                const extensionPath = extension.context.extensionPath;
                this.iconPath = {
                    light: vscode.Uri.file(path.join(extensionPath, "resources", "images", "icons", `${icon}.svg`)),
                    dark: vscode.Uri.file(path.join(extensionPath, "resources", "images", "icons", `${icon}.svg`)),
                };
            }
        }
    }
}

/**
 * Tree data provider for the SI Project Explorer view.
 * Retrieves project structure from the language server's getDesignModel API.
 */
export class ProjectExplorerEntryProvider implements vscode.TreeDataProvider<ProjectExplorerEntry> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProjectExplorerEntry | undefined | null | void> =
        new vscode.EventEmitter<ProjectExplorerEntry | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ProjectExplorerEntry | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private _data: ProjectExplorerEntry[] = [];
    private _treeView: vscode.TreeView<ProjectExplorerEntry> | undefined;
    private _isRefreshing = false;
    private _pendingRefresh = false;
    private _lastLoadHadErrors = false;
    private _hasSiddhiFiles = false;

    getTreeItem(element: ProjectExplorerEntry): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ProjectExplorerEntry): ProjectExplorerEntry[] {
        if (!element) {
            return this._data;
        }
        return element.children || [];
    }

    getParent(element: ProjectExplorerEntry): ProjectExplorerEntry | undefined {
        return this.recursiveSearchParent(undefined, element);
    }

    setTreeView(treeView: vscode.TreeView<ProjectExplorerEntry>) {
        this._treeView = treeView;
    }

    refresh(): void {
        if (this._isRefreshing) {
            this._pendingRefresh = true;
            return;
        }

        this._isRefreshing = true;
        this._pendingRefresh = false;

        vscode.window.withProgress({
            location: { viewId: PROJECT_EXPLORER_VIEW_ID },
            title: "Loading project structure",
        }, async () => {
            await this.setProjectContext(PROJECT_CONTEXT_KEYS.LOADING, true);
            try {
                await this.loadProjectStructure();
                await this.updateProjectContexts();
                this._onDidChangeTreeData.fire();
            } finally {
                await this.setProjectContext(PROJECT_CONTEXT_KEYS.LOADING, false);
                this._isRefreshing = false;
                if (this._pendingRefresh) {
                    this._pendingRefresh = false;
                    this.refresh();
                }
            }
        });
    }

    revealInTreeView(filePath: string): void {
        if (!this._treeView) {
            return;
        }
        const item = this.findItemByPath(filePath);
        if (item && this._treeView.visible) {
            this._treeView.reveal(item, { select: true, focus: false, expand: true });
        }
    }

    private findItemByPath(targetPath: string): ProjectExplorerEntry | undefined {
        for (const root of this._data) {
            if (root.info === targetPath) {
                return root;
            }
            const found = this.searchChildren(root, targetPath);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    private searchChildren(parent: ProjectExplorerEntry, targetPath: string): ProjectExplorerEntry | undefined {
        if (!parent.children) {
            return undefined;
        }
        for (const child of parent.children) {
            if (child.info === targetPath) {
                return child;
            }
            const found = this.searchChildren(child, targetPath);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    private async loadProjectStructure(): Promise<void> {
        this._lastLoadHadErrors = false;
        const workspaceSiddhiFiles = await vscode.workspace.findFiles("**/*.siddhi");
        const activeSiddhiFile = this.getActiveSiddhiFile();
        const siddhiFiles = workspaceSiddhiFiles.length === 0 && activeSiddhiFile
            ? [activeSiddhiFile]
            : workspaceSiddhiFiles;
        this._hasSiddhiFiles = siddhiFiles.length > 0;

        if (!this._hasSiddhiFiles) {
            this._data = [];
            return;
        }

        const langClient = StateMachine.context().langClient;

        if (!langClient) {
            this._data = [
                this.createPlaceholderEntry(
                    "Language server is initializing",
                    "Project Explorer will update automatically",
                    "loading~spin",
                    "statusNode",
                ),
            ];
            return;
        }

        const entries: ProjectExplorerEntry[] = [];
        const isSingleProject = siddhiFiles.length === 1;

        for (const fileUri of siddhiFiles) {
            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                const encoded = encodeToBase64(document.getText());
                const response = await langClient.getDesignModel(encoded);

                if (!response || !response.content) {
                    const serverError = response?.errorMsg?.trim();
                    const loadError = serverError || "No design model returned";
                    console.warn(`Project Explorer: empty design model for ${fileUri.fsPath}. ${loadError}`);
                    if (response?.stacktrace) {
                        console.warn(response.stacktrace);
                    }
                    this._lastLoadHadErrors = true;
                    const entry = this.createAppEntry(fileUri, null, isSingleProject, loadError);
                    entries.push(entry);
                    continue;
                }

                const decoded = decodeFromBase64(response.content);
                const designModel: DesignModel = JSON.parse(decoded);
                const entry = this.createAppEntry(fileUri, designModel, isSingleProject);
                entries.push(entry);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Failed to parse design model";
                console.warn(`Project Explorer: failed to load model for ${fileUri.fsPath}. ${message}`, error);
                this._lastLoadHadErrors = true;
                const entry = this.createAppEntry(fileUri, null, isSingleProject, message);
                entries.push(entry);
            }
        }

        this._data = entries;
    }

    private getActiveSiddhiFile(): vscode.Uri | undefined {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.languageId !== "siddhi") {
            return undefined;
        }

        if (activeEditor.document.uri.scheme !== "file") {
            return undefined;
        }

        return activeEditor.document.uri;
    }

    private createAppEntry(
        fileUri: vscode.Uri,
        designModel: DesignModel | null,
        isSingleProject: boolean,
        loadError?: string,
    ): ProjectExplorerEntry {
        const fileName = path.basename(fileUri.fsPath);
        const appName = designModel?.siddhiAppConfig?.siddhiAppName || fileName.replace(".siddhi", "");

        const children = designModel ? this.getCategories(designModel, fileUri) : [];
        const errorChildren = children.length === 0 && loadError ? [this.createErrorEntry(loadError)] : [];
        const displayChildren = children.length > 0 ? children : errorChildren;

        const hasChildren = displayChildren.length > 0;

        const entry = new ProjectExplorerEntry(
            appName,
            hasChildren
                ? (isSingleProject
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.Collapsed)
                : vscode.TreeItemCollapsibleState.None,
            fileUri.fsPath,
            "file-code",
            true,
            "siddhiApp",
        );

        entry.description = undefined;
        entry.resourceUri = fileUri;
        entry.tooltip = `${appName} (${fileName})`;
        entry.command = {
            command: VS_CODE_COMMANDS.PROJECT_EXPLORER_OPEN_FILE,
            title: "Open File",
            arguments: [fileUri],
        };

        if (hasChildren) {
            entry.children = displayChildren;
        }

        return entry;
    }

    private getCategories(designModel: DesignModel, fileUri: vscode.Uri): ProjectExplorerEntry[] {
        const projectStructure = this.extractProjectStructure(designModel, fileUri);
        const categories: ProjectExplorerEntry[] = [];

        for (const config of CATEGORY_CONFIG) {
            const items = projectStructure.directoryMap[config.type];
            if (!items || items.length === 0) {
                continue;
            }

            const children = this.getComponents(items, config.type, fileUri);
            const categoryEntry = new ProjectExplorerEntry(
                config.label,
                children.length > 0
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
                undefined,
                config.icon,
                config.isCodicon,
                "category",
            );

            if (children.length > 0) {
                categoryEntry.children = children;
            }
            categories.push(categoryEntry);
        }

        return categories;
    }

    private getComponents(
        items: ProjectStructureArtifact[],
        itemType: DIRECTORY_MAP,
        fileUri: vscode.Uri,
    ): ProjectExplorerEntry[] {
        return items.map((item) => {
            const hasChildren = item.children && item.children.length > 0;
            const entry = new ProjectExplorerEntry(
                item.name,
                hasChildren
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
                fileUri.fsPath,
                undefined,
                true,
                "projectComponent",
            );

            if (item.detail) {
                entry.description = item.detail;
            }

            entry.command = {
                command: VS_CODE_COMMANDS.PROJECT_EXPLORER_OPEN_GRAPHICAL_FOCUSED,
                title: "Open Graphical View",
                arguments: [{
                    fileUri,
                    focusTarget: {
                        id: item.id,
                        type: itemType,
                        name: item.name,
                    },
                }],
            };

            if (hasChildren) {
                entry.children = item.children!.map((child) => {
                    const childEntry = new ProjectExplorerEntry(
                        child.name,
                        vscode.TreeItemCollapsibleState.None,
                        fileUri.fsPath,
                        undefined,
                        true,
                        child.type,
                    );
                    if (child.detail) {
                        childEntry.description = child.detail;
                    }
                    return childEntry;
                });
            }

            return entry;
        });
    }

    private extractProjectStructure(designModel: DesignModel, fileUri: vscode.Uri): SiddhiProjectStructure {
        const directoryMap = {
            [DIRECTORY_MAP.STREAM]: [] as ProjectStructureArtifact[],
            [DIRECTORY_MAP.TABLE]: [] as ProjectStructureArtifact[],
            [DIRECTORY_MAP.WINDOW]: [] as ProjectStructureArtifact[],
            [DIRECTORY_MAP.TRIGGER]: [] as ProjectStructureArtifact[],
            [DIRECTORY_MAP.AGGREGATION]: [] as ProjectStructureArtifact[],
            [DIRECTORY_MAP.FUNCTION]: [] as ProjectStructureArtifact[],
            [DIRECTORY_MAP.SOURCE]: [] as ProjectStructureArtifact[],
            [DIRECTORY_MAP.SINK]: [] as ProjectStructureArtifact[],
            [DIRECTORY_MAP.QUERY]: [] as ProjectStructureArtifact[],
            [DIRECTORY_MAP.PARTITION]: [] as ProjectStructureArtifact[],
        };

        // Streams
        if (designModel.siddhiAppConfig.streamList) {
            directoryMap[DIRECTORY_MAP.STREAM] = designModel.siddhiAppConfig.streamList.map((s) => ({
                id: s.id,
                name: s.name,
                type: DIRECTORY_MAP.STREAM,
                icon: "arrow-swap",
            }));
        }

        // Tables
        if (designModel.siddhiAppConfig.tableList) {
            directoryMap[DIRECTORY_MAP.TABLE] = designModel.siddhiAppConfig.tableList.map((t) => ({
                id: t.id,
                name: t.name,
                type: DIRECTORY_MAP.TABLE,
                icon: "table",
            }));
        }

        // Windows
        if (designModel.siddhiAppConfig.windowList) {
            directoryMap[DIRECTORY_MAP.WINDOW] = designModel.siddhiAppConfig.windowList.map((w) => ({
                id: w.id,
                name: w.name,
                type: DIRECTORY_MAP.WINDOW,
                icon: "window",
            }));
        }

        // Triggers
        if (designModel.siddhiAppConfig.triggerList) {
            directoryMap[DIRECTORY_MAP.TRIGGER] = designModel.siddhiAppConfig.triggerList.map((t) => ({
                id: t.id,
                name: t.name,
                type: DIRECTORY_MAP.TRIGGER,
                icon: "watch",
            }));
        }

        // Aggregations
        if (designModel.siddhiAppConfig.aggregationList) {
            directoryMap[DIRECTORY_MAP.AGGREGATION] = designModel.siddhiAppConfig.aggregationList.map((a) => ({
                id: a.id,
                name: a.name,
                type: DIRECTORY_MAP.AGGREGATION,
                icon: "graph-line",
            }));
        }

        // Functions
        if (designModel.siddhiAppConfig.functionList) {
            directoryMap[DIRECTORY_MAP.FUNCTION] = designModel.siddhiAppConfig.functionList.map((f) => ({
                id: f.id,
                name: f.name,
                type: DIRECTORY_MAP.FUNCTION,
                icon: "symbol-method",
            }));
        }

        // Sources
        if (designModel.siddhiAppConfig.sourceList) {
            directoryMap[DIRECTORY_MAP.SOURCE] = designModel.siddhiAppConfig.sourceList.map((s) => ({
                id: s.id,
                name: s.type,
                type: DIRECTORY_MAP.SOURCE,
                icon: "cloud-download",
            }));
        }

        // Sinks
        if (designModel.siddhiAppConfig.sinkList) {
            directoryMap[DIRECTORY_MAP.SINK] = designModel.siddhiAppConfig.sinkList.map((s) => ({
                id: s.id,
                name: s.type,
                type: DIRECTORY_MAP.SINK,
                icon: "cloud-upload",
            }));
        }

        // Queries
        directoryMap[DIRECTORY_MAP.QUERY] = this.extractQueries(designModel.siddhiAppConfig.queryLists);

        // Partitions
        if (designModel.siddhiAppConfig.partitionList) {
            directoryMap[DIRECTORY_MAP.PARTITION] = designModel.siddhiAppConfig.partitionList.map((p, index) => {
                const partitionQueries = this.extractQueries(p.queryLists);
                return {
                    id: p.id,
                    name: `Partition ${index + 1}`,
                    type: DIRECTORY_MAP.PARTITION,
                    icon: "split-horizontal",
                    children: partitionQueries.length > 0 ? partitionQueries : undefined,
                };
            });
        }

        return {
            appName: designModel.siddhiAppConfig.siddhiAppName || path.basename(fileUri.fsPath, ".siddhi"),
            filePath: fileUri.fsPath,
            directoryMap,
        };
    }

    private extractQueries(queryLists?: QueryLists): ProjectStructureArtifact[] {
        if (!queryLists) {
            return [];
        }

        const queries: ProjectStructureArtifact[] = [];

        const addQueries = (list: Array<{ queryName: string; id: string }> | undefined, icon: string) => {
            if (!list) { return; }
            list.forEach((q) => {
                queries.push({
                    id: q.id,
                    name: q.queryName || q.id,
                    type: DIRECTORY_MAP.QUERY,
                    icon,
                });
            });
        };

        addQueries(queryLists.WINDOW_FILTER_PROJECTION, "filter");
        addQueries(queryLists.PATTERN, "regex");
        addQueries(queryLists.SEQUENCE, "list-ordered");
        addQueries(queryLists.JOIN, "git-merge");

        return queries;
    }

    private recursiveSearchParent(
        parent: ProjectExplorerEntry | undefined,
        target: ProjectExplorerEntry,
    ): ProjectExplorerEntry | undefined {
        const children = parent ? parent.children : this._data;
        if (!children) {
            return undefined;
        }
        for (const child of children) {
            if (child === target) {
                return parent;
            }
            const found = this.recursiveSearchParent(child, target);
            if (found !== undefined) {
                return found;
            }
        }
        return undefined;
    }

    private createPlaceholderEntry(
        label: string,
        description: string,
        icon: string,
        contextValue: string,
    ): ProjectExplorerEntry {
        const entry = new ProjectExplorerEntry(
            label,
            vscode.TreeItemCollapsibleState.None,
            undefined,
            icon,
            true,
            contextValue,
        );
        entry.description = description;
        return entry;
    }

    private createErrorEntry(message: string): ProjectExplorerEntry {
        const entry = new ProjectExplorerEntry(
            message,
            vscode.TreeItemCollapsibleState.None,
            undefined,
            "warning",
            true,
            "errorNode",
        );
        entry.description = "Select refresh to retry";
        entry.command = {
            command: VS_CODE_COMMANDS.PROJECT_EXPLORER_REFRESH,
            title: "Retry",
        };
        return entry;
    }

    private async updateProjectContexts(): Promise<void> {
        const isLoadingOnly = this._data.some((node) => node.contextValue === "statusNode");
        const isEmpty = !isLoadingOnly && this._data.length === 0;
        const hasContent = !isLoadingOnly && this._data.length > 0;
        await this.setProjectContext(PROJECT_CONTEXT_KEYS.EMPTY, isEmpty);
        await this.setProjectContext(PROJECT_CONTEXT_KEYS.ERROR, this._lastLoadHadErrors);
        await this.setProjectContext(PROJECT_CONTEXT_KEYS.HAS_CONTENT, hasContent);
        await this.setProjectContext(PROJECT_CONTEXT_KEYS.HAS_SIDDHI_FILES, this._hasSiddhiFiles);
    }

    private async setProjectContext(key: string, value: boolean): Promise<void> {
        await vscode.commands.executeCommand("setContext", key, value);
    }
}

