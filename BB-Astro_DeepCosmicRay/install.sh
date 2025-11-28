#!/bin/bash
# Installation script for BB-Astro_DeepCosmicRay PixInsight Module
# macOS / Linux

echo "======================================================================"
echo "  BB-Astro DeepCosmicRay Installation for PixInsight"
echo "======================================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check Python
echo "Checking Python installation..."
PYTHON=""
if [ -f "/opt/homebrew/bin/python3" ]; then
    PYTHON="/opt/homebrew/bin/python3"
elif command -v python3 &> /dev/null; then
    PYTHON=$(command -v python3)
fi

if [ -z "$PYTHON" ]; then
    echo -e "${RED}✗${NC} Python 3 not found"
    echo "Please install Python 3.7+ from https://www.python.org/"
    exit 1
fi

echo -e "${GREEN}✓${NC} Python 3 found: $PYTHON"

# Check Python version
PYTHON_VERSION=$($PYTHON --version 2>&1 | awk '{print $2}')
echo "  Version: $PYTHON_VERSION"

# Create dedicated virtual environment
echo ""
echo "Creating dedicated virtual environment..."
VENV_DIR="${SCRIPT_DIR}/deepcr_venv"

if [ -d "$VENV_DIR" ]; then
    echo -e "${YELLOW}!${NC} Virtual environment already exists"
    read -p "Recreate it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$VENV_DIR"
    fi
fi

if [ ! -d "$VENV_DIR" ]; then
    $PYTHON -m venv "$VENV_DIR"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Virtual environment created"
    else
        echo -e "${RED}✗${NC} Failed to create virtual environment"
        exit 1
    fi
fi

# Activate and install dependencies
echo ""
echo "Installing Python dependencies in virtual environment..."
echo "This may take a few minutes on first install..."
echo ""

source "$VENV_DIR/bin/activate"

pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Dependencies installed successfully in venv"
else
    echo -e "${RED}✗${NC} Failed to install dependencies"
    echo "Try running manually: source deepcr_venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Test DeepCR
echo ""
echo "Testing DeepCR installation..."
"$VENV_DIR/bin/python3" -c "from deepCR import deepCR; print('✓ DeepCR imported successfully')" 2>/dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} DeepCR is working in venv"
else
    echo -e "${RED}✗${NC} DeepCR import test failed"
    exit 1
fi

# Find PixInsight scripts directory
echo ""
echo "Looking for PixInsight scripts directory..."

PIXINSIGHT_SCRIPTS=""
if [ -d "$HOME/Library/Application Support/PixInsight/scripts" ]; then
    PIXINSIGHT_SCRIPTS="$HOME/Library/Application Support/PixInsight/scripts"
elif [ -d "$HOME/.local/share/PixInsight/scripts" ]; then
    PIXINSIGHT_SCRIPTS="$HOME/.local/share/PixInsight/scripts"
fi

if [ -z "$PIXINSIGHT_SCRIPTS" ]; then
    echo -e "${YELLOW}!${NC} PixInsight scripts directory not found"
    echo ""
    echo "Manual installation required:"
    echo "Copy the entire BB-Astro_DeepCosmicRay_PixInsight folder to:"
    echo "  macOS: ~/Library/Application Support/PixInsight/scripts/"
    echo "  Linux: ~/.local/share/PixInsight/scripts/"
else
    echo -e "${GREEN}✓${NC} Found: $PIXINSIGHT_SCRIPTS"

    # Create BB-Astro directory
    BB_ASTRO_DIR="$PIXINSIGHT_SCRIPTS/BB-Astro"
    mkdir -p "$BB_ASTRO_DIR"

    # Copy entire module folder
    echo ""
    echo "Copying module to PixInsight..."

    MODULE_DEST="$BB_ASTRO_DIR/BB-Astro_DeepCosmicRay"
    rm -rf "$MODULE_DEST"  # Remove old version if exists
    cp -r "$SCRIPT_DIR" "$MODULE_DEST"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Module copied to: $MODULE_DEST"
    else
        echo -e "${RED}✗${NC} Failed to copy module"
        exit 1
    fi
fi

echo ""
echo "======================================================================"
echo -e "${GREEN}Installation Complete!${NC}"
echo "======================================================================"
echo ""
echo "Virtual environment location:"
echo "  $VENV_DIR"
echo ""
echo "Next steps:"
echo "1. Restart PixInsight"
echo "2. Go to: Scripts > Utilities > BB_Astro_DeepCosmicRay"
echo "3. Open an image and run the script"
echo ""
echo "First run will download DeepCR models (~100MB)"
echo ""
echo "For support: https://github.com/bb-astro/deepcosmic"
echo "======================================================================"
