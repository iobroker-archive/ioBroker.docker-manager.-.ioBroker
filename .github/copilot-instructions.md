# GitHub Copilot Instructions for ioBroker Docker Manager

This repository contains an ioBroker adapter for managing Docker containers, images, networks, and volumes through both CLI and Docker API.

## Project Architecture

### Core Components
- **Main Adapter** (`src/main.ts`): The primary ioBroker adapter class that extends `@iobroker/adapter-core`
- **DockerManager** (`src/lib/DockerManager.ts`): Handles Docker API interactions using `dockerode` library
- **DockerMonitor** (`src/lib/DockerMonitor.ts`): Monitors Docker daemon status and manages container lifecycle via CLI
- **Admin UI** (`src-admin/src/`): React-based administrative interface using Material-UI

### Key Patterns

#### ioBroker Adapter Pattern
- Extend `Adapter` from `@iobroker/adapter-core`
- Use `this.log` for logging (debug, info, warn, error)
- Handle state changes with `this.setState()` and `this.getState()`
- Implement message handling with `on('message')` event
- Use `native` config from `io-package.json` for adapter settings
- UI communication through `uiClientSubscribe`/`uiClientUnsubscribe`

#### TypeScript Patterns
- Use strict TypeScript configuration with Node16 module resolution
- Define comprehensive type interfaces in `*.types.ts` files
- Use type-only imports with `import type` syntax
- Follow consistent naming: interfaces use PascalCase, types use descriptive names
- Prefer `interface` for object shapes, `type` for unions and computed types

#### Docker Integration
- **CLI Integration**: Use `spawn()` for Docker CLI commands when API is unavailable
- **API Integration**: Use `dockerode` library for Docker Engine API calls
- **Configuration**: Support both Docker socket and remote API (HTTP/HTTPS)
- **Error Handling**: Gracefully handle Docker daemon unavailability
- **Container Management**: Support full lifecycle (create, start, stop, remove, inspect)

#### React Admin UI Patterns
- Use Material-UI (@mui/material) components consistently
- Class-based components extending `Component` or `GenericApp`
- Internationalization with `I18n.t()` from `@iobroker/adapter-react-v5`
- Tab-based navigation for different Docker resource types
- Real-time updates through WebSocket connection with adapter
- Responsive design with calculated heights and flex layouts

## Code Style Guidelines

### TypeScript
- Use private fields with `#` prefix for class privates
- Prefer `const` and `let` over `var`
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Type all function parameters and return values
- Use `Promise<void>` for async functions with no return value
- Destructure objects and arrays where appropriate

### React Components
- Use TypeScript interfaces for component props
- Handle state updates through callbacks passed as props
- Use Material-UI styling patterns with inline styles or theme functions
- Implement proper error boundaries and loading states
- Follow React lifecycle patterns for data fetching

### Error Handling
- Use try-catch blocks for async operations
- Log errors with appropriate levels (warn for recoverable, error for critical)
- Return meaningful error messages to UI components
- Handle network timeouts gracefully (1000ms default for HTTP checks)

## Development Workflow

### Build Process
- **Backend**: `npm run build:ts` compiles TypeScript to `build/` directory
- **Frontend**: `npm run build:gui` builds React admin interface
- **Combined**: `npm run build` builds both backend and frontend
- **Development**: Use `tasks.js` script with various flags for incremental builds

### Testing
- Run `npm test` for package validation tests
- Use `npm run lint` for ESLint checking (both backend and frontend)
- Frontend linting: `npm run lint-frontend`

### File Structure Conventions
- Backend TypeScript files in `src/` (compiled to `build/`)
- Frontend React files in `src-admin/src/` (built to `admin/`)
- Type definitions shared between backend and frontend
- Internationalization files in `src-admin/src/i18n/`
- Admin UI served from `admin/` directory by ioBroker

## Docker-Specific Considerations

### Container Configuration
- Support both Docker Compose-style and Docker CLI parameter formats
- Handle environment variables, port mappings, volume mounts
- Support advanced options like health checks, resource limits, networks
- Validate container configurations before creation

### Resource Management
- Monitor disk usage and system resources
- Handle container states (created, running, paused, exited, etc.)
- Support container lifecycle events and monitoring
- Manage Docker networks and volumes alongside containers

### Security Considerations
- Validate Docker daemon accessibility
- Handle Docker socket permissions properly
- Sanitize user inputs for Docker commands
- Support both secure (HTTPS) and insecure (HTTP) API connections

## Common Helper Patterns

### Size Formatting
Use `size2string()` utility for displaying Docker resource sizes in human-readable format.

### Network Detection
Use `findOwnIpFor()` to determine the best local IP address for accessing containers.

### Configuration Mapping
Use `mapInspectToConfig()` to convert Docker inspect results to simplified configuration objects.

When contributing to this project, ensure that all Docker operations are properly error-handled, UI components are responsive and accessible, and TypeScript types are comprehensive and accurate.