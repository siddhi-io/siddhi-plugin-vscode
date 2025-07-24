# Source Organization

This document describes the structure and organization of the `vscode-extensions` monorepo.

---

## Overview

This monorepo contains all Visual Studio Code extensions, shared libraries, and supporting tools developed and maintained by WSO2 for the Choreo, Ballerina, MI, and related platforms. It is managed using [Rush](https://rushjs.io/) for consistent dependency management and builds.

---

## Directory Structure

```
vscode-extensions/
│
├── workspaces/
│   ├── si/                       # Contains the SI extension packages
│   │
│   └── common-libs/              # Shared libraries and utilities used by multiple extensions
```

---

## Key Components

- **Extension**: `si-extension` resides in its own folder under `workspaces/`.
- **Shared Libraries**: Common code and utilities are placed in `workspaces/common-libs/`.
---

## Node.js Version

- **Recommended Node.js version:** `v22`
- **Supported Node.js versions:** `v20` to `v22`

Make sure you are using a compatible Node.js version for development and builds.

---

## Development Workflow

- **Dependency Management**: Use Rush commands (`rush install`, `rush build`, etc.) for all dependency and build operations.
- **Environment Setup**: Ensure required `.env` files are present for extensions that need them. Use the provided `.env.example` files as templates.
- **Code Generation**: Use the code generators (such as `rpc-generator` and `syntax-tree/generator`) as needed to automate repetitive code tasks.
- **Code Review**: Submit pull requests for all changes and follow the repository’s contribution guidelines for code quality and review.

---

## Contribution Guidelines

- Fork the repository before making changes.
- Follow the structure and conventions outlined in this document.
- Submit pull requests with clear descriptions and reference related issues if applicable.

---

## Contact

For questions or support, please open an issue in the [GitHub repository](https://github.com/siddhi-io/siddhi-plugin-vscode) or contact the WSO2 developer team.

---
