# Siddhi Extension for Visual Studio Code

A VSCode extension which provides rich Siddhi development capabilities, such as IntelliSence, diagnostics and syntax highlighting. This extension supports [siddhi distribution](https://github.com/siddhi-io/distribution) *version (>=5.1.2)*.

## Quick Start

1. Download [Siddhi distribution](https://siddhi.io/en/v5.1/download/) (**version 5.1.2** or higher should be available locally)
<!-- update the version of the distribution url to once the /latest is supported.>
<!-- add sdk support as well-->
<!--or [Siddhi SDK](https://siddhi.io/en/v5.1/download/#pysiddhi) should be available locally.-->
2. Configure Siddhi Home

    `Siddhi Home` can be configured by either of the following methods,

   1. Configure Siddhi home in `settings.json`
       * Press `Ctrl+Shift+P` / `Cmd+Shift+P` and type  `Open settings`.
       * Select `Open Settings (JSON)`.
       * Add `"siddhi.home":"<SIDDHI-HOME-DIRECTORY>"` to `settings.json` file as below,

         <img height="100" width="280" src="resources/images/siddhi-home-configuration.png" alt="siddhi-home-configuration-image"/>

   2. Add ``SIDDHI_HOME`` as an environment variable.

## Features

### IntelliSence

* Auto completion: Context based auto completions by Siddhi Language Server.
* Snippets: Context based snippets by Siddhi Language Server.

### Diagnostics

* Semantic/Syntactic error reporting as code is typed

### Syntax Highlighting

* Lexical sub-elements are highlighted in various colors based on the theme that has been activated in your VSCode editor.

<table>
  <tr>
    <td> <img height="413" width="734" src="resources/images/completion.png" alt="completion-image"/> </td>
    <td> <img height="413" width="734" src="resources/images/diagnostics.png" alt="diagnostics-image"/> </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
     <img height="413" width="734" src="resources/images/syntax_highlighting.png" alt="syntax-highlighting-image"/>
     </td>
  </tr>
</table>

## Contributing

## Contributing to Siddhi VSCode Extesnion
For instructions on how to build, debug and contribute to vscode extension go to The [Siddhi Visual Studio Code Contribution Guide.](CONTRIBUTING.md)

## Support

You can reach out Siddhi Developers through Slack channel, Google mail group and etc. Please refer the community contribution [site](https://siddhi.io/community/) for more information.

## Licence

Siddhi VS Code extension is licensed under [Apache License 2.0](https://github.com/siddhi-io/siddhi-plugin-vscode/blob/master/LICENSE).
