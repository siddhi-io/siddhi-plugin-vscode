/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as path from "path";

export function buildRuntimeClassPath(
    siddhiHome: string,
    languageServerPath: string,
    kafkaClientJars: string[],
    delimiter: string = path.delimiter
): string[] {
    const entries = [
        ...kafkaClientJars,
        languageServerPath,
        path.join(String(siddhiHome), "lib", "*"),
        path.join(String(siddhiHome), "wso2", "lib", "plugins", "*"),
    ];
    return ["-cp", entries.join(delimiter)];
}
