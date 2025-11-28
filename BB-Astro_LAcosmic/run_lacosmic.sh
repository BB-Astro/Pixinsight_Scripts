#!/usr/bin/env bash
# Wrapper script to run lacosmic_cli.py from PixInsight
# This works around ExternalProcess limitations

# Exit on error and pipe failures (not -u to allow unset env vars)
set -eo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Try multiple Python locations (PixInsight doesn't inherit PATH properly)
PYTHON=""

# Try in order of preference
if [ -n "${PYTHON_EXECUTABLE:-}" ]; then
    PYTHON="$PYTHON_EXECUTABLE"
elif [ -x "/opt/homebrew/bin/python3" ]; then
    PYTHON="/opt/homebrew/bin/python3"
elif [ -x "/usr/local/bin/python3" ]; then
    PYTHON="/usr/local/bin/python3"
elif [ -x "/usr/bin/python3" ]; then
    PYTHON="/usr/bin/python3"
elif command -v python3 &> /dev/null; then
    PYTHON="python3"
else
    echo "Error: Python 3 not found" >&2
    echo "Searched: /opt/homebrew/bin/python3, /usr/local/bin/python3, /usr/bin/python3" >&2
    exit 1
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
