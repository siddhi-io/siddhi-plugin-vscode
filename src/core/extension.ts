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

import {ExtensionContext,window} from "vscode";
import {INVALID_HOME_MSG, UNKNOWN_ERROR, EXTENSION_NOT_INITIALIZED_ERROR} from "./messages";
import {getOutputChannel,log} from '../utils/logger';
import { getServerOptions } from '../server/server';
import { LanguageClient, LanguageClientOptions,RevealOutputChannelOn,State as LS_STATE} from "vscode-languageclient";
import {workspace} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const SIDDHI_HOME_CONFIG = "siddhi.home";
export const EXTENSION_ID = 'siddhi.siddhi';

export class SiddhiExtension {

    private siddhiHome:string
    private context?:ExtensionContext;
    private clientOptions: LanguageClientOptions;
    private langClient?: LanguageClient;
    constructor() {
        this.siddhiHome = '';
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
            let siddhiHome = this.findSiddhiHome()
            if(siddhiHome != null){
                this.siddhiHome = siddhiHome;
                if(!this.isValidSiddhiHome(this.siddhiHome)){
                    log(INVALID_HOME_MSG);
                    this.showMessageInvalidSiddhiHome();
                    return Promise.reject(INVALID_HOME_MSG);
                }
                log("Using " + String(this.siddhiHome) + " as Siddhi home.");
                //forced debug option(parameter) is set to false as extension host enable forced debugging.
                this.langClient = new LanguageClient('siddhi-vscode', 'Siddhi_Language_Server_Client', getServerOptions(this.siddhiHome),this.clientOptions,false);
                const disposeDidChange = this.langClient.onDidChangeState(stateChangeEvent => {
                    if (stateChangeEvent.newState === LS_STATE.Stopped) {
                        window.showErrorMessage(UNKNOWN_ERROR);
                    }
                });

                let disposable = this.langClient.start();
                this.langClient.onReady().then( state => {
                    disposeDidChange.dispose()
                    this.context!.subscriptions.push(disposable);
                });
            } else {
                log(INVALID_HOME_MSG);
                this.showMessageInvalidSiddhiHome();
                return Promise.reject(INVALID_HOME_MSG);
            }
        } catch (exception) {
            const msg = INVALID_HOME_MSG + (exception.message ? exception.message : exception);
            window.showErrorMessage(UNKNOWN_ERROR);
            return Promise.reject(msg);
        }
    }

    public findSiddhiHome(): string {
        //if the siddhi.home is not configured in settings.json try SIDDHI_HOME environment variable
        let siddhiHome = workspace.getConfiguration().get(SIDDHI_HOME_CONFIG);
        if(siddhiHome){
            return <string>siddhiHome;
        } else {
            return <string>process.env.SIDDHI_HOME;
        }
    }

    public isValidSiddhiHome(siddhiHome:string):boolean{
        const siddhiCmdTooling = this.getSiddhiCmdTooling(siddhiHome);
        const siddhiCmdRunner = this.getSiddhiCmdRunner(siddhiHome);
        return fs.existsSync(siddhiCmdTooling)|| fs.existsSync(siddhiCmdRunner);
    }

    onReady(): Promise<void> {
        if (!this.langClient) {
            return Promise.reject(EXTENSION_NOT_INITIALIZED_ERROR);
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
        window.showWarningMessage(INVALID_HOME_MSG, action);
    }
}
export const siddhiExtensionInstance = new SiddhiExtension();
