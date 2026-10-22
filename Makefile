UUID = gnome-shell-soft@local
VERSION = 2
ZIP = $(UUID)_v$(VERSION).zip
SOURCES = metadata.json extension.js softSurface.js signals.js blurBackend.js blurRedrawGuard.js prefs.js COPYING README.md

.PHONY: all check zip-file clean
all: schemas/gschemas.compiled

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas --strict schemas

check: all
	glib-compile-schemas --strict --dry-run schemas
	python3 tests/check-package.py

zip-file: check
	rm -f $(ZIP)
	zip -q $(ZIP) $(SOURCES) schemas/*.gschema.xml schemas/gschemas.compiled

clean:
	rm -f schemas/gschemas.compiled $(ZIP)
