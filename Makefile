# Each extension under packages/ is a standalone npm package with its own Makefile.
PACKAGES := $(wildcard packages/*)

.PHONY: setup test lint format build clean $(PACKAGES)

setup test lint format build clean:
	@for p in $(PACKAGES); do $(MAKE) -C $$p $@ || exit 1; done
