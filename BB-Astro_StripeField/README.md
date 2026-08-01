# BB StripeField

BB StripeField is a PixInsight interface for the validated Hubble stripe-field
model implemented by the bundled `destripe_astro.py` engine.

## What StripeField corrects

Hubble ACS/WFC row-bias variations are horizontal in detector coordinates.
After drizzle reprojection, those detector rows can appear at arbitrary angles
and can be slightly curved in a final mosaic. Their amplitude is often much
lower than the pixel noise, but their coherence over thousands of pixels makes
them visible after a strong display stretch.

StripeField estimates the signed additive value of this contamination at every
pixel. This distinguishes it from a defective-row tool, which selects a finite
list of damaged rows or columns.

For a stripe direction `theta`, the model uses:

```text
v = y*cos(theta) - x*sin(theta)    across the stripes
u = x*cos(theta) + y*sin(theta)    along the stripes
```

The image model is:

```text
image = background + astronomical signal + noise + sum(S_theta(v,u))
corrected = image - sum(S_theta(v,u))
```

The summed `S_theta` terms form the signed StripeField model.

## Method

1. An iterative median and MAD mask excludes galaxies, stars, diffraction
   spikes and other bright structures. The rejected mask is dilated.
2. A normalized Gaussian convolution estimates the large-scale background
   without bleeding masked sources into the model.
3. Candidate directions from -90 to +90 degrees are scanned by direct binning
   of background samples in the transverse coordinate `v`.
4. Expected estimator noise is subtracted from each angular score. A
   one-degree scan is followed by a 0.125-degree local refinement.
5. At the selected direction, a robust median profile is estimated per
   transverse bin and high-pass filtered across the stripes.
6. Each profile cell is attenuated by Wiener shrinkage according to its
   measurement noise.
7. The accepted profile is evaluated analytically on the original image grid.
   The science image is never rotated or resampled.
8. A concentration guard identifies isolated linear features such as
   satellite trails. Those pixels are masked instead of generating a
   full-frame correction.
9. The process repeats greedily until no remaining angle reaches the stopping
   significance.

The Wiener noise estimate for a median based on `n` samples is:

```text
noise_variance = (1.2533 * pixel_sigma)^2 / n
lambda = signal_variance / (signal_variance + noise_variance)
shrunk_profile = lambda * measured_profile
```

An unmeasured component therefore shrinks toward zero instead of injecting a
false stripe field.

## Validated scope

- Linear, monochrome Hubble mosaics
- Weak row-bias fields at arbitrary angles after drizzle reprojection
- Global stripe profile, constant along each projected row
- Automatic multi-angle search

JWST is deliberately outside the validated scope. Final JWST mosaics can
combine different stripe families in different exposure zones, plus detector
footprints and exposure seams. The Hubble global field is not sufficient for
that case.

## Installation in PixInsight

1. Open `Resources > Updates > Manage Repositories`.
2. Add `https://bb-astro.github.io/BB-Astro_Repository/`.
3. Run `Resources > Updates > Check for Updates`.
4. Select StripeField, apply the update and restart PixInsight.
5. Open a linear monochrome image, then launch
   `Script > BB-Astro > StripeField`.

On first launch, StripeField checks its Python environment. If it is missing,
choose **Set up now**. PixInsight runs the bundled installer, creates
`~/.bb-astro/stripefield_venv`, and installs NumPy, SciPy and Astropy. Internet
access is required only for this one-time setup.

For manual setup:

```bash
# macOS default PixInsight installation
bash /Applications/PixInsight/src/scripts/BB-Astro/install_stripefield.sh

# Linux default PixInsight installation
bash /opt/PixInsight/src/scripts/BB-Astro/install_stripefield.sh
```

Python 3.10 or later is required. On Debian or Ubuntu, install `python3-venv`
if environment creation fails. To verify the interpreter selected by the
wrapper:

```bash
bash /Applications/PixInsight/src/scripts/BB-Astro/run_stripefield.sh --probe
```

StripeField supports macOS and Linux. Windows is not supported because the
PixInsight front end invokes the Python engine through a Bash wrapper.

## Validated Hubble defaults

| Parameter | Default | Effect |
|---|---:|---|
| Maximum passes | 12 | Upper limit on accepted angle families |
| Stopping significance | 5 sigma | Higher values are more conservative |
| Background smoothing | 100 px | Large-scale normalized Gaussian model |
| Source-mask threshold | 3 MAD | Lower values mask more source signal |
| Transverse detrending | 25 px | Larger values admit broader bands |
| Along-stripe component | Disabled | Experimental for Hubble |

The windowed component is disabled because its Wiener-shrunk RMS was exactly
zero in all three validated Hubble runs. Those mosaics are consistent with
stripe offsets that remain constant along each projected detector row.

## Outputs and quality gate

The script creates:

- `<target>_StripeFieldCorrected`, unless in-place replacement is selected
- `<target>_StripeFieldModel`, the signed full-precision field that was removed

Apply an STF to the signed model. It must contain line structure only. Reject
the correction if a galaxy, halo, tidal feature, star or diffraction pattern
is visible in the model.

If astronomical structure appears, return to the original linear image and
use a more conservative configuration:

- raise Stopping significance
- reduce Maximum passes
- lower Source-mask threshold to mask more signal
- reduce Transverse detrending to protect broader structure

The input must remain linear. A strong stretch changes the noise statistics,
source mask and Wiener weights and is not a valid input.

## Integrated help

The `Method help` button opens a complete English description of the model,
equations, pipeline, parameters, quality gate and limitations directly inside
PixInsight.

## Runtime

The three validated Hubble images took approximately 282 to 522 seconds on the
Mac Studio M2 Max. StripeField shows a live progress dialog driven by completed
Python angle scans and processing phases. Its Cancel button and the PixInsight
Console abort button both stop the Python process.

Version 0.2.3 prints the standard BB-Astro ASCII banner at the beginning of
each processing run, before target and parameter information.

Version 0.2.4 makes in-place replacement genuinely undoable and retains the
last 40 diagnostic lines from PixInsight's merged Python output when the
engine fails. PixInsight 1.9.4 merges standard error into standard output for
`ExternalProcess`, so the existing live output loop already drains both
channels without a separate `stderr` read. Process startup and dependency
probing now allow 60 seconds for a sleeping external volume.

Version 0.2.5 refuses in-place replacement when the target view uses an
integer sample format, because the corrected image can contain small negative
background values that integer storage would clip to zero. It also removes
the references to the earlier method lineage from the interface and the
documentation; the method description now stands on its own. The public
package bundles the scientific engine and provides guided Python setup on
macOS and Linux.

The current scientific engine deliberately uses one worker. It sees all 12
logical processors on the Mac Studio, but the greedy passes are sequential
because each pass must operate on the correction produced by the preceding
pass. The angle search inside one pass has not yet been parallelized. This
avoids multiplying the large temporary arrays used for a 4k mosaic.
