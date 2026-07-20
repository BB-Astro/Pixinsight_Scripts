#!/usr/bin/env bash
# Wrapper script to run lacosmic_cli.py from PixInsight
# This works around ExternalProcess limitations

# Exit on error and pipe failures (not -u to allow unset env vars)
set -eo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Python executable. PixInsight does not inherit the user's PATH, and on
# macOS/Homebrew or a modern Linux the system interpreter is externally
# managed (PEP 668), so astroscrappy can only live in a venv. Candidates are
# probed in order and the first one that actually has the packages wins;
# picking the first interpreter that merely exists is what made the script
# fail with a working Python but no dependencies.
#
# Venvs live in ~/.bb-astro so PixInsight does not scan thousands of files.
PYTHON=""

CANDIDATES=(
    "${HOME}/.bb-astro/lacosmic_venv/bin/python3"
    "${HOME}/.bb-astro/deepcr_venv/bin/python3"
    "/opt/homebrew/bin/python3"
    "/usr/local/bin/python3"
    "/usr/bin/python3"
    "python3"
)

# find_spec only walks sys.path, it does not import astropy, so probing
# several interpreters stays cheap.
HAS_DEPS='import importlib.util as u, sys; sys.exit(0 if all(u.find_spec(m) for m in ("astroscrappy", "astropy", "numpy")) else 1)'

if [ -n "${PYTHON_EXECUTABLE:-}" ]; then
    # Explicit override, used as-is without probing.
    PYTHON="$PYTHON_EXECUTABLE"
else
    for candidate in "${CANDIDATES[@]}"; do
        resolved=$(command -v "$candidate" 2>/dev/null) || continue
        if "$resolved" -c "$HAS_DEPS" 2>/dev/null; then
            PYTHON="$resolved"
            break
        fi
    done
fi

if [ -z "$PYTHON" ]; then
    echo "Error: no Python 3 with astroscrappy, astropy and numpy was found" >&2
    echo "Searched: ~/.bb-astro/lacosmic_venv, ~/.bb-astro/deepcr_venv," >&2
    echo "          /opt/homebrew/bin, /usr/local/bin, /usr/bin, PATH" >&2
    echo "Run install_lacosmic.sh from this directory to create the environment," >&2
    echo "or set PYTHON_EXECUTABLE to an interpreter that has the packages." >&2
    exit 1
fi

# Probe mode: print the selected interpreter and exit. BB-Astro_LAcosmic.js
# calls this before showing its dialog so interpreter selection has a single
# implementation instead of one here and a diverging copy in the script.
if [ "${1:-}" = "--probe" ]; then
    echo "$PYTHON"
    exit 0
fi

# CLI script
CLI_SCRIPT="${SCRIPT_DIR}/lacosmic_cli.py"

# Verify CLI script exists
if [ ! -f "$CLI_SCRIPT" ]; then
    echo "Error: lacosmic_cli.py not found at $CLI_SCRIPT" >&2
    exit 1
fi

# Execute Python with all arguments passed through
exec "$PYTHON" "$CLI_SCRIPT" "$@"
