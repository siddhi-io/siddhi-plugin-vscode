 'use strict';
/**
 * Copyright (c) 2018, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
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

 /**
  * Log messages 
  */
export const SIDDHI_HOME = "siddhi.home";
export const INVALID_HOME_MSG: string = "Siddhi Home is invalid, please check `" + SIDDHI_HOME + "` in settings";
export const INSTALL_SIDDHI: string = "Unable to auto detect ballerina in your environment. If you just installed Ballerina, you may need to restart VSCode." + 
    " If not, please install Ballerina or configure `" + SIDDHI_HOME + "` in settings.";
export const INSTALL_NEW_SIDDHI: string = " version of Siddhi VSCode extension only supports Siddhi v5.1.2 or later. If you just installed a new Ballerina version, you may need to restart VSCode. If not, please download and install the latest version or point `" + SIDDHI_HOME + "` in settings to a latest Siddhi distribution.";
export const DOWNLOAD_SIDDHI: string = "https://siddhi.io/en/v5.1/download/";
export const CONFIG_CHANGED: string = "Ballerina plugin configuration changed. Please restart vscode for changes to take effect.";
export const MISSING_SERVER_CAPABILITY: string = "Your version of siddhi distribution does not support this feature. Please update to the latest siddhi distribution";
export const INVALID_FILE: string = "The current file is not a valid siddhi file. Please open a siddhi file and try again.";
export const UNKNOWN_ERROR: string ="Unknown Error : Failed to start Siddhi Language Server.";