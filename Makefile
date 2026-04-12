.PHONY: setup setup-hash deploy push pull clean help

# Read APPS_SCRIPT_ID and APPS_SCRIPT_DEPLOYMENT_ID from .env without sourcing
# the whole file (the PASSWORD entry contains a $ that would break `source`).
APPS_SCRIPT_ID             := $(shell grep -E '^APPS_SCRIPT_ID='             .env 2>/dev/null | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$$//')
APPS_SCRIPT_DEPLOYMENT_ID  := $(shell grep -E '^APPS_SCRIPT_DEPLOYMENT_ID='  .env 2>/dev/null | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$$//')

help:
	@echo "Targets:"
	@echo "  make setup      — one-time setup: installs clasp, logs in, fills APPS_SCRIPT_ID"
	@echo "  make setup-hash — set PASSWORD_HASH as an Apps Script property (one-time)"
	@echo "  make deploy     — push Code.gs and update the existing deployment in place"
	@echo "  make push       — push Code.gs without creating/updating a deployment"
	@echo "  make pull       — pull the remote Apps Script project into this directory"
	@echo "  make clean      — remove generated .clasp.json"

# One-time setup: installs clasp if missing, runs `clasp login` if not already
# logged in, and interactively captures APPS_SCRIPT_ID into .env. The Apps
# Script API toggle is a manual step on Google's side — we just prompt for it.
#
# Note: don't chain this with `make deploy` in a single invocation. Make reads
# .env at parse time, so subsequent targets in the same run won't see the new
# APPS_SCRIPT_ID. Run `make setup` first, then `make deploy`.
setup:
	@command -v npm >/dev/null 2>&1 || { echo "error: npm is required but not found" >&2; exit 1; }
	@if command -v clasp >/dev/null 2>&1; then \
		echo "==> clasp already installed ($$(clasp --version))"; \
	else \
		echo "==> Installing @google/clasp globally..."; \
		npm install -g @google/clasp; \
	fi
	@if [ -f "$$HOME/.clasprc.json" ]; then \
		echo "==> clasp credentials already exist at ~/.clasprc.json"; \
	else \
		echo "==> Running 'clasp login' (a browser window will open)..."; \
		clasp login; \
	fi
	@echo ""
	@echo "==> MANUAL STEP: enable the Apps Script API at:"
	@echo "    https://script.google.com/home/usersettings"
	@echo "    (toggle 'Google Apps Script API' to ON)"
	@read -r -p "    Press return once the API is enabled... " _
	@if [ -n "$(APPS_SCRIPT_ID)" ]; then \
		echo "==> APPS_SCRIPT_ID already set in .env — skipping"; \
	else \
		echo ""; \
		echo "==> Grab your Script ID from the Apps Script editor:"; \
		echo "    gear icon -> Project Settings -> Script ID"; \
		read -r -p "    Paste it here: " sid; \
		if [ -z "$$sid" ]; then echo "error: no script id given" >&2; exit 1; fi; \
		if grep -qE '^APPS_SCRIPT_ID=' .env; then \
			sed -i.bak -E "s|^APPS_SCRIPT_ID=.*|APPS_SCRIPT_ID=\"$$sid\"|" .env && rm -f .env.bak; \
		else \
			echo "APPS_SCRIPT_ID=\"$$sid\"" >> .env; \
		fi; \
		echo "==> APPS_SCRIPT_ID saved to .env"; \
	fi
	@echo ""
	@echo "==> Setup complete."
	@echo "    Next steps:"
	@echo "      1. make setup-hash   — set PASSWORD_HASH as a Script Property"
	@echo "      2. make deploy       — push Code.gs and redeploy"

# Writes the PASSWORD_HASH into the Apps Script project's Script Properties
# so it never has to appear in Code.gs. Reads PASSWORD from .env, hashes it
# client-side (same sha256 the browser does), then uses clasp to set it.
setup-hash: .clasp.json
	@pw=$$(grep -E '^PASSWORD=' .env | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$$//'); \
	if [ -z "$$pw" ]; then echo "error: PASSWORD is empty in .env" >&2; exit 1; fi; \
	hash=$$(printf '%s' "$$pw" | shasum -a 256 | cut -d' ' -f1); \
	echo "==> Setting PASSWORD_HASH script property..."; \
	clasp run 'setPasswordHash' --params "[\"$$hash\"]" 2>/dev/null \
	|| { \
		echo ""; \
		echo "  clasp run is not available (requires OAuth or GCP project)."; \
		echo "  Set it manually instead:"; \
		echo ""; \
		echo "    Apps Script editor -> Project Settings -> Script Properties -> Add"; \
		echo "    Key:   PASSWORD_HASH"; \
		echo "    Value: $$hash"; \
		echo ""; \
	}

# Regenerates .clasp.json from .env so scriptId is always in sync.
.clasp.json: .env
	@if [ -z "$(APPS_SCRIPT_ID)" ]; then \
		echo "error: APPS_SCRIPT_ID is empty in .env" >&2; \
		echo "       Grab it from Apps Script editor -> Project Settings -> Script ID" >&2; \
		exit 1; \
	fi
	@command -v clasp >/dev/null 2>&1 || { \
		echo "error: clasp is not installed. Run: npm install -g @google/clasp" >&2; \
		exit 1; \
	}
	@printf '{\n  "scriptId": "%s",\n  "rootDir": "."\n}\n' "$(APPS_SCRIPT_ID)" > .clasp.json

push: .clasp.json
	clasp push --force

deploy: push
	@if [ -z "$(APPS_SCRIPT_DEPLOYMENT_ID)" ]; then \
		echo "error: APPS_SCRIPT_DEPLOYMENT_ID is empty in .env" >&2; \
		exit 1; \
	fi
	clasp deploy -i "$(APPS_SCRIPT_DEPLOYMENT_ID)" -d "automated deploy $$(date -u +%Y-%m-%dT%H:%M:%SZ)"

pull: .clasp.json
	clasp pull

clean:
	rm -f .clasp.json
