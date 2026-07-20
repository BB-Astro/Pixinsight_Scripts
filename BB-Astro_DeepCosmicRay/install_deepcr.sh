#!/bin/bash
# ======================================================================
# BB-Astro DeepCosmicRay - Python environment setup
# ======================================================================
# Usually you do not run this by hand: launch DeepCosmicRay in PixInsight and
# click "Set up now" when it reports the environment is missing. It runs this
# script with --yes and shows the output in the Console.
#
# Creates ~/.bb-astro/deepcr_venv, which is the interpreter that
# run_deepcr.sh and BB_DeepCosmicRay.js look for first.
#
# Usage: install_deepcr.sh [-y|--yes]
# ======================================================================

set -o pipefail

# --yes never prompts. Required when launched from PixInsight, where there is
# no terminal to answer on and a read would hang the script forever.
ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
        -y|--yes) ASSUME_YES=1 ;;
        -h|--help)
            echo "Usage: install_deepcr.sh [-y|--yes]"
            echo "  -y, --yes   Never prompt. An existing environment is kept"
            echo "              and its packages are updated."
            exit 0
            ;;
        *)
            echo "Unknown option: $arg" >&2
            echo "Usage: install_deepcr.sh [-y|--yes]" >&2
            exit 1
            ;;
    esac
done

# Colours only when writing to a terminal. Piped into PixInsight's Console the
# escape sequences would show up as literal garbage.
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

echo ""
echo "======================================================================"
echo "  BB-Astro DeepCosmicRay - Python Environment Setup"
echo "======================================================================"
echo ""

INSTALL_DIR="${HOME}/.bb-astro"
VENV_DIR="${INSTALL_DIR}/deepcr_venv"

# Packages. deepcr publishes no wheels and declares no dependencies at all,
# so matplotlib (imported by deepCR/training.py at package import time) has
# to be listed explicitly or "from deepCR import deepCR" raises
# ModuleNotFoundError.
PACKAGES="numpy astropy xisf deepcr torch torchvision matplotlib"

# ======================================================================
# Step 1: Find a usable interpreter
# ======================================================================
# The version window is narrow and both ends are hard limits:
#   >= 3.10  torch requires_python is ">=3.10"
#   <= 3.11  deepcr ships an sdist only, and its setup.py uses ast.Str.s,
#            removed in Python 3.12. Building it on 3.12+ fails with
#            "AttributeError: 'Constant' object has no attribute 's'".
echo -e "${BLUE}[1/4]${NC} Looking for Python 3.10 or 3.11..."

PYTHON=""
USE_UV=0

version_ok() {
    # $1 = interpreter path. Succeeds when 3.10 <= version <= 3.11
    "$1" -c 'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,11) else 1)' 2>/dev/null
}

CANDIDATES=(
    "${BB_ASTRO_PYTHON:-}"
    python3.11
    python3.10
    /opt/homebrew/bin/python3.11
    /opt/homebrew/bin/python3.10
    /opt/homebrew/opt/python@3.11/bin/python3.11
    /opt/homebrew/opt/python@3.10/bin/python3.10
    /usr/local/bin/python3.11
    /usr/local/bin/python3.10
    /usr/bin/python3.11
    /usr/bin/python3.10
    python3
)

for candidate in "${CANDIDATES[@]}"; do
    [ -z "$candidate" ] && continue
    resolved=$(command -v "$candidate" 2>/dev/null) || continue
    if version_ok "$resolved"; then
        PYTHON="$resolved"
        break
    fi
done

if [ -z "$PYTHON" ] && command -v uv &> /dev/null; then
    # uv can fetch a standalone CPython 3.11 without touching the system.
    USE_UV=1
    echo -e "${YELLOW}!${NC} No system Python 3.10/3.11 found, using uv to fetch CPython 3.11"
fi

if [ -z "$PYTHON" ] && [ "$USE_UV" -eq 0 ]; then
    echo -e "${RED}ERROR:${NC} No Python 3.10 or 3.11 found."
    echo ""
    echo "DeepCR needs an interpreter in that range:"
    echo "  - torch requires Python >= 3.10"
    echo "  - deepcr's setup.py fails to build on Python >= 3.12"
    echo ""
    echo "Install one, then run this script again:"
    echo "  macOS:  brew install python@3.11"
    echo "  Linux:  sudo apt install python3.11 python3.11-venv"
    echo ""
    echo "Or install uv (https://docs.astral.sh/uv/) and re-run: this script"
    echo "will then fetch a standalone CPython 3.11 by itself."
    echo ""
    echo "You can also point the script at a specific interpreter:"
    echo "  BB_ASTRO_PYTHON=/path/to/python3.11 ./install_deepcr.sh"
    exit 1
