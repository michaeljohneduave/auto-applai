## AGENTS.md

This document provides guidelines for agentic coding agents operating in this repository.

### Operational Protocol

- **Planning and Task List**: Before initiating any code modifications or complex actions, the agent MUST create a detailed, step-by-step plan. This plan should be saved as a task list in the `task-lists` folder to monitor progress. The agent must await user approval on the plan before proceeding. Always ask the user for clarification if needed. This ensures clarity and alignment before any changes are made.
- **Task List**: After completing every task, the agent must mark the task as completed BEFORE moving to the next task. Always use an incremented prefix for the task tile.

### Lint, and Test Commands

- **Lint**: `npx @biomejs/biome@latest lint .`
- **Format**: `npx @biomejs/biome@latest format --write ./src`

### Code Style Guidelines

- **Imports**: Use ES module imports (`import ... from '...'`).
- **Formatting**: Adheres to Biome's default formatter settings. Use a line width of 80 characters and include bracket spacing.
- **Types**: Use TypeScript for static typing. Avoid `any` where possible. Non-null assertions (`!`) are acceptable.
- **Naming Conventions**: Follow standard TypeScript/JavaScript naming conventions (e.g., `camelCase` for variables and functions, `PascalCase` for classes and types).
- **Error Handling**: Use standard `try...catch` blocks for synchronous code and `.catch()` for promises.
- **Dependencies**: Use `npm` for package management. Check `package.json` before adding new dependencies.
- **Frameworks**: The project uses `fastify` for the server, `puppeteer` and `playwright` for browser automation, and `zod` for schema validation.
- **Linting Rules**: Always adhere to the rules defined in `biome.json`. Do not "fix" warnings that the configuration explicitly ignores (e.g., `noUnusedVariables` with `"fix": "none"`).

### Critical File Integrity Protocol

To prevent file corruption, the following protocol is mandatory when editing files:

1.  **Read Before Write**: Before any `write` or `edit` operation, the agent MUST read the target file to ensure it has the latest and correct content.
2.  **Verify After Write**: After any `write` or `edit` operation, the agent MUST read the file again to verify that the changes were applied correctly and the file was not corrupted.
3.  **Error Correction**: If a file is corrupted, the agent must immediately restore it from its conversation history or a known good state.