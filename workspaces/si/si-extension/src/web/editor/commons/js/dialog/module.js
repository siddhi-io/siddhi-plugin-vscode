/**
 * Copyright (c) 2019, WSO2 Inc. (http://www.wso2.org)  Apache License, Version 2.0  http://www.apache.org/licenses/LICENSE-2.0
 */
define(['./deploy-file-dialog', './extension-install-dialog'],
    function (DeployFileDialog, ExtensionInstallDialog) {
        return {
            deploy_file_dialog: DeployFileDialog,
            ExtensionInstallDialog :ExtensionInstallDialog,
        };
    });
