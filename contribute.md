# Contribution Guide
## Build and Debug the extension
### Step1: Settig up the development environment
1. Fork and Clone  [https://github.com/siddhi-io/siddhi-plugin-vscode](https://github.com/siddhi-io/siddhi-plugin-vscode)
2. execute  `npm install` in the terminal at the cloned directory, which downloads the required dependencies in the `package.json` file.
3. execute  `npm run compile` in the terminal at the cloned directory, which compiles the source code of the extension.

### Step2: Building Siddhi TextMate grammar file
`siddhi.tmLanguage.json` file provides [*text mate garmmar*](https://macromates.com/manual/en/language_grammars) for siddhi, which is used for syntax highlighting feature of the extension.

To build the grammar file from `siddhi.tmLanguage.yaml` file execute `npm run build-tm-grammar` in the command line at the cloned directory.

### Step3: Debugging the extension on extension host (Optional)
1. Configure extension host debugging in `launch.json`
    * Press `Ctrl+Shift+P`/`Cmd+Shift+P`  and type  `Open launch`. 
    * The Open launch (JSON) command will let you directly edit the  `launch.json` file.
    * Choose Node.js as the debug configuration type.
    * Add the following configuration to `launch.json` to run the extension on extesnion host.
    ```
        {
            "type": "extensionHost",
            "request": "launch",
            "name": "Launch Extension",
            "runtimeExecutable": "${execPath}",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}"
            ],
            "env": {
                "LSDEBUG":"true"
            },
            "outFiles": [
                "${workspaceFolder}/out/src/extension.js"
            ]
        }
    ```
    >**Note**: `"LSDEBUG":"true"` configuration is to start the Siddhi Language Server in **debug mode**, which enables remote debugging of language server.
2. Add  `"siddhi.debugLog":true` configuration to `settings.json` file to enable debug log.
3. Clone Siddhi Language Server source code from [https://github.com/siddhi-io/distribution](https://github.com/siddhi-io/distribution).
5. Start Siddhi Language Server as a remote debug process at `port 5005`
4. Refer more on debugging on extension host at [https://code.visualstudio.com/docs/nodejs/nodejs-debugging](https://code.visualstudio.com/docs/nodejs/nodejs-debugging)

### Step4: Building the `.visx` file
execute `npm run package` to build the `.vsix` file.

### Step5: Install and Test the extesnion
Follow either of the below approaches to install the plugin.
    * Using VSCode editor UI
    * Using Command Line
#### Using VSCode editor UI
1. Click View in the top menu of the editor and click Command Palette.
2. In the search bar, type “vsix” and click Extensions: Install from VSIX
3. Browse and select the `.vsix` file of the plugin you downloaded.
#### Using Command Line
In a new Command Line tab, execute the below command.

`$ code --install-extension <SIDDHI-PLUGIN-DIRECTORY>`

## Siddhi Language Server
The extension uses Siddhi Language Server to provide language analytic capabilits using [language server protocol](https://microsoft.github.io/language-server-protocol/).

Currently, the language server is capable of providing context based auto-completions and diagnostics.

Find the implementation of the Siddhi Language Server at [https://github.com/siddhi-io/distribution](https://github.com/siddhi-io/distribution)

## Support and Contribution
You can reach out through Slack channel, Google mail group and etc.Please refer the community contribution [site](https://siddhi.io/community/) for more information.
