# slidev-extensions

[![CI](https://github.com/stn1slv/slidev-extensions/actions/workflows/ci.yml/badge.svg)](https://github.com/stn1slv/slidev-extensions/actions/workflows/ci.yml)

Tools for [Slidev](https://sli.dev) that live outside the Slidev codebase, one npm package per folder under `packages/`.

| Package | Command | What it does |
|---|---|---|
| [`packages/pptx-editable`](packages/pptx-editable) | `slidev-pptx-editable` | Export a deck as PowerPoint with native shapes and editable text. Standalone build of [slidevjs/slidev#2722](https://github.com/slidevjs/slidev/pull/2722) until it is merged. |

This is a bridge, not a product. Once the upstream pull request ships as `slidev export --format pptx-editable`, the package here retires.

## Installation

One command on macOS, Windows or Linux with Node 22.18 or newer, no clone and no git needed. npm downloads GitHub's archive of `main`, installs it like any package, and builds `dist/` through the root `postinstall` script:

```bash
npm i -g https://github.com/stn1slv/slidev-extensions/archive/refs/heads/main.tar.gz
```

To pin a version, use a tag's archive instead: `https://github.com/stn1slv/slidev-extensions/archive/refs/tags/pptx-editable-v0.1.0.tar.gz`. The `github:stn1slv/slidev-extensions` shorthand works for a project-local install but not for `-g`: npm 11 installs a global git dependency as a symlink into a temporary clone that it then deletes.

Then, in the deck folder next to `slides.md`, the deck needs its own Slidev and a browser for Playwright:

```bash
cd <deck-folder>
npm i -D playwright-chromium && npx playwright install chromium
slidev-pptx-editable slides.md --output dist/slides.pptx
```

The tool resolves `@slidev/cli`, the theme and Playwright from the deck, not from its own folder, so the deck decides which Slidev version renders.

**From a checkout**, for development:

```bash
git clone https://github.com/stn1slv/slidev-extensions.git
cd slidev-extensions/packages/pptx-editable
npm install                      # also builds dist/
npx playwright install chromium  # once per machine
```

Then add the folder as a `file:` dependency of the deck: `npm i -D ../path/to/slidev-extensions/packages/pptx-editable`.

On Windows use PowerShell or `cmd` with the same commands; paths may use either `/` or `\`. `make` is optional: every `Makefile` target has an npm equivalent (`npm run build`, `npm test`, `npm run lint`).

## Development

Each package has its own `Makefile` with `setup`, `test`, `lint`, `format` and `build`; the root `Makefile` runs the same target in every package. CI runs lint and tests, packs the tarball, installs it into a fresh deck, exports a real deck, and installs the commit from git the way a user would, on Ubuntu, macOS and Windows with Node 22 and 24. See the package README for how the vendored code is kept in sync with its upstream pull request.
