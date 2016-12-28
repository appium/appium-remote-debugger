current_dir = $(shell pwd)

SELENIUM_BRANCH = selenium-3.0.1

DEFAULT: clone_selenium atoms

clone_selenium:
	mkdir -p tmp
	rm -rf tmp/selenium
	git clone --branch=${SELENIUM_BRANCH} --depth=1 https://github.com/SeleniumHQ/selenium.git tmp/selenium

atoms:
	rm -rf atoms
	cd tmp/selenium && ./go clean
	mkdir atoms
	minify=true ./import_atoms.sh $(current_dir)/tmp/selenium $(current_dir)/atoms

.PHONY: \
	DEFAULT \
	clone_selenium \
	atoms
