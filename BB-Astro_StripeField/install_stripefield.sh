#!/usr/bin/env bash
# BB-Astro StripeField Python environment setup for macOS and Linux.

set -o pipefail

ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
        -y|--yes) ASSUME_YES=1 ;;
        -h|--help)
            echo "Usage: install_stripefield.sh [-y|--yes]"
            echo "  -y, --yes   Never prompt; update an existing environment"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg" >&2
            echo "Usage: install_stripefield.sh [-y|--yes]" >&2
            exit 1
            ;;
    esac
done

if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUIREMENTS="${SCRIPT_DIR}/requirements.txt"
INSTALL_DIR="${HOME}/.bb-astro"
VENV_DIR="${INSTALL_DIR}/stripefield_venv"

echo ""
echo "======================================================================"
echo "  BB-Astro StripeField - Python Environment Setup"
echo "======================================================================"
echo ""

if [ ! -f "${REQUIREMENTS}" ]; then
    echo -e "${RED}ERROR:${NC} requirements.txt was not found at ${REQUIREMENTS}"
    echo "Reinstall StripeField from the BB-Astro PixInsight repository."
    exit 1
fi

version_ok() {
    "$1" -c 'import sys; sys.exit(0 if sys.version_info[:2] >= (3, 10) else 1)' 2>/dev/null
}

echo -e "${BLUE}[1/4]${NC} Looking for Python 3.10 or later..."

PYTHON=""
CANDIDATES=(
    "${BB_ASTRO_PYTHON:-}"
    python3.13
    python3.12
    python3.11
    python3.10
    /opt/homebrew/bin/python3
    /usr/local/bin/python3
    /usr/bin/python3
    python3
)

for candidate in "${CANDIDATES[@]}"; do
    [ -z "${candidate}" ] && continue
    resolved="$(command -v "${candidate}" 2>/dev/null)" || continue
    if version_ok "${resolved}"; then
        PYTHON="${resolved}"
        break
    fi
done

if [ -z "${PYTHON}" ]; then
    echo -e "${RED}ERROR:${NC} Python 3.10 or later was not found."
    echo ""
    echo "Install Python, then run this setup again:"
    echo "  macOS:          brew install python"
    echo "  Debian/Ubuntu:  sudo apt install python3 python3-venv"
    echo ""
    echo "Or select an interpreter explicitly:"
    echo "  BB_ASTRO_PYTHON=/path/to/python3 ./install_stripefield.sh"
    exit 1
fi

echo -e "${GREEN}OK${NC} Using ${PYTHON} ($(${PYTHON} --version 2>&1))"

echo ""
echo -e "${BLUE}[2/4]${NC} Preparing the virtual environment..."
mkdir -p "${INSTALL_DIR}"

if [ -d "${VENV_DIR}" ]; then
    echo -e "${YELLOW}!${NC} Existing environment found at ${VENV_DIR}"
    if [ "${ASSUME_YES}" -eq 1 ]; then
        echo "   Keeping it and updating its packages."
    else
        printf "   Keep it and update its packages? [Y/n] "
        read -r reply
        case "${reply}" in
            n|N|no|NO|No)
                echo "Setup canceled. The existing environment was not changed."
                exit 0
                ;;
        esac
    fi
else
    "${PYTHON}" -m venv "${VENV_DIR}" || {
        echo -e "${RED}ERROR:${NC} Failed to create ${VENV_DIR}"
        echo "On Debian/Ubuntu, install python3-venv and try again."
        exit 1
    }
fi

VENV_PYTHON="${VENV_DIR}/bin/python3"
if [ ! -x "${VENV_PYTHON}" ]; then
    echo -e "${RED}ERROR:${NC} ${VENV_PYTHON} was not created."
    exit 1
fi
echo -e "${GREEN}OK${NC} Virtual environment ready"

echo ""
echo -e "${BLUE}[3/4]${NC} Installing NumPy, SciPy and Astropy..."
"${VENV_PYTHON}" -m pip install --upgrade pip
"${VENV_PYTHON}" -m pip install --upgrade -r "${REQUIREMENTS}"
if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR:${NC} Package installation failed."
    echo "Retry with:"
    echo "  ${VENV_PYTHON} -m pip install -r \"${REQUIREMENTS}\""
    exit 1
fi

echo ""
echo -e "${BLUE}[4/4]${NC} Verifying the scientific engine..."
"${VENV_PYTHON}" -c \
    'import numpy, scipy, astropy; print("NumPy", numpy.__version__); print("SciPy", scipy.__version__); print("Astropy", astropy.__version__)'
if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR:${NC} The installed packages could not be imported."
    exit 1
fi

echo ""
echo "======================================================================"
echo -e "${GREEN}  StripeField setup complete${NC}"
echo "======================================================================"
echo "Environment: ${VENV_DIR}"
echo "Restart StripeField from Script > BB-Astro > StripeField."
echo ""
