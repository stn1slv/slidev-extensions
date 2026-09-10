.PHONY: setup test lint format build run clean sync

setup: ## Install dependencies and the Chromium build Playwright needs
	npm install
	npx playwright install chromium

test: build ## Run the vendored exporter tests
	npx vitest run

lint: ## Type-check and lint
	npx tsc --noEmit
	npx eslint .

format: ## Auto-format with the same rules lint applies
	npx eslint . --fix

build: ## Write dist/pptx-walker.mjs, the walker as Node ships it, for the tests
	node scripts/build.mjs

run: ## Export the deck in DECK (default: slides.md in the current directory)
	node bin/cli.mjs $(DECK)

clean:
	rm -rf node_modules dist

sync: ## Re-copy the exporter from the slidev fork (SLIDEV_FORK, default ~/src/github/slidev)
	scripts/sync.sh
