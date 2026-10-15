# CI/CD

All workflows live in `.github/workflows/`. They use Node 22 and `npm ci` (the lockfile is the source of truth).

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `ci.yml` | push to `main`, pull requests | install → build packages → build card bundle → bundle freshness → unit/protocol tests → typecheck → build playground |
| `e2e.yml` | push to `main`, pull requests | install → build → Playwright (Chromium) against the built playground → upload `playwright-report/` on failure |
| `pages.yml` | push to `main`, manual dispatch | build with `PLAYGROUND_BASE=/<repo>/` → upload `playground/dist` → deploy to GitHub Pages |
| `release.yml` | tag `v*` | build + test → `npm publish --provenance --access public` for each `packages/*` (only when `NPM_TOKEN` is set) → GitHub release with generated notes |
| `codeql.yml` | push, pull requests, weekly | CodeQL analysis for JavaScript/TypeScript |
| `dependabot.yml` | weekly | npm (root workspaces) and GitHub Actions version updates |

## What each check protects

| Step | Fails when |
| --- | --- |
| Build packages (`tsc -b`) | A package does not compile or its declarations break. |
| Build card bundle | A card fails to compile, the bundle is not one chunk, or it exceeds `maxSizeKb`. |
| Bundle freshness | `cards.json` does not match its sources (relevant when you commit it). |
| `npm test` | The card contract, the protocol conformance against `AppBridge`, the server kit or the renderer regress. |
| `npm run typecheck` | Types break in packages (`tsc -b`), the example or the playground (`vue-tsc`). |
| Build playground | The demo would not deploy. |
| E2E | The three layers, card clicks or the scripted AI chat break in a real browser. |

## One-time setup on GitHub

1. **Pages**: *Settings → Pages → Build and deployment → Source: GitHub Actions*. (Or `gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow`.) The demo is then at `https://<owner>.github.io/<repo>/`.
2. **npm publishing** (optional): create an npm *automation* token and add it as the repository secret `NPM_TOKEN`. Without it, `release.yml` builds, tests and creates the GitHub release but skips publishing. `--provenance` needs `id-token: write`, which the workflow requests.
3. **Branch protection** (recommended): require `CI` and `E2E` on `main`.

## Cutting a release

```bash
# bump versions in packages/*/package.json (and their internal dependencies), update CHANGELOG.md
git commit -am "chore: release v0.2.0"
git tag v0.2.0
git push --follow-tags
```

`release.yml` publishes `@vue-mcp-apps/core` first (the others depend on it), then `view`, `server`, `vite`.

## Running the same checks locally

```bash
npm ci
npm run build:packages && npm run build:cards
npm test
npm run typecheck
npx playwright install chromium && npm run test:e2e
MSYS_NO_PATHCONV=1 PLAYGROUND_BASE=/vue-mcp-apps/ npm run build:playground   # Git Bash on Windows needs MSYS_NO_PATHCONV
(cd playground && MSYS_NO_PATHCONV=1 PLAYGROUND_BASE=/vue-mcp-apps/ npx vite preview --host 127.0.0.1 --port 4173)   # open http://localhost:4173/vue-mcp-apps/
```

## Using these workflows in your project

- Copy `ci.yml` and replace the build steps with your cards' `build:cards` and your server's build.
- Keep the freshness test if you commit `cards.json`; otherwise build it in CI before packaging the server.
- Copy `e2e.yml` and the `frameLocator` chain from [TESTING.md](TESTING.md) to test your cards inside the three layers.
