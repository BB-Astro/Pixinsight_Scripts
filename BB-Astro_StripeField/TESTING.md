# BB StripeField validation

Validation date: 2026-07-31, amended 2026-08-01 for v0.2.5

Environment:

- PixInsight Core 1.9.4 Lockhart, build 1695, arm64
- macOS on Mac Studio M2 Max
- Python 3.13 validation environment
- NumPy 2.5.1, SciPy 1.18.0, Astropy 8.0.1

## PixInsight engine smoke test

The complete JavaScript source was loaded by the PixInsight V8 engine in a
dedicated automation instance.

Result:

```text
BBSF_ENGINE_SMOKE_OK /Users/bbm2max/DocM2max/destriping/.venv/bin/python
```

This test also checks the validated Hubble defaults and the wrapper dependency
probe.

## PixInsight interface smoke test

The test opened a synthetic 1024 by 1024 monochrome FITS image and constructed
the complete main dialog and integrated English method-help dialog without
displaying or processing user data. It also verified that the help explicitly
describes Wiener shrinkage and the no-rotation evaluation.

Result:

```text
BBSF_UI_SMOKE_OK main=537x555 help=776x648
```

## StripeField icon

`Favicon_StripeField.svg` is a native 64 by 64 SVG. XML validation and a
512-pixel Quick Look render both pass. The icon shows the modeled oriented
stripe field on the left, a cyan model boundary, and preserved astronomical
sources in the cleaned field on the right.

## PixInsight to Python bridge smoke test

PixInsight launched the wrapper with the argument-array API, Python ran the
scientific engine, and PixInsight loaded both generated FITS images.

Result:

```text
BBSF_BRIDGE_SMOKE_OK
```

Arguments are passed with `ExternalProcess.start(program, arguments)`. No
command string or shell interpolation is used.

## PixInsight output-window regression

PixInsight 1.9.4 returns JavaScript `null`, rather than a null `View` object,
when `View.viewById()` is called with an unused identifier. Version 0.2.1
handles both return forms before creating output windows.

The regression test loads the generated corrected and stripe-model FITS files,
creates two real `ImageWindow` instances, verifies their identifiers, and
closes them cleanly.

Result:

```text
BBSF_OUTPUT_WINDOW_SMOKE_OK BBSF_OutputWindowSmoke BBSF_OutputWindowSmoke_2
```

## Progress protocol

Version 0.2.2 adds a nonmodal PixInsight progress dialog. The Python engine
emits tab-delimited progress events during background estimation, coarse-angle
scans, fine-angle refinement, model estimation and FITS writing. PixInsight
consumes these events without printing protocol lines in the Console.

The engine also reports its actual execution configuration:

```text
Python engine: 1 worker, 12 logical processors available.
```

The current algorithm is sequential between greedy passes. Angle scanning is
also single-worker to avoid concurrent full-frame temporary arrays on 4k
mosaics.

The PixInsight bridge test ran one complete Python pass and consumed the live
events:

```text
BBSF_PROGRESS_SMOKE_OK value=1
detail=Python engine: 1 worker, 12 logical processors available.
```

An automatic one-pass regression swept all 180 coarse angles and the 0.125
degree fine grid. Progress advanced throughout both scans. The protocol-only
change preserves the previous scientific outputs bit for bit:

```text
corrected_max_abs 0.0
model_max_abs 0.0
bitwise_equal True
```

## BB-Astro console banner

Version 0.2.3 prints the same seven-line `BB-ASTRO` ASCII signature used by the
other BB-Astro PixInsight scripts. The StripeField subtitle, version, method
scope and `www.bb-astro.com` attribution follow it before processing details.

## Undo and external-process diagnostics

Version 0.2.4 uses PixInsight's default undo mode only when replacing the
existing target image. Newly created corrected and model windows retain
`UndoFlag_NoSwapFile`, since they have no prior pixel state to restore.

PixInsight 1.9.4 configures `ExternalProcess` with merged output channels.
Python standard error, including wrapper diagnostics and tracebacks, therefore
arrives through `process.stdout`. Reading `process.stderr` separately emits a
Qt `Called with MergedChannels` warning and must be avoided. The merged stream
is drained while Python is running and once more after it exits. The last 40
non-protocol lines are included in the failure message when the engine returns
a nonzero exit code. The dependency probe uses UTF-8 decoding on the same
merged stream.

