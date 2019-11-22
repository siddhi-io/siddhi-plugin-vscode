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
 *`
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */

 /**
  * Provides language server options configuration.
  */

import { ServerOptions} from 'vscode-languageclient';
import {debug} from '../utils/logger';
import * as path from 'path';
const main:string='StdioLauncher';

export function getServerOptions(SIDDHI_HOME: string) : ServerOptions {
    debug(`Using Siddhi distribution at ${SIDDHI_HOME} for Language server.`);

    //configuration for setting java classpath at plugin start up 
    const SIDDHI_HOME_LIB = path.join(String(SIDDHI_HOME), 'lib','*');
    const SIDDHI_HOME_PLUGINS = path.join(String(SIDDHI_HOME), 'wso2','lib','plugins','*');
    const LANGSERVER_LIB = path.join(String(SIDDHI_HOME), 'langserver_lib','*');
    const JAVA_HOME = process.env.JAVA_HOME
    let executable : string = path.join(String(JAVA_HOME),'bin', 'java');
    let classPath = SIDDHI_HOME+':'+SIDDHI_HOME_LIB+':'+SIDDHI_HOME_PLUGINS+':'+LANGSERVER_LIB
    let args: string[] = ['-cp',classPath];

    //To start the language server in debug mode for plugin development.
    if (process.env.LSDEBUG === "true") {
       debug('Language Server is starting in debug mode.');
       args.push('-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005,quiet=y');
    }

    let serverOptions:ServerOptions={
       command:executable,
       args: [...args, main],
       options: {}
    }
    return serverOptions

}