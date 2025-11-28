#!/usr/bin/env bash
# Wrapper script to run deepcr_cli.py from PixInsight
# Part of BB-Astro_DeepCosmicRay v2.1

# Exit on error and pipe failures (not -u to allow unset env vars)
set -eo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Python executable - use dedicated venv first, then try multiple locations
VENV_PYTHON="${SCRIPT_DIR}/deepcr_venv/bin/python3"
PYTHON=""

# Try in order of preference
if [ -n "${PYTHON_EXECUTABLE:-}" ]; then
    PYTHON="$PYTHON_EXECUTABLE"
elif [ -x "${VENV_PYTHON}" ]; then
    PYTHON="${VENV_PYTHON}"
elif [ -x "/opt/homebrew/bin/python3" ]; then
    PYTHON="/opt/homebrew/bin/python3"
elif [ -x "/usr/local/bin/python3" ]; then
    PYTHON="/usr/local/bin/python3"
elif [ -x "/usr/bin/python3" ]; then
    PYTHON="/usr/bin/python3"
elif command -v python3 &> /dev/null; then
    PYTHON="python3"
fi

# Check if Python was found
if [ -z "${PYTHON}" ]; then
    echo "ERROR: Python 3 not found"
    echo "Searched: venv, /opt/homebrew/bin, /usr/local/bin, /usr/bin, PATH"
    echo "Please install Python 3 or set PYTHON_EXECUTABLE environment variable"
    exit 1
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
