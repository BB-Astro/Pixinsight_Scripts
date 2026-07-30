# BB-Astro LinearPatternCorrection

Detect defective rows or columns, inspect the detection model, and subtract
the corresponding linear pattern in a single PixInsight interface.

## Why this script exists

PixInsight's standard workflow uses two separate scripts:

1. `LinearDefectDetection` detects entire and partial defective lines.
2. The user saves the detected-line table manually.
3. `LinearPatternSubtraction` reads that table and calculates the pattern to
   subtract.

BB LinearPatternCorrection keeps the detected-line table in the current
session. A short-lived text file is generated only when the standard
subtraction engine requires it, then it is removed automatically.

## Features

- One interface for detection and subtraction
- Live, debounced model recalculation
- Selected-defect mask and line-model views
- Automatic transfer of complete and partial defect lines
- Protection against false partial defects on bright extended structures
- Detected-defects-only or whole-pattern correction
- Selection of an existing PixInsight preview as the background reference
- Pure PJSR, with no Python dependency
- macOS and Linux support through PixInsight 1.9.4 or later

## Installation

Add the BB-Astro repository in
**Resources > Updates > Manage Repositories**:

```text
https://bb-astro.github.io/BB-Astro_Repository/
```

Run **Resources > Updates > Check for Updates**, apply the
LinearPatternCorrection package, and restart PixInsight.

The script is available under:

**Script > BB-Astro > LinearPatternCorrection**

## Usage

1. Open the image to correct.
2. Optionally create a preview over a representative background area.
3. Launch **Script > BB-Astro > LinearPatternCorrection**.
4. Choose columns or rows and adjust the detection parameters.
5. Inspect the selected-defect mask or line model.
6. Choose whether to correct detected defects only or the full pattern.
7. Select the background preview if one was created.
8. Click **Apply correction**.

Auto-update waits one second after the last detection-parameter change before
starting a new calculation. Disable it for very large images and use
**Update model** manually.

The embedded model is automatically rescaled for visibility. That display
stretch does not alter the data used for correction.

Bright-structure protection is enabled by default. It rejects only partial
line candidates whose surrounding band is dominated by extended signal, such
as a galaxy core or broad spiral arm. Complete defective rows or columns are
never removed by this filter. The protection threshold follows the detection
rejection limit.

If no background preview is selected, the script evaluates a 3 by 3 grid and
uses its lowest-median region. A manually selected clean background preview is
still preferable when the target fills most of the frame.

The default parameter set is:

- Detection: layers 8, rejection 3, entire-line threshold 4,
  partial-line threshold 4, image shift 50
- Subtraction: layers 9, rejection 3, global rejection 3

## Requirements and scope

- PixInsight 1.9.4 or later
- An open main image view
- The standard PixInsight `LinearDefectDetection` and
  `LinearPatternSubtraction` PJSR engines

PixInsight 1.9.4 is V8-only, while the installed PatternCorrection engines
still call two retired runtime interfaces. The script provides narrow
compatibility adapters for the median-wavelet call and iterative clipped
statistics. Detection and subtraction otherwise remain delegated to the
standard installed engines.

Version 1.0 processes one open image at a time. It deliberately does not
duplicate the standard batch-file interface because a live model needs an
open image.

## Attribution

This product is based on software from the PixInsight project, developed by
Pleiades Astrophoto and its contributors
([pixinsight.com](https://pixinsight.com/)).

The script orchestrates PixInsight's installed standard engines. It does not
redistribute their implementation.

## Author

Benoit Blanco (BB-Astro)

[www.bb-astro.com](https://www.bb-astro.com)

## Version history

- **1.1.0** (July 2026)
  - Protect bright extended structures from false partial-line correction
  - Show the exact post-filter selected-defect mask
  - Select a low-signal automatic background region
  - Adopt BB's 8/3/4/4/50 detection and 9/3/3 subtraction defaults
- **1.0.0** (July 2026)
  - Initial one-window detection, live model, and subtraction workflow