fi

if [ "$USE_UV" -eq 0 ]; then
    echo -e "${GREEN}OK${NC} Using $PYTHON ($($PYTHON --version 2>&1 | awk '{print $2}'))"
fi

# ======================================================================
# Step 2: Create the virtual environment
# ======================================================================
echo ""
echo -e "${BLUE}[2/4]${NC} Creating virtual environment..."

mkdir -p "$INSTALL_DIR"

if [ -d "$VENV_DIR" ]; then
    echo -e "${YELLOW}!${NC} Virtual environment already exists at $VENV_DIR"
    if [ "$ASSUME_YES" -eq 1 ]; then
        echo "   Keeping it, packages will be updated."
    else
        read -p "   Recreate it? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "   Removing old venv..."
            rm -rf "$VENV_DIR"
        else
            echo "   Keeping existing venv, will update packages..."
        fi
    fi
fi

if [ ! -d "$VENV_DIR" ]; then
    echo "   Creating venv at $VENV_DIR ..."
    if [ "$USE_UV" -eq 1 ]; then
        uv venv --python 3.11 "$VENV_DIR" || {
            echo -e "${RED}ERROR:${NC} uv failed to create the virtual environment"
            exit 1
        }
    else
        "$PYTHON" -m venv "$VENV_DIR" || {
            echo -e "${RED}ERROR:${NC} Failed to create virtual environment"
            echo "   On Debian/Ubuntu you may need: sudo apt install python3.11-venv"
            exit 1
        }
    fi
fi

VENV_PYTHON="$VENV_DIR/bin/python3"
if [ ! -x "$VENV_PYTHON" ]; then
    echo -e "${RED}ERROR:${NC} $VENV_PYTHON not found after venv creation"
    exit 1
fi

echo -e "${GREEN}OK${NC} Virtual environment ready ($("$VENV_PYTHON" --version 2>&1 | awk '{print $2}'))"

# ======================================================================
# Step 3: Install the Python packages
# ======================================================================
echo ""
echo -e "${BLUE}[3/4]${NC} Installing Python packages..."
echo "   This may take a few minutes and needs about 850 MB (torch is large)."
echo ""

if [ "$USE_UV" -eq 1 ]; then
    # shellcheck disable=SC2086
    uv pip install --python "$VENV_PYTHON" $PACKAGES
    INSTALL_STATUS=$?
else
    "$VENV_PYTHON" -m pip install --upgrade pip > /dev/null 2>&1
    # shellcheck disable=SC2086
    "$VENV_PYTHON" -m pip install $PACKAGES
    INSTALL_STATUS=$?
fi

if [ $INSTALL_STATUS -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR:${NC} Failed to install packages"
    echo "   Retry manually:"
    echo "   $VENV_PYTHON -m pip install $PACKAGES"
    exit 1
fi

echo ""
echo -e "${GREEN}OK${NC} Python packages installed"

# ======================================================================
# Step 4: Verify the models load
# ======================================================================
# The weights ship inside the deepcr package (learned_models, about 5 MB),
# nothing is downloaded. This step only proves the whole chain imports and
# that both models the script uses are actually present.
echo ""
echo -e "${BLUE}[4/4]${NC} Verifying DeepCR models..."
echo ""

"$VENV_PYTHON" - <<'PYTHON_SCRIPT'
import sys
import warnings

warnings.filterwarnings("ignore")

try:
    from deepCR import deepCR
except Exception as exc:
    print(f"   ERROR: cannot import deepCR: {exc}")
    sys.exit(1)

# Model names used by deepcr_cli.py. Anything not in deepCR's mask_dict is
# treated as a file path and raises FileNotFoundError.
for name in ("ACS-WFC", "WFC3-UVIS"):
    try:
        deepCR(mask=name, device="CPU")
        print(f"   {name}: OK")
    except Exception as exc:
        print(f"   ERROR: model {name} failed to load: {exc}")
        sys.exit(1)
PYTHON_SCRIPT

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR:${NC} Model verification failed, see the message above."
    exit 1
fi

echo ""
echo -e "${GREEN}OK${NC} DeepCR ready"

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
echo "To use DeepCosmicRay in PixInsight:"
echo "  1. Restart PixInsight"
echo "  2. Open an image"
echo "  3. Go to: Script > BB-Astro > DeepCosmicRay"
echo ""
echo "For support: www.bb-astro.com"
echo "======================================================================"
echo ""
