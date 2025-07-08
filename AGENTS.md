## AGENTS.md

This document provides guidelines for agentic coding agents operating in this repository.

### Build, Lint, and Test Commands

- **Build**: No explicit build command found. The project seems to run directly from TypeScript source files.
- **Lint**: `npx @biomejs/biome lint ./src`
- **Format**: `npx @biomejs/biome format --write ./src`
- **Test**:
  - To run all tests: `for file in src/tests/*.ts; do node --import=tsx $file; done`
  - To run a single test: `node --import=tsx src/tests/test-puppeteer-mcp.ts`

### Code Style Guidelines

- **Imports**: Use ES module imports (`import ... from '...'`).
- **Formatting**: Adheres to Biome's default formatter settings. Use a line width of 80 characters and include bracket spacing.
- **Types**: Use TypeScript for static typing. Avoid `any` where possible. Non-null assertions (`!`) are acceptable.
- **Naming Conventions**: Follow standard TypeScript/JavaScript naming conventions (e.g., `camelCase` for variables and functions, `PascalCase` for classes and types).
- **Error Handling**: Use standard `try...catch` blocks for synchronous code and `.catch()` for promises.
- **Dependencies**: Use `npm` for package management. Check `package.json` before adding new dependencies.
- **Frameworks**: The project uses `fastify` for the server, `puppeteer` and `playwright` for browser automation, and `zod` for schema validation.
