# Contributing to Siddhi VSCode Extension

## Build and Debug the extension

### Setting up the development environment

1. Fork and Clone  [https://github.com/siddhi-io/siddhi-plugin-vscode](https://github.com/siddhi-io/siddhi-plugin-vscode)
2. execute  `npm install` in the terminal at the cloned directory, which downloads the required dependencies in the `package.json` file.
3. execute  `npm run compile` in the terminal at the cloned directory, which compiles the source code of the extension.

### Building Siddhi TextMate grammar file

`siddhi.tmLanguage.json` file provides [*text mate grammar*](https://macromates.com/manual/en/language_grammars) for siddhi, which is used for syntax highlighting feature of the extension.

To build the grammar file from `siddhi.tmLanguage.yaml` file execute `npm run build-tm-grammar` in the command line at the cloned directory.

### Debugging the extension on extension host (Optional)

1. Configure extension host debugging in `launch.json`
    * Press `Ctrl+Shift+P`/`Cmd+Shift+P`  and type  `Open launch`.
    * The Open launch (JSON) command will let you directly edit the  `launch.json` file.
    * Add the following configuration to `launch.json` to run the extension on extension host.

    ```json

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
4. Start Siddhi Language Server as a remote debug process at `port 5005`
5. Refer more on debugging on extension host at [https://code.visualstudio.com/docs/nodejs/nodejs-debugging](https://code.visualstudio.com/docs/nodejs/nodejs-debugging)

### Building the Extension file

Execute `npm run package` to build the `.vsix` file.

### Install and Test the extension

Execute `code --install-extension <SIDDHI-PLUGIN-DIRECTORY>/siddhi-*.vsix` to install the extension.

## Siddhi Language Server

The extension uses Siddhi Language Server to provide language analytic capabilities using [language server protocol](https://microsoft.github.io/language-server-protocol/).

Currently, the language server is capable of providing context based auto-completions and diagnostics.

Find the implementation of the Siddhi Language Server at [https://github.com/siddhi-io/distribution](https://github.com/siddhi-io/distribution)

## Support and Contribution

You can reach out through Slack channel, Google mail group and etc.Please refer the community contribution [site](https://siddhi.io/community/) for more information.
