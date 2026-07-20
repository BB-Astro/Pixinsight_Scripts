#!/bin/bash
# ======================================================================
# BB-Astro LAcosmic - Python environment setup
# ======================================================================
# Run this AFTER installing the script through the PixInsight repository
# (Resources > Updates). The PixInsight updater only extracts files, it
# never runs this script.
#
# Creates ~/.bb-astro/lacosmic_venv, which is the interpreter that
# run_lacosmic.sh and BB-Astro_LAcosmic.js look for first.
#
# A virtual environment is mandatory here, not a convenience: Homebrew and
# most Linux distributions mark their Python as externally managed (PEP 668),
# so "pip install --user astroscrappy" is refused outright.
# ======================================================================

set -o pipefail

echo ""
echo "======================================================================"
echo "  BB-Astro LAcosmic - Python Environment Setup"
echo "======================================================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="${HOME}/.bb-astro"
VENV_DIR="${INSTALL_DIR}/lacosmic_venv"
PACKAGES="numpy astropy astroscrappy"

# ======================================================================
# Step 1: Find an interpreter
# ======================================================================
# astroscrappy publishes wheels for CPython 3.10 through 3.14, so any
# reasonably current Python 3 works. Only a floor is enforced.
echo -e "${BLUE}[1/3]${NC} Looking for Python 3..."

PYTHON=""

version_ok() {
    "$1" -c 'import sys; sys.exit(0 if sys.version_info[:2] >= (3,9) else 1)' 2>/dev/null
}

CANDIDATES=(
    "${BB_ASTRO_PYTHON:-}"
    /opt/homebrew/bin/python3
    /usr/local/bin/python3
    python3
    /usr/bin/python3
)

for candidate in "${CANDIDATES[@]}"; do
    [ -z "$candidate" ] && continue
    resolved=$(command -v "$candidate" 2>/dev/null) || continue
    if version_ok "$resolved"; then
        PYTHON="$resolved"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo -e "${RED}ERROR:${NC} No Python 3.9 or later found."
    echo ""
    echo "Install one, then run this script again:"
    echo "  macOS:  brew install python3"
    echo "  Linux:  sudo apt install python3 python3-venv"
    echo ""
    echo "Or point the script at a specific interpreter:"
    echo "  BB_ASTRO_PYTHON=/path/to/python3 ./install_lacosmic.sh"
    exit 1
fi

echo -e "${GREEN}OK${NC} Using $PYTHON ($($PYTHON --version 2>&1 | awk '{print $2}'))"

# ======================================================================
# Step 2: Create the virtual environment and install packages
# ======================================================================
echo ""
echo -e "${BLUE}[2/3]${NC} Creating virtual environment..."

mkdir -p "$INSTALL_DIR"

if [ -d "$VENV_DIR" ]; then
    echo -e "${YELLOW}!${NC} Virtual environment already exists at $VENV_DIR"
    read -p "   Recreate it? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "   Removing old venv..."
        rm -rf "$VENV_DIR"
    else
        echo "   Keeping existing venv, will update packages..."
    fi
fi

if [ ! -d "$VENV_DIR" ]; then
    echo "   Creating venv at $VENV_DIR ..."
    "$PYTHON" -m venv "$VENV_DIR" || {
        echo -e "${RED}ERROR:${NC} Failed to create virtual environment"
        echo "   On Debian/Ubuntu you may need: sudo apt install python3-venv"
        exit 1
    }
fi

VENV_PYTHON="$VENV_DIR/bin/python3"
if [ ! -x "$VENV_PYTHON" ]; then
    echo -e "${RED}ERROR:${NC} $VENV_PYTHON not found after venv creation"
    exit 1
fi

echo -e "${GREEN}OK${NC} Virtual environment ready"
echo ""
echo "   Installing $PACKAGES ..."
echo ""

"$VENV_PYTHON" -m pip install --upgrade pip > /dev/null 2>&1
# shellcheck disable=SC2086
"$VENV_PYTHON" -m pip install $PACKAGES

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR:${NC} Failed to install packages"
    echo "   Retry manually:"
    echo "   $VENV_PYTHON -m pip install $PACKAGES"
    exit 1
fi

echo ""
echo -e "${GREEN}OK${NC} Python packages installed"

# ======================================================================
# Step 3: Verify
# ======================================================================
echo ""
echo -e "${BLUE}[3/3]${NC} Verifying installation..."

"$VENV_PYTHON" -c "import astroscrappy, astropy, numpy; print('   astroscrappy', astroscrappy.__version__, '| astropy', astropy.__version__, '| numpy', numpy.__version__)"

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR:${NC} Import test failed"
    exit 1
fi

echo ""
echo -e "${GREEN}OK${NC} LAcosmic ready"

# ======================================================================
# Done
# ======================================================================
echo ""
echo "======================================================================"
echo -e "${GREEN}  Installation Complete!${NC}"
echo "======================================================================"
echo ""
echo "Virtual environment:"
echo "  $VENV_DIR"
echo ""
echo "To use LAcosmic in PixInsight:"
echo "  1. Restart PixInsight"
echo "  2. Open an image"
echo "  3. Go to: Script > BB-Astro > LAcosmic"
echo ""
echo "For support: www.bb-astro.com"
echo "======================================================================"
echo ""
