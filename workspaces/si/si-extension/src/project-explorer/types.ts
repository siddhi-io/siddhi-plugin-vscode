/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

export enum DIRECTORY_MAP {
    STREAM = "STREAM",
    TABLE = "TABLE",
    WINDOW = "WINDOW",
    TRIGGER = "TRIGGER",
    AGGREGATION = "AGGREGATION",
    FUNCTION = "FUNCTION",
    SOURCE = "SOURCE",
    SINK = "SINK",
    QUERY = "QUERY",
    PARTITION = "PARTITION",
}

export interface ProjectStructureArtifact {
    id?: string;
    name: string;
    type: DIRECTORY_MAP;
    icon: string;
    detail?: string;
    children?: ProjectStructureArtifact[];
}

export interface SiddhiProjectStructure {
    appName: string;
    filePath: string;
    directoryMap: {
        [key in DIRECTORY_MAP]: ProjectStructureArtifact[];
    };
}

export interface SiddhiProjectStructureResponse {
    projects: SiddhiProjectStructure[];
}

/**
 * Shape of the design model JSON returned by the language server's
 * flowDesignService/getDesignView endpoint (after base64 decoding).
 */
export interface DesignModel {
    siddhiAppConfig: {
        siddhiAppName?: string;
        siddhiAppDescription?: string;
        streamList?: Array<{ name: string; id: string }>;
        tableList?: Array<{ name: string; id: string }>;
        windowList?: Array<{ name: string; id: string }>;
        triggerList?: Array<{ name: string; id: string }>;
        aggregationList?: Array<{ name: string; id: string }>;
        functionList?: Array<{ name: string; id: string }>;
        sourceList?: Array<{ type: string; connectedElementName?: string; id: string }>;
        sinkList?: Array<{ type: string; connectedElementName?: string; id: string }>;
        partitionList?: Array<{
            id: string;
            queryLists?: QueryLists;
            streamList?: Array<{ name: string; id: string }>;
        }>;
        queryLists?: QueryLists;
    };
    edgeList: Array<{ sourceId: string; targetId: string }>;
}

export interface QueryLists {
    WINDOW_FILTER_PROJECTION?: Array<{ queryName: string; id: string }>;
    PATTERN?: Array<{ queryName: string; id: string }>;
    SEQUENCE?: Array<{ queryName: string; id: string }>;
    JOIN?: Array<{ queryName: string; id: string }>;
}

