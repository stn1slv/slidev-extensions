# slidev-extensions

Tools for [Slidev](https://sli.dev) that live outside the Slidev codebase, one npm package per folder under `packages/`.

| Package | What it does |
|---|---|
| [`packages/pptx-editable`](packages/pptx-editable) | `slidev-pptx-editable`: export a deck as PowerPoint with native shapes and editable text. Standalone build of [slidevjs/slidev#2722](https://github.com/slidevjs/slidev/pull/2722) until it is merged. |

Each package has its own `Makefile` with `setup`, `test`, `lint`, `format` and `build`; the root `Makefile` runs the same target in every package.
