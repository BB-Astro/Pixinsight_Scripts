# BB-Astro LACosmic

**Professional Cosmic Ray Removal for PixInsight**

![Interface](examples/Interface.png)
*BB-Astro LACosmic interface with optimized parameters and process icon support*

Remove cosmic ray artifacts from astronomical images using the L.A.Cosmic algorithm with optimized parameters.

---

## What It Does

BB-Astro LACosmic detects and removes cosmic ray hits from your astronomical images using the **L.A.Cosmic algorithm** (van Dokkum 2001). This algorithm uses Laplacian edge detection to identify sharp cosmic ray events while preserving stars and galaxies.

**Performance:** Detects **+24% more cosmic rays** than standard settings (tested on HST data)

### Before & After Example

<table>
<tr>
<td><img src="examples/NGC5335_HST_In.jpg" alt="Before"/><br/><b>Before</b> - NGC5335 HST with cosmic rays</td>
<td><img src="examples/NGC5335_HST_Out.jpg" alt="After"/><br/><b>After</b> - Cosmic rays removed, stars preserved</td>
</tr>
</table>

---

## Installation

### Requirements

- **PixInsight** (any recent version)
- **Python 3.10 or later**, matching astroscrappy's `requires_python >=3.10`
- **macOS or Linux.** The script drives Python through a shell wrapper, so Windows is not supported.

### Step 1: Install the script

Add the BB-Astro repository in **Resources > Updates > Manage Repositories**:

```
https://bb-astro.github.io/BB-Astro_Repository/
```

Then **Resources > Updates > Check for Updates**, select LAcosmic, apply, and restart PixInsight.

Find the script in: **Script → BB-Astro → LAcosmic**

### Step 2: Set up Python

**Just launch the script.** It checks its environment before opening, and if it is missing it offers to build it: click **Set up now** and watch the progress in the PixInsight Console. No Terminal involved.

It creates `~/.bb-astro/lacosmic_venv` with `astroscrappy`, `astropy` and `numpy`.

If you would rather do it by hand:

```bash
bash /Applications/PixInsight/src/scripts/BB-Astro/install_lacosmic.sh
```

On Linux the path is `/opt/PixInsight/src/scripts/BB-Astro/` by default. Add `--yes` to run it without prompting.

**A virtual environment is required, not a convenience.** Homebrew and most Linux distributions mark their interpreter as externally managed (PEP 668), so `pip3 install astroscrappy` into the system Python is refused outright.

To use an interpreter of your choice instead:

```bash
BB_ASTRO_PYTHON=/path/to/python3 bash .../install_lacosmic.sh
```

---

## How to Use

1. Open your astronomical image in PixInsight
2. Run: **Script → BB-Astro → LAcosmic**
3. Click **"Clean Cosmic Rays"** (defaults are optimized)
4. A new window opens with the cleaned image
5. **Always inspect the result** to verify stars are intact

### Creating Process Icons

Click the **triangle button** (bottom-left) to save your settings as a desktop icon. You can then:
- Drag the icon onto images for quick processing
- Reuse parameter configurations
- Batch process multiple images

---

## How It Works

The L.A.Cosmic algorithm works in 6 steps:

1. **Laplacian edge detection** - Finds sharp, isolated features (cosmic rays)
2. **Noise modeling** - Uses your camera's gain and read noise specs
3. **Sigma clipping** - Flags pixels exceeding detection threshold
4. **Object discrimination** - Protects stars by analyzing their PSF profiles
5. **Iterative cleaning** - Multiple passes catch adjacent cosmic rays
6. **Interpolation** - Replaces flagged pixels using neighbor values

This is far more accurate than simple sigma clipping because it understands the difference between sharp cosmic rays and smooth stellar profiles.

---

## Parameters

| Parameter | Default | What It Does |
|-----------|---------|-------------|
| **sigclip** | 1.5 | Detection sensitivity (lower = more aggressive) |
| **objlim** | 1.5 | Star protection (higher = safer for faint stars) |
| **niter** | 6 | Number of cleaning passes |
| **readnoise** | 9.0 | Camera read noise (electrons) - check your camera specs |
| **gain** | 1.0 | Camera gain (e-/ADU) - usually 1.0 for calibrated images |

**Defaults are optimized for maximum detection.** Adjust objlim to 1.8-2.5 if you have very faint stars.

---

## Important Limitations & Warnings

### Star Protection

**This tool can affect very faint stars** (SNR < 5). Before using:

