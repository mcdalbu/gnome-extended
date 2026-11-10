UUID = gnome-extended@local
VERSION = 25
ZIP = $(UUID)_v$(VERSION).zip
SOURCES = settingsLauncher.js ptyxisOpacity.js roundedClip.js sidebarStyle.js windowDamage.js windowSurfaces.js metadata.json extension.js appGrid.js shadowSettings.js dockSurfaces.js softSurface.js shellSurfaces.js shellBackgrounds.js panelOpacity.js signals.js frameSignals.js blurBackend.js blurRedrawGuard.js prefs.js COPYING README.md BLUR_REVIEW.md RELEASE_NOTES.md VALIDATION.md

.PHONY: all check zip-file clean
all: schemas/gschemas.compiled

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas --strict schemas

check: all
	glib-compile-schemas --strict --dry-run schemas
	python3 tests/check-package.py
	gjs -m tests/frame-signals.js
	gjs -m tests/sidebar-css.js
	python3 tests/ptyxis_settings.py
	GSETTINGS_SCHEMA_DIR=$(CURDIR)/schemas GSETTINGS_BACKEND=memory gjs -m tests/shadow-settings.js

zip-file: check
	rm -f $(ZIP)
	zip -q $(ZIP) $(SOURCES) schemas/*.gschema.xml schemas/gschemas.compiled

clean:
	rm -f schemas/gschemas.compiled $(ZIP)
