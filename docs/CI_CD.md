# CI/CD

All workflows live in `.github/workflows/`. They use Node 22 and `npm ci` (the lockfile is the source of truth).

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `ci.yml` → `check` | push to `main`, pull requests | install → build packages → build card bundle → bundle freshness → unit/protocol tests → typecheck → build playground → `llms-full.txt` freshness |
| `ci.yml` → `packages (Node 20/22/24)` | push to `main`, pull requests | `npm pack` the four packages → install the tarballs into a blank project → import every entry point and run the server kit against the real MCP SDK v2 (`scripts/smoke-packages.mjs`) |
| `e2e.yml` | push to `main`, pull requests | install → build → Playwright (Chromium) against the built playground (cross-origin proxy) → upload `playwright-report/` |
| `pages.yml` | pull requests | build with `PLAYGROUND_BASE=/<repo>/` + check the base path + upload the artifact — **no deploy** (Pages actions are tested before merge) |
| `pages.yml` | push to `main`, manual dispatch | build → deploy to GitHub Pages → **`verify-deployed`: the whole Playwright suite against the live URL** (`E2E_BASE_URL`, single origin, opaque proxy) |
| `release.yml` | tag `v*` | `verify`: build + unit + typecheck + packed-package smoke + E2E → `publish` (environment `npm`): `npm publish --provenance --access public` for each `packages/*` through **trusted publishing** (OIDC, no token; versions already on npm are skipped) → `github-release`: release with generated notes (skipped if it exists) |
| `codeql.yml` | push, pull requests, weekly | CodeQL analysis for JavaScript/TypeScript |
| `dependabot.yml` | weekly (npm), monthly (actions) | minor/patch grouped per family; **every major in its own PR**; all GitHub Actions in one PR |

Node: the repo's tooling (Vite 8, Vitest 5, jsdom 30) needs **Node ≥ 22.12**; the published packages promise **Node ≥ 20**, and the `packages` matrix proves it on 20, 22 and 24.

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
| Packed packages | A file is missing from `files`, the `exports` map is broken, a dependency only resolves inside the monorepo, or the libraries stop running on a supported Node. |
| Pages build on PRs | A dependency or action update would break the deploy. |
| `verify-deployed` | The site visitors get differs from what E2E tested (base path, CDN, single-origin sandbox). |

## Reviewing dependency updates

Before merging a Dependabot PR, besides its green checks:

1. **Majors get their own PR** — read the changelog. Build tools change output, not just APIs: Vite 8 (Rolldown + Lightning CSS) lowered Tailwind's CSS for the old `es2020` target and grew every card template by 61 kB, with all tests green. `@vue-mcp-apps/vite` now builds for `es2022` + `CSS_BASELINE`.
2. **Check what CI never runs**: `npm run dev` (concurrently), the watch rebuild and the hot reload of the sandboxed view.
3. **Several npm PRs at once**: merge them on one branch, run `npm install` (an auto-merged `package-lock.json` can be inconsistent even without a conflict), then `npm ci` and the whole suite.
4. Compare the card bundle size line (`script … kB + css … kB`) with `main`.

## One-time setup on GitHub

1. **Pages**: *Settings → Pages → Build and deployment → Source: GitHub Actions*. (Or `gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow`.) The demo is then at `https://<owner>.github.io/<repo>/`.
2. **npm publishing** uses [trusted publishing](https://docs.npmjs.com/trusted-publishers): no token is stored anywhere. Once per repository:
   - a GitHub environment `npm` whose deployment rule only allows tags `v*` (*Settings → Environments*), so nothing but a release tag can publish;
   - on npmjs.com, each package trusts `release.yml` in the environment `npm`. Needs a 2FA login, not a token:
     ```bash
     npm login
     for p in core view server vite; do
       npm trust github @vue-mcp-apps/$p --file release.yml --repo <owner>/<repo> --env npm --allow-publish -y
     done
     ```
   - then, per package, *Settings → Publishing access → Require two-factor authentication and disallow tokens*.

   Trusted publishing needs npm ≥ 11.5.1 (the `publish` job installs it) and `id-token: write`, which only the `publish` job gets. A package's very first version cannot be published this way (a package must exist before it can trust a workflow): publish it once by hand (`npm publish -w @vue-mcp-apps/<p> --access public`), then set up the trust.
3. **Branch protection** (recommended): require `check`, `packages (Node 20)`, `playwright` and the Pages `build` on `main`.

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
npm run test:packages                                   # packed tarballs in a blank project
npx playwright install chromium && npm run test:e2e
E2E_BASE_URL=https://juanmandev.github.io/vue-mcp-apps/ npm run test:e2e   # the suite against the live site
MSYS_NO_PATHCONV=1 PLAYGROUND_BASE=/vue-mcp-apps/ npm run build:playground   # Git Bash on Windows needs MSYS_NO_PATHCONV
(cd playground && MSYS_NO_PATHCONV=1 PLAYGROUND_BASE=/vue-mcp-apps/ npx vite preview --host 127.0.0.1 --port 4173)   # open http://localhost:4173/vue-mcp-apps/
```

## Using these workflows in your project

- Copy `ci.yml` and replace the build steps with your cards' `build:cards` and your server's build.
- Keep the freshness test if you commit `cards.json`; otherwise build it in CI before packaging the server.
- Copy `e2e.yml` and the `frameLocator` chain from [TESTING.md](TESTING.md) to test your cards inside the three layers.