- **Best practice:** Create a star mask (StarMask tool) and apply it BEFORE running L.A.Cosmic
- **Test on a copy** of your image first
- **Inspect results** at 100% zoom to verify stars are intact
- **Enable "Save cosmic ray mask"** to review what was detected
- **If stars are affected:** Increase objlim to 1.8, 2.0, or 2.5

### When to Use

**GOOD FOR:**
- Deep-sky images with long exposures (>30 seconds)
- Single calibrated frames **before** stacking
- Space telescope data (HST, JWST)
- High-resolution imaging where CRs are visible

**NOT GOOD FOR:**
- Already stacked images (cosmic rays are averaged out during stacking)
- Short exposures (<5 seconds) with few cosmic rays
- Planetary/lunar imaging (different types of artifacts)

### Workflow Position

Apply L.A.Cosmic **after calibration** (darks/flats/bias) and **before registration/stacking**. Process each individual sub-exposure separately for best results.

---

## Performance

Tested on **NGC5335 HST F814W** (2683×2455 pixels, 32-bit float):

- **Baseline parameters** (2.0/2.0/n=4): 4,204 cosmic rays detected
- **This version** (1.5/1.5/n=6): 5,230 cosmic rays detected
- **Improvement:** +24.4%
- **Processing time:** ~10 seconds (~1.5 sec/megapixel)


---

## Troubleshooting

### "The Python environment for L.A.Cosmic is not set up yet"

Click **Set up now** in the dialog. If you dismissed it, relaunch the script, or run the setup by hand:

```bash
bash /Applications/PixInsight/src/scripts/BB-Astro/install_lacosmic.sh
```

To see which interpreter the script would use:

```bash
bash /Applications/PixInsight/src/scripts/BB-Astro/run_lacosmic.sh --probe
```

It prints the first candidate that actually has `astroscrappy`, `astropy` and `numpy`, searching `~/.bb-astro/lacosmic_venv`, then `~/.bb-astro/deepcr_venv`, then the system interpreters. Setting `PYTHON_EXECUTABLE` overrides the search entirely.

### `pip` refuses with "externally-managed-environment"

Expected. Your Python is protected by PEP 668. Use `install_lacosmic.sh`, which installs into its own virtual environment.

### "Stars are being removed"

- Create a **star mask** (StarMask tool) before running
- Or increase **objlim** to 1.8-2.5
- Enable "Save mask" to verify what's being detected

### "run_lacosmic.sh not found"

The installation is incomplete. Reinstall LAcosmic from **Resources > Updates** in PixInsight; the package ships the wrapper with its executable bit set.

### More help

Visit: **www.bb-astro.com**

---

## Technical Details

### Algorithm

Based on: **van Dokkum, P. G. (2001)** - "Cosmic-Ray Rejection by Laplacian Edge Detection", PASP, 113, 1420-1427

Implementation: **astroscrappy** - https://github.com/astropy/astroscrappy

### Features

- Auto-rescaling for 32-bit float normalized images (0-1 range)
- Process icon support (triangle button)
- Visual parameter validation
- Works with FITS format (XISF images must be exported to FITS first from PixInsight)
- Cross-platform Python detection (Homebrew, system, user installs)

### FITS Header Keywords

When the input image is normalized (0–1 range), the script temporarily rescales it to 16-bit ADU for processing, then restores the original range on save. The following keywords are written to the input FITS header during processing and removed from the output:

| Keyword | Value | Description |
|---------|-------|-------------|
| `BBRESCAL` | `True` during processing, `False` in output | Whether the image was auto-rescaled |
| `BBRSCFAC` | float | Rescale factor applied (present in input only) |
| `BBRSCOFF` | float | Rescale offset applied (present in input only) |

The output FITS file is always saved in the original pixel value range.

---

## License

**Creative Commons BY-NC-SA 4.0** (Attribution, Non-Commercial, ShareAlike)

**You MAY:** Use for personal astrophotography, share, and modify

**You MAY NOT:** Resell or use commercially

See [LICENSE](LICENSE) for details.

---

## Author

**Benoit Blanco (BB)**

Website: [www.bb-astro.com](https://www.bb-astro.com)

---

## Credits

- **Algorithm:** Pieter van Dokkum (Yale University)
- **Implementation:** astroscrappy by Curtis McCully & Astropy contributors
- **Test Data:** NASA/ESA Hubble Space Telescope

---

If you use this tool, please provide attribution and link to www.bb-astro.com

**Happy cosmic ray hunting!** 🌌
