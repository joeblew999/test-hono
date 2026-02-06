# ADR 0001: Technology Stack for Hono App

**Status:** Proposed

## Context

This project requires a lightweight and fast web framework for building an "isomorphic" web application. The application must be able to run on multiple environments:

*   **Edge servers:** Specifically, Cloudflare Workers.
*   **Standard servers and desktops:** Using bun.

Development should be efficient with a fast feedback loop for all target environments.

## Decision

We have decided to use a technology stack that supports this multi-platform requirement, centered around the Hono framework.

*   **Core Framework:** [Hono](https://hono.dev/) - A small, simple, and ultrafast web framework for the edge, known for its ability to run in any JavaScript runtime. The core application logic is written as a Hono app in `index.ts`.

*   **JavaScript Toolkit:** [Bun](https://bun.sh/) - A fast, all-in-one JavaScript runtime, bundler, and package manager used for development, testing, and running the application.

*   **Deployment Targets & Local Simulation:**
    *   **For Cloudflare Workers:**
        *   **Local Development:** [Miniflare](https://miniflare.dev/) is used to simulate the Cloudflare Workers environment locally. The `bun run dev` script starts the application with `miniflare`.
        *   **Deployment:** The application can be deployed directly to Cloudflare Workers.
    *   **For Desktops and Standard Servers:**
        *   **Server:** We use `@hono/node-server` to create a standalone Node.js server. The `server.ts` file is the entry point for this server.
        *   **Running:** The `bun run start:node` script starts the application as a standard Node.js process.

## Consequences

### Positive

*   **True Isomorphism:** The same core application logic (`index.ts`) runs across all target environments.
*   **Performance:** Hono and Bun are known for their high performance and low overhead.
*   **Developer Experience:** Bun provides a fast and streamlined development experience. Miniflare allows for local development that closely mirrors the production Cloudflare Workers environment.
*   **Flexibility:** We are not locked into a single deployment platform. The application can be deployed as a Cloudflare Worker or as a standard Node.js application.

### Negative

*   **New Technologies:** Bun is a relatively new technology, and while it's gaining popularity, it may have a smaller community and fewer resources compared to Node.js.
*   **Complexity:** Maintaining two separate server entry points (`miniflare` for Cloudflare and `server.ts` for Node.js) adds a small amount of complexity to the project.