The v0.2.4 PixInsight smoke test verifies the real undo stack, drains more than
98 KiB written to Python standard error, and checks that a deliberate exit-code
7 failure includes its Python diagnostic:

```text
BBSF_V024_SMOKE_OK ui=537x555 help=776x648
undo=restored stderr=flood-drained failure=diagnosed
```

The progress regression still completes with one reported worker. Its
corrected and model FITS files are byte-for-byte identical to the validated
automatic reference.

## Method wording and integer-format guard (v0.2.5)

Version 0.2.5 removes the references to the earlier method lineage from the
integrated help, the dialog label, the engine docstrings and this
documentation. The method description now stands on its own: source masking,
normalized background, noise-corrected angle scan, robust median profile,
Wiener shrinkage and analytic evaluation without rotation. No executable
scientific path of the engine was modified by the wording change.

The integrated help was re-audited against `destripe_astro.py` on 2026-08-01
and completed with three implementation details it previously omitted: the
four-sigma clip applied to the high-pass residual before angle-scan binning,
the linear interpolation along v of profile bins without enough background
samples, and the effective sample count used by the windowed-mode noise
variance.

Version 0.2.5 also adds a pre-run guard: in-place replacement is refused when
the target view uses an integer sample format, because the corrected image can
contain small negative background values that integer storage would clip to
zero. The guard runs before the Python engine is launched, so no processing
time is lost. The format test uses `Image.isReal`, the property used by the
official PixInsight scripts for the same purpose.

Verification performed on 2026-08-01:

- `destripe_astro.py` byte-compiles in the project virtual environment and a
  synthetic end-to-end run produces both output FITS files with the same CLI.
- The complete JavaScript source, with PJSR preprocessor directives stripped,
  passes a V8 syntax check.
- A recursive search over the module folder and the engine confirms zero
  remaining lineage references.

The full PixInsight smoke tests documented above were not re-run for v0.2.5;
their v0.2.4 results remain the reference for the bridge, undo and progress
behavior.

## Public package validation

The public 0.2.5 source tree bundles `destripe_astro.py` next to the PixInsight
script. `run_stripefield.sh` resolves that bundled engine instead of relying on
the private development project. `install_stripefield.sh` creates the dedicated
`~/.bb-astro/stripefield_venv` environment on macOS or Linux and installs the
versions constrained by `stripefield_requirements.txt`.

Release checks completed on 2026-08-01:

- both shell scripts pass `bash -n`
- `destripe_astro.py` byte-compiles with Python 3.13
- wrapper probe selects the validated environment
- a fixed-angle synthetic end-to-end run produces finite corrected and model
  FITS files, with `input = corrected + model` to `1.859e-9` maximum error
- the PixInsight V8 automation smoke constructs the main and help dialogs,
  verifies the integer-format guard, and resolves both runtime and setup
  wrappers

```text
BBSF_V025_RELEASE_SMOKE_OK ui=537x555 help=776x648
integer-guard=valid setup=present
```

## PixInsight FITS transfer test

The production `ImageWindow.saveAs()` call exported the synthetic float32
image to temporary FITS. Astropy then compared the original and PixInsight
export sample by sample.

| Check | Result |
|---|---:|
| Original format | float32 |
| PixInsight export format | float32 |
| Maximum absolute error | 0 |
| RMS error | 0 |
| Geometry preserved | Yes |

The temporary bridge therefore preserves stripe amplitudes far below
16-bit quantization.

## Synthetic Hubble regression

The synthetic image contains a smooth extended galaxy, three compact stars,
Gaussian pixel noise and horizontal stripe families with periods of 9 and 23
pixels. Automatic angle detection selected 0 degrees.

| Check | Result |
|---|---:|
| Detected angle | 0.000 degrees |
| Row-profile high-frequency RMS reduction | 73.12% |
| Maximum error in `input = corrected + model` | 1.86e-9 |
| Corrected and model images finite | Yes |
| Output geometry | 1024 by 1024 mono |

## Existing real Hubble controls

The interface calls the same unchanged `destripe_astro.py` path already used
for the real controls:

| Image | Removed passes | Runtime | Existing verdict |
|---|---:|---:|---|
| Arp255 Hubble | 5 | 282 s | Excellent |
| Arp314 Hubble | 8 | 411 s | Excellent |
| Arp141 Hubble | 11 | 522 s | Excellent, satellite trail protected |
