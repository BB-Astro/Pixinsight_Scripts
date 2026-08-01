#!/usr/bin/env bash
# PixInsight wrapper for BB StripeField's validated Hubble engine.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="${SCRIPT_DIR}/destripe_astro.py"

if [ ! -f "${ENGINE}" ]; then
    echo "ERROR: destripe_astro.py was not found at ${ENGINE}" >&2
    echo "Reinstall StripeField from the BB-Astro PixInsight repository." >&2
    exit 1
fi

PYTHON=""
CANDIDATES=(
    "${HOME}/.bb-astro/stripefield_venv/bin/python3"
    "${SCRIPT_DIR}/.venv/bin/python3"
    "/opt/homebrew/bin/python3"
    "/usr/local/bin/python3"
    "/usr/bin/python3"
    "python3"
)

HAS_DEPS='import importlib.util as u, sys; sys.exit(0 if all(u.find_spec(m) for m in ("numpy", "scipy", "astropy")) else 1)'

if [ -n "${PYTHON_EXECUTABLE:-}" ]; then
    PYTHON="${PYTHON_EXECUTABLE}"
else
    for candidate in "${CANDIDATES[@]}"; do
        resolved="$(command -v "${candidate}" 2>/dev/null)" || continue
        if "${resolved}" -c "${HAS_DEPS}" 2>/dev/null; then
            PYTHON="${resolved}"
            break
        fi
    done
fi

if [ -z "${PYTHON}" ]; then
    echo "ERROR: no Python interpreter with NumPy, SciPy and Astropy was found." >&2
    echo "Run install_stripefield.sh from this directory, or launch StripeField" >&2
    echo "again and choose Set up now." >&2
    exit 1
fi

if [ "${1:-}" = "--probe" ]; then
    echo "${PYTHON}"
    exit 0
fi

exec "${PYTHON}" "${ENGINE}" "$@"
