'use strict';
/**
 * Copyright (c) 2019, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */
import {
    ExtensionContext, Extension, extensions,window
} from "vscode";
import {
    INVALID_HOME_MSG, UNKNOWN_ERROR
} from "./messages";
import {getOutputChannel,log} from '../utils/logger';
import { getServerOptions } from '../server/server';
import { LanguageClient, LanguageClientOptions,RevealOutputChannelOn,State as LS_STATE} from "vscode-languageclient";
const SIDDHI_HOME = "siddhi.home";
import {workspace} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export const EXTENSION_ID = 'siddhi.siddhi';
//todo:check extension ID

export class SiddhiExtension{

    public siddhiHome:string
    public context?:ExtensionContext;
    private clientOptions: LanguageClientOptions;
    public langClient?: LanguageClient;
    public extension: Extension<any>;

    constructor() {
        this.siddhiHome = '';
        this.extension = extensions.getExtension(EXTENSION_ID)!;
        this.clientOptions = {
            documentSelector: [{ scheme: 'file', language: 'siddhi' }],
            outputChannel: getOutputChannel(),
            revealOutputChannelOn: RevealOutputChannelOn.Never,
        };
    }
    
    setContext(context: ExtensionContext) {
        this.context = context;
    }
    
    async init(): Promise<void>{
        try{
            if(this.findSiddhiHome != null){
                this.siddhiHome = this.findSiddhiHome();
                if(!this.isValidSiddhiHome(this.siddhiHome)){
                    const msg = "Configured Siddhi home is not valid.";
                    log(msg);
                    this.showMessageInvalidSiddhiHome();
                    return Promise.reject(msg);
                }
                //add capability to auto detect siddhi home
            }
            log("Using " + String(this.siddhiHome) + " as Siddhi home.");
            this.langClient = new LanguageClient('siddhi-vscode', 'Siddhi Language Server Client', getServerOptions(this.siddhiHome),this.clientOptions,false);
            const disposeDidChange = this.langClient.onDidChangeState(stateChangeEvent => {
                if (stateChangeEvent.newState === LS_STATE.Stopped) {
                    window.showErrorMessage(UNKNOWN_ERROR);
                }
            });

            let disposable = this.langClient.start();

            this.langClient.onReady().then(fulfilled => {
                disposeDidChange.dispose()
                this.context!.subscriptions.push(disposable);
            });

        } catch (exception) {
            const msg = "Error while activating plugin. " + (exception.message ? exception.message : exception);
            window.showErrorMessage(UNKNOWN_ERROR);
            return Promise.reject(msg);
        }
    }

    public findSiddhiHome(): string {
        return <string>workspace.getConfiguration().get(SIDDHI_HOME);
    }

    public isValidSiddhiHome(siddhiHome:string):boolean{
        const siddhiCmdTooling = this.getSiddhiCmdTooling(siddhiHome);
        const siddhiCmdRunner = this.getSiddhiCmdRunner(siddhiHome);
        if (fs.existsSync(siddhiCmdTooling)) {
            return true;
        }
        else if (fs.existsSync(siddhiCmdRunner)){
            return true
        }
        else{
            return false;
        }
    }

    onReady(): Promise<void> {
        if (!this.langClient) {
            return Promise.reject('Siddhi Extesnion is not initialized');
        }

        return this.langClient.onReady();
    }

    getSiddhiCmdTooling(siddhiDistribution: string = "") {
        const prefix = siddhiDistribution ? (path.join(siddhiDistribution, "bin") + path.sep) : "";
        return prefix + (process.platform === 'win32' ? 'tooling.bat' : 'tooling.sh');
    }

    getSiddhiCmdRunner(siddhiDistribution: string = "") {
        const prefix = siddhiDistribution ? (path.join(siddhiDistribution, "bin") + path.sep) : "";
        return prefix + (process.platform === 'win32' ? 'runner.bat' : 'runner.sh');
    }

    showMessageInvalidSiddhiHome(): void {
        const action = 'Open Settings';
        window.showWarningMessage(INVALID_HOME_MSG, action)
    }
}

export const siddhiExtensionInstance = new SiddhiExtension();