#!/usr/bin/env python3
"""
Test script for BB-Astro_DeepCosmicRay installation
Verifies all dependencies are correctly installed
"""

import sys

def test_imports():
    """Test all required imports"""
    print("BB-Astro DeepCosmicRay Installation Test")
    print("="*60)

    errors = []

    # Test Python version
    print(f"\n1. Python version: {sys.version}")
    if sys.version_info < (3, 7):
        errors.append("Python 3.7+ required")
        print("   ❌ FAIL: Python 3.7+ required")
    else:
        print("   ✅ OK")

    # Test numpy
    print("\n2. Testing numpy...")
    try:
        import numpy as np
        print(f"   Version: {np.__version__}")
        print("   ✅ OK")
    except ImportError as e:
        errors.append(f"numpy import failed: {e}")
        print("   ❌ FAIL")

    # Test astropy
    print("\n3. Testing astropy...")
    try:
        import astropy
        print(f"   Version: {astropy.__version__}")
        print("   ✅ OK")
    except ImportError as e:
        errors.append(f"astropy import failed: {e}")
        print("   ❌ FAIL")

    # Test torch
    print("\n4. Testing PyTorch...")
    try:
        import torch
        print(f"   Version: {torch.__version__}")
        print("   ✅ OK")
    except ImportError as e:
        errors.append(f"PyTorch import failed: {e}")
        print("   ❌ FAIL")

    # Test DeepCR
    print("\n5. Testing DeepCR...")
    try:
        from deepCR import deepCR
        print("   ✅ OK - DeepCR imported successfully")

        # Try to load a model
        print("\n6. Testing DeepCR model loading...")
        try:
            mdl = deepCR(mask="WFC3-UVIS", device="CPU")
            print("   ✅ OK - WFC3-UVIS model loaded")
            print("   (First time may download ~100MB of models)")
        except Exception as e:
            errors.append(f"Model loading failed: {e}")
            print(f"   ❌ FAIL: {e}")

    except ImportError as e:
        errors.append(f"DeepCR import failed: {e}")
        print("   ❌ FAIL")

    # Summary
    print("\n" + "="*60)
    if errors:
        print("❌ INSTALLATION INCOMPLETE")
        print("\nErrors found:")
        for error in errors:
            print(f"  - {error}")
        print("\nTo fix, run:")
        print("  python3 -m pip install --user deepCR astropy numpy torch scikit-image")
        return 1
    else:
        print("✅ ALL TESTS PASSED")
        print("\nBB-Astro_DeepCosmicRay is ready to use!")
        print("You can now use the module in PixInsight.")
        return 0

if __name__ == "__main__":
    sys.exit(test_imports())
