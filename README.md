# WSO2 Integrator: SI VSCode Extension

This repository contains the Visual Studio Code extension for WSO2 Integrator: SI (Streaming Integrator), along with shared libraries and components used by the extension.

The extension provides:
- **IntelliSense** for Siddhi applications
- **Syntax highlighting** for Siddhi query language
- **Diagnostics** and error detection
- **Code snippets** for common Siddhi patterns
- **Graphical visualization** of Siddhi applications
- **Event simulation** capabilities
- **Build and run** functionality for Siddhi apps

## Prerequisites

Before using this repository, ensure you have the following installed:

- **Node.js** – version **20.x** or later  
  [Download Node.js](https://nodejs.org)

- **npm** – version **10.x** or later (comes with Node.js)

- **pnpm** – version **10.10** or later  
  Install with:
    ```bash
    npm install -g pnpm
    ```

- **Rush.js** – version **5.153** or later  
  Install with:
    ```bash
    npm install -g @microsoft/rush
    ```

## Installation

Install all dependencies for the repository:

```bash
rush install
```

This will install dependencies for all workspaces in the monorepo.

## Building the Extension

To build all packages:

```bash
rush build
```

This uses a local build cache, so only changed packages are rebuilt.

### Building Individual Components

To build a specific package:

```bash
rush build --to <package-name>
```

Available packages:
- `si` - Main VSCode extension
- `@wso2/ui-toolkit` - Shared UI components
- `@wso2/font-wso2-vscode` - WSO2 icon font for VSCode

Example:
```bash
rush build
```

## Development

### Watch Mode
For development, you can run the extension in watch mode:

```bash
cd workspaces/si/si-extension
npm run watch
```

### Testing the Extension
1. Open this repository in VSCode
2. Press `F5` to launch a new Extension Development Host window
3. Open a `.siddhi` file to test the extension features

## Extension Features

### Language Support
- Syntax highlighting for Siddhi query language
- Code completion and IntelliSense
- Error diagnostics and validation
- Code snippets for common patterns

### Visualization
- Graphical view of Siddhi applications
- Interactive flow diagrams
- Real-time event simulation

### Development Tools
- Build and run Siddhi applications
- Integration with WSO2 Streaming Integrator server
- Extension installer for Siddhi extensions

## Other Important Commands

- `rush update`: Updates the dependencies shrinkwrap file.
- `rush rebuild`: Cleans the `common/temp` folder and then runs `rush build`.
- `rush check`: Checks dependency consistency across packages.
- `rush purge`: Cleans up temporary files and folders.

## Contribution Guidelines

If you are planning on contributing to the development of the WSO2 Integrator: SI VSCode extension:

1. Fork the repository before making changes
2. Follow the structure and conventions outlined in this document
3. Test your changes thoroughly using the Extension Development Host
4. Submit pull requests with clear descriptions and reference related issues if applicable


## License

By downloading and using the WSO2 Integrator: SI VSCode extension, you agree to the [Apache License 2.0](./LICENSE).

The extension integrates with the WSO2 Streaming Integrator server and Siddhi language runtime, which are also licensed under Apache License 2.0.

## Related Resources

- [WSO2 Streaming Integrator Documentation](https://si.docs.wso2.com/)
- [Siddhi Query Language Guide](https://siddhi.io/)
- [WSO2 Streaming Integrator Downloads](https://wso2.com/streaming-integrator/)
