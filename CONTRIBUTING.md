# Contributing to Faultline

Thanks for helping make system-design practice more concrete, visual, and honest.

## Local setup

Faultline currently targets Node.js 22 or newer and npm.

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm run test:run
npm run build
```

## What makes a good contribution

- Keep simulation outcomes deterministic for identical inputs.
- Count capacity only when the component participates in a complete routed path.
- Add or update tests when changing simulation, topology, judge, or provider behavior.
- Preserve keyboard access, reduced-motion behavior, and the compact mobile controls.
- Keep model-provider credentials on a server. Never add secrets to the Vite client.
- Prefer one focused change with a short explanation of its product impact.

For larger challenge types, scoring changes, persistence, or backend work, open an issue before investing in a large implementation.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
