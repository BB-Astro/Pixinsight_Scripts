# BB-Astro DeepCosmicRay

**Deep Learning Cosmic Ray Removal for PixInsight**

[![Version](https://img.shields.io/badge/version-2.1-blue)](https://github.com/benoitblanco/deepcosmic/releases)
[![License](https://img.shields.io/badge/license-CC_BY--NC--SA_4.0-orange)](LICENSE)
[![PixInsight](https://img.shields.io/badge/PixInsight-Compatible-green)](https://pixinsight.com)
[![Python](https://img.shields.io/badge/python-3.7+-blue)](https://www.python.org)

Professional cosmic ray detection and removal using state-of-the-art deep learning ([DeepCR](https://github.com/profjsb/deepCR) by Zhang & Bloom 2020).

![Module Interface](screenshots/Script_Interface.png)
*User interface with presets, threshold control, and process icon triangle*

![Arp204 Before](screenshots/Arp204_In.tif)
*Arp204 example: Original image showing cosmic rays before processing*

![Arp204 After](screenshots/Arp204_Out.tif)
*Arp204 cleaned: Image after DeepCR processing with cosmic rays removed*

---

## What is DeepCR?

DeepCR uses a **convolutional neural network** trained on 15,000+ real Hubble Space Telescope images with hand-labeled cosmic rays. Unlike traditional algorithms (L.A.Cosmic, sigma clipping), DeepCR learns from real data to distinguish:

✅ Real cosmic rays (sharp, isolated events)
✅ Hot pixels and detector artifacts
❌ Stars (preserves them!)
❌ Galaxies and extended sources
❌ Image noise

**Result**: Superior accuracy with fewer false positives, optimized for 32-bit float images.

---

## Features

- 🧠 **Deep Learning**: Trained on 15,000+ HST images
- ⚡ **Native XISF**: Processes PixInsight's native format directly (no FITS conversion!)
- 📐 **Process Icons**: Save configurations for batch processing
- 🎯 **4 Ready Presets**: Optimal, Aggressive, Conservative, ACS-WFC
- 🎨 **Clean Interface**: Simple parameters, comprehensive help
- 🚀 **Fast**: ~10-15 seconds per typical image
- 💾 **Quality Control**: Optional cosmic ray mask generation

---

## Installation

### Requirements

- **PixInsight**: Any recent version with script support
- **Python**: 3.7 or later
- **OS**: macOS or Linux (Windows: manual Python setup needed)
- **RAM**: 4GB minimum, 8GB recommended
- **Disk**: 500MB for models and dependencies
- **Internet**: First run downloads DeepCR models (~100MB)

### Quick Install

1. **Download** the [latest release](https://github.com/benoitblanco/deepcosmic/releases/latest)

2. **Extract** the ZIP file

3. **Open Terminal** and navigate to the folder:
   ```bash
   cd BB-Astro_DeepCosmicRay
   ```

4. **Run installer**:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

   This will:
   - Check Python installation
   - Create virtual environment
   - Install dependencies (DeepCR, PyTorch, xisf, etc.)
   - Copy module to PixInsight scripts folder (macOS/Linux)

5. **Restart PixInsight**

6. **Find the module**:
   Scripts → BB-Astro → **DeepCosmicRay**

### Verify Installation

```bash
python3 test_installation.py
```

Should show: `✅ ALL TESTS PASSED`

---

## Usage

### Basic Workflow

1. **Open an image** in PixInsight (XISF or FITS, 16-bit or 32-bit)

2. **Run the module**:
   Scripts → BB-Astro → DeepCosmicRay

3. **Choose a preset**:
   - **Optimal** (recommended for most images)
   - Aggressive (maximum CR detection)
   - Conservative (minimal false positives)
   - ACS Default (for HST ACS-WFC data)

4. **Click Execute**

5. **Wait ~10-15 seconds**

6. **New window appears** with cleaned image

**First run**: Downloads models (~100MB), subsequent runs are fast.

### Understanding Presets

| Preset | Threshold | Detection Rate | Best For |
|--------|-----------|----------------|----------|
| **Optimal** ⭐ | 0.10 | 0.5-0.6% | Most 32-bit images (recommended) |
| Aggressive | 0.05 | 1.0-1.2% | Heavy CR contamination (check for false positives) |
| Conservative | 0.20 | 0.2-0.3% | Preserving faint sources |
| ACS Default | 0.50 | <0.1% | HST ACS-WFC specific data |

### Advanced: Batch Processing with Process Icons

**Save your configuration**:
1. Configure parameters (Preset, Threshold, Options)
2. Click the **triangle button** (📐) in bottom-left
3. Drag icon to desktop, save as `.xpsm` file

**Use saved configuration**:
- **Double-click icon**: Opens module with saved parameters
- **Drag onto image**: Processes directly without dialog (batch mode!)

**Time saved**: 50-70% when processing multiple images

---

## Parameters Guide

### Model Selection

**WFC3-UVIS** (recommended):
- More sensitive to faint cosmic rays
- Works well on 32-bit float images
- Best for most astrophotography

**ACS-WFC**:
- Alternative model for specific datasets
- More conservative (use threshold 0.5)

### Threshold (0.05 - 0.50)

**Lower values** (0.05-0.10):
- Detect more cosmic rays
- Risk of flagging faint stars
- Use for heavy CR contamination

**Medium values** (0.10-0.20) ⭐:
- Balanced detection
- Recommended for most work
- **Start here!**

**Higher values** (0.20-0.50):
- Conservative, fewer false positives
- May miss faint cosmic rays
- Use when preserving photometry critical

### Options

**Save cosmic ray mask**:
- Creates separate window showing detected CRs (white pixels)
- Useful for quality control
- Check to verify no stars are flagged

**Replace active window**:
- Updates current image instead of creating new window
- Use when you want to modify original

---

## Recommended Settings by Image Type

### 32-bit Float Images (Most Common)
```
Preset: Optimal
Model: WFC3-UVIS
Threshold: 0.1
```
Expected: 0.4-0.6% of pixels detected

### Space Telescope (HST/JWST)
```
Preset: Optimal or ACS Default
Threshold: 0.1-0.2
```

### Ground-Based Long Exposures
```
Preset: Optimal
Threshold: 0.10-0.15
```

### Images with Faint Sources
```
Preset: Conservative
Threshold: 0.2
```

---

## Comparison with L.A.Cosmic

| Feature | L.A.Cosmic | DeepCR (this module) |
|---------|------------|----------------------|
| Method | Edge detection | Deep learning |
| Training | Algorithm-based | 15,000+ HST images |
| Accuracy | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| False positives | Can flag faint stars | Very few |
| 32-bit support | Needs rescaling | Native optimized |
| Parameters | 8+ complex params | 2 simple params |
| Speed | ~5-10 sec | ~10-15 sec |

**Recommendation**: Use DeepCR for best quality, especially on 32-bit images.

---

## Troubleshooting

### "Python 3 not found"
Install Python from [python.org](https://www.python.org) or:
```bash
brew install python3  # macOS with Homebrew
```

### "DeepCR not installed"
Run manually:
```bash
python3 -m pip install --user deepCR astropy numpy torch xisf
```

### "Wrapper script not found"
Ensure all files are in same directory:
- BB_DeepCosmicRay.js
- deepcr_cli.py
- run_deepcr.sh

Edit `run_deepcr.sh` if needed to update Python path.

### First run very slow
Normal - downloads DeepCR models (~100MB) on first use. Subsequent runs are fast.

### Too many stars flagged
Increase threshold (try 0.15 or 0.2) or use Conservative preset.

### Missing cosmic rays
Decrease threshold (try 0.05 or 0.08) or use Aggressive preset.

---

## Technical Details

### How It Works

1. **Export**: Active PixInsight image exported to temporary XISF file
2. **Process**: Python script loads image and runs DeepCR neural network
3. **Detect**: Network predicts cosmic ray probability for each pixel
4. **Threshold**: Pixels above threshold flagged as cosmic rays
5. **Inpaint**: Detected pixels replaced using neighbor interpolation
6. **Import**: Cleaned image loaded back into PixInsight
7. **Cleanup**: Temporary files removed automatically

### Supported Formats

- **XISF** (native PixInsight format) - recommended
- **FITS** (16-bit or 32-bit) - compatible

### Performance

| Image Size | Processing Time |
|------------|-----------------|
| 2MP (1500×1500) | ~3 seconds |
| 6MP (2500×2500) | ~6 seconds |
| 15MP (4000×4000) | ~15 seconds |
| 30MP (5500×5500) | ~30 seconds |

**Typical detection**: 0.4-0.6% of pixels at optimal threshold (0.1)

---

## When to Use

### ✅ Recommended For:
- Single light frames before stacking
- 32-bit float images
- Space telescope data (HST, JWST)
- Ground-based long exposures
- Images with visible cosmic rays

### ❌ Not Recommended For:
- Already stacked images (CRs averaged out)
- Very short exposures (<5 seconds)
- Planetary/lunar imaging

### Workflow Position:
Apply **after calibration** (darks/flats/bias) and **before stacking**.

---

## Examples

### User Interface

![Module Interface](screenshots/Script_Interface.png)

The interface shows:
- **Preset selector**: Choose from 4 ready-to-use configurations
- **Model selection**: WFC3-UVIS (recommended) or ACS-WFC
- **Threshold control**: Adjustable detection sensitivity (0.05-0.50)
- **Options**: Save cosmic ray mask, Replace active window
- **Triangle button** (📐): Create process icons for batch processing
- **Help button**: In-app documentation

### Results Example: Arp204

![Arp204 Original](screenshots/Arp204_In.tif)
*Original image with cosmic rays*

![Arp204 Cleaned](screenshots/Arp204_Out.tif)
*Cleaned image after DeepCR processing*

This example shows:
- **Effective cosmic ray removal** while preserving galaxy structure
- **Preset used**: Optimal (WFC3-UVIS, threshold 0.1)
- Processing demonstrates the quality of deep learning detection

### Example 1: Single Image Processing
```
1. Open your image (e.g., Arp204.xisf) in PixInsight
2. Scripts → BB-Astro → DeepCosmicRay
3. Select "Optimal" preset
4. Click Execute
5. Wait ~10 seconds
6. Result: Cosmic rays removed
   - Original image preserved
   - New window "Arp204_DeepCR" created
   - Stars and galaxies untouched
```

### Example 2: Batch Processing 20 Images
```
1. Configure module with Optimal preset
2. Click triangle (📐) button in bottom-left
3. Save icon as "DeepCR_Optimal.xpsm"
4. For each of your 20 images:
   - Open image in PixInsight
   - Drag saved icon onto the image
   - Processing runs automatically (no dialog!)
   - Result window appears after ~10-15 seconds
5. Total time: ~5-10 minutes
   vs. ~40 minutes configuring manually each time
```

**Time saved with process icons**: 50-70% for batch processing!

---

## Citation

If you use this module in your research or published astrophotography, please cite:

### DeepCR Paper (required):
```
Zhang, K., & Bloom, J. S. (2020).
Identifying Cosmic Rays in Astronomical Images Using Deep Learning.
The Astrophysical Journal, 889(1), 24.
DOI: 10.3847/1538-4357/ab3fa6
```

### This Module (optional):
```
Blanco, B. (2025).
BB-Astro DeepCosmicRay: PixInsight Module for Deep Learning Cosmic Ray Removal.
https://github.com/benoitblanco/deepcosmic
```

BibTeX available in [CITATION.cff](CITATION.cff)

---

## License

### Module Wrapper
**Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International**
Copyright © 2025 Benoit Blanco

You are free to:
- ✅ **Share**: Copy and redistribute
- ✅ **Adapt**: Modify and build upon

Under these terms:
- 📝 **Attribution**: Credit Benoit Blanco
- 🚫 **NonCommercial**: No commercial use without permission
- 🔄 **ShareAlike**: Distribute modifications under same license

### DeepCR Library
**BSD-3-Clause License**
Copyright © 2019 The Regents of the University of California

See [LICENSE](LICENSE) for complete terms.

---

## Contributing

Contributions welcome! Please:
- Open issues for bugs or feature requests
- Submit pull requests for improvements
- Follow existing code style
- Test thoroughly in PixInsight

By contributing, you agree contributions will be under CC BY-NC-SA 4.0.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/benoitblanco/deepcosmic/issues)
- **Website**: [www.bb-astro.com](https://www.bb-astro.com)
- **Email**: contact@bb-astro.com

---

## Acknowledgments

- **DeepCR**: Zhang & Bloom ([GitHub](https://github.com/profjsb/deepCR), [Paper](https://arxiv.org/abs/2001.01863))
- **PixInsight**: Professional image processing platform
- **Community**: Testers and contributors

---

## Technical Info

- **Algorithm**: Convolutional Neural Network (U-Net architecture)
- **Training Data**: 15,000+ labeled HST images
- **Models**: WFC3-UVIS and ACS-WFC
- **Processing**: Segmented 512×512 patches for large images
- **Dependencies**: DeepCR, PyTorch, Astropy, xisf

Full technical details in source code comments.

---

**Author**: Benoit Blanco (BB-Astro)
**Version**: 2.1
**Release**: November 2025
**Website**: [www.bb-astro.com](https://www.bb-astro.com)
**License**: CC BY-NC-SA 4.0 (non-commercial)
