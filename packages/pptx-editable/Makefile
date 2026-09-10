.PHONY: setup test lint format build run clean sync

setup: ## Install dependencies (which also builds dist/) and the Chromium build Playwright needs
	npm install
	npx playwright install chromium

test: build ## Run the vendored exporter tests
	npx vitest run

lint: ## Type-check and lint
	npx tsc --noEmit
	npx eslint .

format: ## Auto-format with the same rules lint applies
	npx eslint . --fix

build: ## Emit dist/ from src/ with Node's type stripping
	node scripts/build.mjs

run: build ## Export DECK (a slides.md path, default: slides.md in this folder)
	node bin/cli.mjs $(DECK)

clean:
	rm -rf node_modules dist

sync: ## Re-copy the exporter from the slidev fork (SLIDEV_FORK, default ~/src/github/slidev)
	scripts/sync.sh
