#!/usr/bin/env bash
# Wrapper script to run deepcr_cli.py from PixInsight
# Part of BB-Astro_DeepCosmicRay

# Exit on error and pipe failures (not -u to allow unset env vars)
set -eo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Python executable. PixInsight does not inherit the user's PATH, and deepcr
# only builds on Python 3.10/3.11, so in practice the venv created by
# install_deepcr.sh is the only interpreter that works. Candidates are probed in
# order and the first one that actually has the packages wins; picking the
# first interpreter that merely exists is what made the script fail with a
# working Python but no dependencies.
#
# The venv lives in ~/.bb-astro so PixInsight does not scan thousands of files.
PYTHON=""

CANDIDATES=(
    "${HOME}/.bb-astro/deepcr_venv/bin/python3"
    "/opt/homebrew/bin/python3"
    "/usr/local/bin/python3"
    "/usr/bin/python3"
    "python3"
)

# find_spec only walks sys.path, it does not import torch, so probing several
# interpreters stays cheap.
HAS_DEPS='import importlib.util as u, sys; sys.exit(0 if all(u.find_spec(m) for m in ("deepCR", "torch", "xisf")) else 1)'

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

if [ -z "${PYTHON}" ]; then
    echo "ERROR: no Python 3 with deepCR, torch and xisf was found" >&2
    echo "Searched: ~/.bb-astro/deepcr_venv, /opt/homebrew/bin, /usr/local/bin," >&2
    echo "          /usr/bin, PATH" >&2
    echo "Run install_deepcr.sh from this directory to create the environment," >&2
    echo "or set PYTHON_EXECUTABLE to an interpreter that has the packages." >&2
    exit 1
fi

# Probe mode: print the selected interpreter and exit. BB_DeepCosmicRay.js
# calls this before showing its dialog so interpreter selection has a single
# implementation instead of one here and a diverging copy in the script.
if [ "${1:-}" = "--probe" ]; then
    echo "${PYTHON}"
    exit 0
fi

# CLI script
CLI_SCRIPT="${SCRIPT_DIR}/deepcr_cli.py"

# Check if CLI script exists
if [ ! -f "${CLI_SCRIPT}" ]; then
    echo "ERROR: deepcr_cli.py not found at ${CLI_SCRIPT}"
    exit 1
fi

# Execute Python with all arguments passed through
exec "${PYTHON}" "${CLI_SCRIPT}" "$@"
