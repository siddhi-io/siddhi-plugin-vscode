/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as vscode from "vscode";
import { ChildProcess } from "child_process";

export class SIExtensionContext {
    public context!: vscode.ExtensionContext;
    public webviewReveal!: boolean;
    public fileUri!: vscode.Uri;
    public javaRuntimes = new Map<string, ChildProcess>();
    public runningSiddhiApps: string[] = [];
}

export const extension = new SIExtensionContext();
