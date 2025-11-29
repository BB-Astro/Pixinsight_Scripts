# BB-Astro CosmeticCorrection

**Hot/Cold Pixel Correction for PixInsight**

Apply cosmetic correction (hot/cold pixel removal) directly on the active view instead of batch processing files.

---

## What It Does

BB-Astro CosmeticCorrection provides a convenient interface to apply PixInsight's native **CosmeticCorrection** process directly on an open image. This is useful when you want to:

- Quickly fix hot/cold pixels on a single image
- Test different sigma values before batch processing
- Apply corrections without setting up file-based workflows

The script uses automatic detection based on sigma thresholds to identify and correct defective pixels.

---

## Features

- **Direct View Processing**: Apply corrections on open images (no file export needed)
- **Auto-Detection**: Automatic hot/cold pixel detection using sigma thresholds
- **Real-time Validation**: Visual feedback shows when values are outside typical ranges
- **Process Icons**: Save configurations for reuse (triangle button)
- **CFA Support**: Works with Bayer pattern images

---

## Installation

### Requirements

- **PixInsight**: Any recent version with script support

### Install in PixInsight

1. Copy `BB_CosmeticCorrection.js` to your PixInsight scripts folder:

**macOS:**
```bash
cp BB_CosmeticCorrection.js /Applications/PixInsight/src/scripts/
```

**Linux:**
```bash
cp BB_CosmeticCorrection.js ~/.local/share/PixInsight/src/scripts/
```

**Alternative method:**
- In PixInsight: `Script > Feature Scripts...`
- Click "Add" and select the folder containing this script
- Click "Done"

2. **Restart PixInsight**

3. Find the script in: **Script > BB-Astro > CosmeticCorrection**

---

## How to Use

1. **Open an image** in PixInsight
2. Run: **Script > BB-Astro > CosmeticCorrection**
3. **Adjust parameters**:
   - **Hot Sigma**: Detection threshold for hot pixels (typical: 1.0-3.0)
   - **Cold Sigma**: Detection threshold for cold pixels (typical: 1.0-3.0)
   - **Amount**: Correction strength (0 = none, 1 = full)
   - **CFA**: Enable for Bayer pattern images
4. Click **OK** to apply

### Using Process Icons

You can also use a saved CosmeticCorrection process icon:
1. Check "Use Process Icon"
2. Enter the icon ID (e.g., "CC_Icon_01")
3. The script will use parameters from that icon

### Creating Process Icons

Click the **triangle button** (bottom-left) to save your settings as a process icon for reuse.

---

## Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| **Hot Sigma** | 1.8 | 0.1-10.0 | Lower = more aggressive hot pixel detection |
| **Cold Sigma** | 1.4 | 0.1-10.0 | Lower = more aggressive cold pixel detection |
| **Amount** | 1.0 | 0.0-1.0 | Correction strength |
| **CFA** | Off | On/Off | Enable for Bayer pattern (OSC) images |

### Typical Values

- **Aggressive**: Hot/Cold Sigma = 1.0-1.5
- **Moderate**: Hot/Cold Sigma = 1.5-2.0 (recommended)
- **Conservative**: Hot/Cold Sigma = 2.0-3.0

The validation indicator shows:
- **Green**: "Values in typical range" (1.0-3.0)
- **Red**: Warning if values are very low (<1.0) or high (>3.0)

---

## How It Works

Since PixInsight's CosmeticCorrection process only works in global context (file-based), this script:

1. **Saves** the active view to a temporary file
2. **Runs** CosmeticCorrection on that file
3. **Loads** the result back into the original view
4. **Cleans up** temporary files automatically

This provides seamless integration while respecting PixInsight's process architecture.

---

## When to Use

### Good For:
- Quick single-image corrections
- Testing sigma values before batch processing
- OSC/CFA images with hot pixels
- Images with known defective pixels

### Workflow Position:
Apply **after calibration** (darks/flats/bias) and **before** other processing steps.

---

## Troubleshooting

### "No active image"
Open an image in PixInsight before running the script.

### "Processing takes too long"
Large images may take longer due to temporary file operations. This is normal.

### "Values out of range warning"
The script will still work, but extreme sigma values may produce unexpected results. Typical range is 1.0-3.0.

---

## Part of BB-Astro Suite

This script is part of the **BB-Astro** collection for PixInsight:

| Script | Purpose | Menu Location |
|--------|---------|---------------|
| **CosmeticCorrection** | Hot/cold pixel removal | Script > BB-Astro > CosmeticCorrection |
| **LAcosmic** | Traditional cosmic ray removal | Script > BB-Astro > LAcosmic |
| **DeepCosmicRay** | AI-based cosmic ray removal | Script > BB-Astro > DeepCosmicRay |

---

## License

**Creative Commons BY-NC-SA 4.0** (Attribution, Non-Commercial, ShareAlike)

Copyright (c) 2025 Benoit Blanco

---

## Author

**Benoit Blanco (BB)**

Website: [www.bb-astro.com](https://www.bb-astro.com)

---

## Version History

- **v2.1.0** (November 2025)
  - Added process icon support (triangle button)
  - Added visual validation with color feedback
  - Fixed global context execution (temp file workflow)
  - Moved to BB-Astro menu category
  - Removed non-functional real-time preview

- **v2.0.0** (November 2025)
  - Initial release with auto-detection
