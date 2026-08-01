"""Remove weak oriented row-bias fields from linear monochrome Hubble mosaics.

After drizzle reprojection, detector-row artifacts can appear at arbitrary
angles in a final mosaic. Their amplitude can sit far below the pixel noise,
and neighboring fitted angles can represent slight curvature.

Model:
    image = background(x,y) + sum_k stripe_k + sources + noise

For each family k, stripe_k is constant, or optionally slowly varying, along
theta_k and contains high-frequency structure across that direction.

Key properties:
  * The science image is never rotated. Background pixels are binned directly
    in the transverse coordinate v = y*cos(theta) - x*sin(theta), and the
    accepted profile is evaluated on the original pixel grid.
  * Per-cell Wiener shrinkage uses the estimator variance
    (1.2533*sigma/sqrt(n))^2, so an unmeasured profile tends toward zero.
  * A greedy multi-angle search repeats after each accepted subtraction until
    no significant direction remains.
  * A linear-feature guard masks isolated satellite trails and diffraction
    spikes instead of extending them into a full-frame correction.

The released and validated scope is Hubble. The engine can represent multiple
angles, but final JWST mosaics with spatially varying exposure footprints have
not been validated and should not be treated as supported inputs.

Usage:
    python destripe_astro.py image.fits -o output/ [--max-iter 12] [--signif 5]
    python destripe_astro.py image.fits -o output/ --angles 0.0,0.5 --jpg
"""

from __future__ import annotations

import argparse
import os
import time
from pathlib import Path
from typing import Callable

import numpy as np
from astropy.io import fits
from scipy import ndimage


# ---------------------------------------------------------------------------
# Source mask and background
# ---------------------------------------------------------------------------

def mask_sources(img: np.ndarray, k: float = 3.0, iters: int = 5,
                 grow: int = 2) -> tuple[np.ndarray, float, float]:
    """Return an iterative MAD-clipped mask where True denotes background."""
    m = np.isfinite(img)
    med = float(np.median(img[m]))
    mad = float(np.median(np.abs(img[m] - med)) * 1.4826)
    for _ in range(iters):
        med = float(np.median(img[m]))
        mad = float(np.median(np.abs(img[m] - med)) * 1.4826)
        m = np.isfinite(img) & (np.abs(img - med) < k * mad)
    src = ndimage.binary_dilation(~m, iterations=grow)
    return ~src, med, mad


def background_lowpass(img: np.ndarray, bg_mask: np.ndarray,
                       sigma: float = 100.0) -> np.ndarray:
    """Estimate the large-scale background with normalized convolution."""
    num = ndimage.gaussian_filter(np.where(bg_mask, img, 0.0), sigma)
    den = ndimage.gaussian_filter(bg_mask.astype(float), sigma)
    with np.errstate(invalid='ignore', divide='ignore'):
        return num / np.maximum(den, 1e-8)


def gauss1d_nan(a: np.ndarray, sigma: float, axis: int = 0) -> np.ndarray:
    m = np.isfinite(a)
    num = ndimage.gaussian_filter1d(np.where(m, a, 0.0), sigma, axis=axis, mode='nearest')
    den = ndimage.gaussian_filter1d(m.astype(float), sigma, axis=axis, mode='nearest')
    with np.errstate(invalid='ignore', divide='ignore'):
        out = num / np.maximum(den, 1e-8)
    return np.where(den > 1e-3, out, np.nan)


# ---------------------------------------------------------------------------
# Angle scan with direct binning and no image rotation
# ---------------------------------------------------------------------------

def angle_scan(hp: np.ndarray, bg_mask: np.ndarray, thetas, sigma_pix: float,
               detrend_sigma: float = 25.0, min_count: int = 300,
               clip: float = 4.0,
               progress: Callable[[float], None] | None = None) -> np.ndarray:
    """Return noise-corrected binned-profile power for each angle.

    theta is the stripe direction: 0 is horizontal and 90 is vertical.
    """
    H, W = hp.shape
    hpc = np.clip(hp, -clip * sigma_pix, clip * sigma_pix)
    ybg, xbg = np.nonzero(bg_mask)
    vals = hpc[ybg, xbg]
    cy, cx = (H - 1) / 2.0, (W - 1) / 2.0
    yv = ybg - cy
    xv = xbg - cx
    scores = np.full(len(thetas), np.nan)
    for k, th in enumerate(thetas):
        t = np.deg2rad(th)
        v = yv * np.cos(t) - xv * np.sin(t)
        iv = np.floor(v - v.min()).astype(np.int64)
        n = np.bincount(iv)
        s = np.bincount(iv, weights=vals)
        with np.errstate(invalid='ignore', divide='ignore'):
            prof = np.where(n >= min_count, s / np.maximum(n, 1), np.nan)
        hf = prof - gauss1d_nan(prof, detrend_sigma)
        ok = np.isfinite(hf)
        if ok.sum() < 50:
            if progress is not None and ((k + 1) % 4 == 0 or k + 1 == len(thetas)):
                progress((k + 1) / len(thetas))
            continue
        noise_var = sigma_pix ** 2 / n[ok]
        scores[k] = np.mean(hf[ok] ** 2 - noise_var)
        if progress is not None and ((k + 1) % 4 == 0 or k + 1 == len(thetas)):
            progress((k + 1) / len(thetas))
    return scores


# ---------------------------------------------------------------------------
# Stripe-field estimate for one angle
# ---------------------------------------------------------------------------

def _grouped_median(iv: np.ndarray, vals: np.ndarray, nbins: int,
                    min_count: int) -> tuple[np.ndarray, np.ndarray]:
    order = np.argsort(iv, kind='stable')
    ivs = iv[order]
    vs = vals[order]
    bounds = np.searchsorted(ivs, np.arange(nbins + 1))
    med = np.full(nbins, np.nan)
    cnt = np.diff(bounds)
    for i in range(nbins):
        a, b = bounds[i], bounds[i + 1]
        if b - a >= min_count:
            med[i] = np.median(vs[a:b])
    return med, cnt


def stripe_field(hp: np.ndarray, bg_mask: np.ndarray, theta: float,
                 win: int | None = None, step: int | None = None,
                 detrend_sigma: float = 25.0, smooth_along: float = 0.0,
                 min_count: int = 100, sigma_pix: float | None = None,
                 wiener: bool = True, clip_amp: float | None = None,
                 return_profile: bool = False):
    """Evaluate the stripe field at angle theta over the complete image.

    win=None selects a global profile that is constant along the stripe.
    win=W selects a windowed profile that varies slowly along the stripe.
    Wiener shrinkage attenuates each cell according to estimator noise.
    Returns a full-frame float64 field.
    """
    H, W = hp.shape
    ybg, xbg = np.nonzero(bg_mask)
    vals = hp[ybg, xbg]
    cy, cx = (H - 1) / 2.0, (W - 1) / 2.0
    t = np.deg2rad(theta)
    c, s = np.cos(t), np.sin(t)
    v = (ybg - cy) * c - (xbg - cx) * s
    u = (xbg - cx) * c + (ybg - cy) * s
    vmin = v.min()
    iv = np.round(v - vmin).astype(np.int64)
    nv = int(iv.max()) + 1

    if win is None:
        centers = np.array([0.0])
        prof = np.full((nv, 1), np.nan)
        cnts = np.zeros((nv, 1))
        prof[:, 0], cnts[:, 0] = _grouped_median(iv, vals, nv, min_count)
    else:
        if step is None:
            step = win // 2
        umin, umax = u.min(), u.max()
        centers = np.arange(umin + win / 2, umax - win / 2 + 1e-9, step)
        if len(centers) == 0:
            centers = np.array([(umin + umax) / 2])
        prof = np.full((nv, len(centers)), np.nan)
        cnts = np.zeros((nv, len(centers)))
        for j, cj in enumerate(centers):
            sel = np.abs(u - cj) <= win / 2
            prof[:, j], cnts[:, j] = _grouped_median(iv[sel], vals[sel], nv, min_count)

    # Transverse detrending removes real broad sky structure and retains HF.
    prof = prof - gauss1d_nan(prof, detrend_sigma, axis=0)
    if smooth_along > 0 and prof.shape[1] > 2:
        prof = gauss1d_nan(prof, smooth_along, axis=1)
        eff = max(1.0, np.sqrt(2 * np.pi) * smooth_along / 2)
    else:
        eff = 1.0

    noise_var = None
    if sigma_pix is not None:
        with np.errstate(invalid='ignore', divide='ignore'):
            noise_var = (1.2533 * sigma_pix) ** 2 / np.maximum(cnts * eff, 1)
    if wiener and noise_var is not None:
        fin = np.isfinite(prof)
        sig_var = max(np.nanmean(prof[fin] ** 2) - np.nanmean(noise_var[fin]), 0.0)
        lam = sig_var / np.maximum(sig_var + noise_var, 1e-30)
        prof = prof * lam
    if clip_amp is not None:
        prof = np.clip(prof, -clip_amp, clip_amp)

    raw_profile = prof.copy()

    # Fill missing bins by interpolation along v, or by zero if unmeasured.
    for j in range(prof.shape[1]):
        col = prof[:, j]
        f = np.isfinite(col)
        if f.sum() == 0:
            prof[:, j] = 0.0
        elif f.sum() < nv:
            idx = np.arange(nv)
            prof[:, j] = np.interp(idx, idx[f], col[f])

    # Full-frame bilinear evaluation in oriented coordinates (v, u).
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    vf = (yy - cy) * c - (xx - cx) * s
    uf = (xx - cx) * c + (yy - cy) * s
    vi = np.clip(vf - vmin, 0, nv - 1)
    i0 = np.floor(vi).astype(np.int64)
    i1 = np.minimum(i0 + 1, nv - 1)
    fv = vi - i0
    if prof.shape[1] == 1:
        S = prof[i0, 0] * (1 - fv) + prof[i1, 0] * fv
    else:
        uj = np.clip((uf - centers[0]) / step, 0, len(centers) - 1)
        j0 = np.floor(uj).astype(np.int64)
        j1 = np.minimum(j0 + 1, len(centers) - 1)
        fu = uj - j0
        S = (prof[i0, j0] * (1 - fv) * (1 - fu) + prof[i1, j0] * fv * (1 - fu)
             + prof[i0, j1] * (1 - fv) * fu + prof[i1, j1] * fv * fu)
    if return_profile:
        return S, raw_profile, noise_var, iv, vmin
    return S


# ---------------------------------------------------------------------------
# Guard against isolated linear features such as trails and spikes
# ---------------------------------------------------------------------------

def linear_feature_rows(profile: np.ndarray, noise_var: np.ndarray,
                        nsig: float = 5.0, max_rows_frac: float = 0.01):
    """Detect a profile dominated by a few isolated lines.

    Returns ``(is_linear_feature, dominant_line_indices)``. A real stripe
    family excites many profile rows, whereas a satellite trail strongly
    excites only a few.
    """
    p = profile[:, 0] if profile.ndim == 2 else profile
    nv_arr = noise_var[:, 0] if noise_var.ndim == 2 else noise_var
    fin = np.isfinite(p) & np.isfinite(nv_arr)
    if fin.sum() < 50:
        return False, np.array([], dtype=int)
    z = np.zeros_like(p)
    z[fin] = p[fin] / np.sqrt(nv_arr[fin])
    strong = np.abs(z) > nsig
    n_strong = int(strong.sum())
    if n_strong == 0:
        return False, np.array([], dtype=int)
    power = p[fin] ** 2
    top = np.sort(np.abs(p[fin]))[::-1]
    top_share = float(np.sum(top[:max(3, n_strong)] ** 2) / max(np.sum(power), 1e-30))
    few_rows = n_strong < max(10, max_rows_frac * fin.sum())
    return bool(few_rows and top_share > 0.5), np.where(strong)[0]


# ---------------------------------------------------------------------------
# Greedy multi-angle loop
# ---------------------------------------------------------------------------

def destripe_greedy(img: np.ndarray, max_iter: int = 12, signif_stop: float = 5.0,
                    bg_sigma: float = 100.0, mask_k: float = 3.0,
                    detrend_sigma: float = 25.0, win: int | None = 1024,
                    smooth_along: float = 2.0, coarse_step: float = 1.0,
                    angles: list[float] | None = None,
                    verbose: bool = True,
                    progress: Callable[[float, str], None] | None = None):
    """Run greedy multi-angle destriping, or use fixed ``angles`` when given.

    Returns corrected data, the signed field, accepted angles, mask and MAD.
    """
    forced = list(angles) if angles else None
    iteration_count = max_iter if forced is None else len(forced)
    progress_denominator = max(iteration_count, 1)

    def report(value: float, phase: str) -> None:
        if progress is not None:
            progress(float(np.clip(value, 0.0, 1.0)), phase)

    report(0.0, 'Building source mask')
    bg_mask, med, mad = mask_sources(img, k=mask_k)
    report(0.01, 'Source mask ready')
    corrected = img.astype(np.float64).copy()
    total = np.zeros_like(corrected)
    removed = []
    coarse = np.arange(-90, 90, coarse_step)

    for it in range(iteration_count):
        pass_name = f'Pass {it + 1}/{iteration_count}'
        report((it + 0.03) / progress_denominator,
               f'{pass_name}: estimating background')
        lp = background_lowpass(corrected, bg_mask, bg_sigma)
        hp = np.where(bg_mask, corrected - lp, np.nan)
        hpz = np.where(bg_mask, corrected - lp, 0.0)

        if forced is not None:
            theta = forced[it]
            report((it + 0.82) / progress_denominator,
                   f'{pass_name}: using fixed angle {theta:+.3f} deg')
        else:
            report((it + 0.12) / progress_denominator,
                   f'{pass_name}: scanning coarse angles')
            sc = angle_scan(
                hpz, bg_mask, coarse, mad, detrend_sigma,
                progress=lambda fraction: report(
                    (it + 0.12 + 0.60 * fraction) / progress_denominator,
                    f'{pass_name}: scanning coarse angles'))
            base = np.nanmedian(sc)
            madsc = np.nanmedian(np.abs(sc - base)) * 1.4826
            k = int(np.nanargmax(sc))
            peak_sig = (sc[k] - base) / max(madsc, 1e-30)
            if verbose:
                print(f'[{it}] peak {coarse[k]:+.1f} deg, score {sc[k]:.2e}, '
                      f'significance {peak_sig:.1f}')
            if peak_sig < signif_stop:
                if verbose:
                    print('  stop: no significant stripe direction remains')
                report(1.0, 'No significant stripe direction remains')
                break
            fine = np.arange(coarse[k] - 1.5, coarse[k] + 1.51, 0.125)
            report((it + 0.73) / progress_denominator,
                   f'{pass_name}: refining angle')
            sf = angle_scan(
                hpz, bg_mask, fine, mad, detrend_sigma,
                progress=lambda fraction: report(
                    (it + 0.73 + 0.09 * fraction) / progress_denominator,
                    f'{pass_name}: refining angle'))
            theta = float(fine[np.nanargmax(sf)])

        # Global profile and isolated-linear-feature test.
        report((it + 0.84) / progress_denominator,
               f'{pass_name}: estimating global stripe field')
        S, prof, nvar, iv_bg, vmin = stripe_field(
            hp, bg_mask, theta, win=None, detrend_sigma=detrend_sigma,
            sigma_pix=mad, wiener=True, return_profile=True)
        is_lin, rows = linear_feature_rows(prof, nvar)
        if is_lin and forced is None:
            # Mask these line pixels instead of subtracting a full-frame line.
            H, W = img.shape
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
            t = np.deg2rad(theta)
            vf = (yy - (H - 1) / 2) * np.cos(t) - (xx - (W - 1) / 2) * np.sin(t)
            ivf = np.round(vf - vmin).astype(np.int64)
            bad = np.isin(ivf, rows)
            bad = ndimage.binary_dilation(bad, iterations=2)
            bg_mask = bg_mask & ~bad
            if verbose:
                print(f'    theta {theta:+.3f}: isolated linear feature '
                      f'({len(rows)} rows), masked {bad.sum()} px, no subtraction')
            report((it + 1.0) / progress_denominator,
                   f'{pass_name}: protected linear feature')
            continue

        corrected -= S
        total += S
        # Optional slowly varying along-stripe component, controlled by Wiener.
        if win is not None:
            report((it + 0.93) / progress_denominator,
                   f'{pass_name}: estimating along-stripe variation')
            hp2 = np.where(bg_mask, hp - S, np.nan)
            S2 = stripe_field(hp2, bg_mask, theta, win=win, smooth_along=smooth_along,
                              detrend_sigma=detrend_sigma, sigma_pix=mad, wiener=True)
            corrected -= S2
            total += S2
        else:
            S2 = None
        removed.append(theta)
        if verbose:
            s2rms = 0.0 if S2 is None else float(np.std(S2))
            print(f'    removed theta={theta:+.3f}: global RMS {np.std(S):.2e}, '
                  f'windowed RMS {s2rms:.2e}')
        report((it + 1.0) / progress_denominator,
               f'{pass_name}: stripe family removed')

    report(1.0, 'Stripe-field estimation complete')
    return {'corrected': corrected, 'stripes': total, 'angles': removed,
            'bg_mask': bg_mask, 'mad': mad, 'median': med}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _save_jpg(img, corrected, stripes, bg_mask, mad, out_path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    def hpview(x):
        lp = background_lowpass(x, bg_mask, 100.0)
        return ndimage.gaussian_filter(np.where(bg_mask, x - lp, 0.0), 2)

    v = mad
    fig, axes = plt.subplots(1, 3, figsize=(21, 7.5), dpi=110)
    axes[0].imshow(hpview(img), cmap='gray', origin='lower', vmin=-v, vmax=v,
                   interpolation='nearest')
    axes[0].set_title('Input (high-pass, +/-1 MAD)')
    axes[1].imshow(hpview(corrected), cmap='gray', origin='lower', vmin=-v, vmax=v,
                   interpolation='nearest')
    axes[1].set_title('Destriped')
    axes[2].imshow(ndimage.gaussian_filter(stripes, 2), cmap='coolwarm',
                   origin='lower', vmin=-v, vmax=v, interpolation='nearest')
    axes[2].set_title('Stripes removed')
    for ax in axes:
        ax.axis('off')
    fig.tight_layout()
    fig.savefig(out_path, dpi=110)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('input', help='linear monochrome FITS mosaic')
    ap.add_argument('-o', '--output', default='output', help='output directory')
    ap.add_argument('--max-iter', type=int, default=12)
    ap.add_argument('--signif', type=float, default=5.0,
                    help='angle-scan stopping threshold in sigma')
    ap.add_argument('--angles', default=None,
                    help='fixed angles, for example "0.0,0.5"; skips scanning')
    ap.add_argument('--win', type=int, default=1024,
                    help='along-stripe window; 0 selects the global profile')
    ap.add_argument('--detrend', type=float, default=25.0)
    ap.add_argument('--bg-sigma', type=float, default=100.0)
    ap.add_argument('--mask-k', type=float, default=3.0)
    ap.add_argument('--jpg', action='store_true')
    ap.add_argument('--progress-protocol', action='store_true',
                    help=argparse.SUPPRESS)
    args = ap.parse_args()

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    stem = Path(args.input).stem

    def emit_progress(fraction: float, phase: str) -> None:
        if args.progress_protocol:
            print(f'BBSF_PROGRESS\t{np.clip(fraction, 0.0, 1.0):.6f}\t{phase}',
                  flush=True)

    if args.progress_protocol:
        print(f'BBSF_INFO\tworkers=1\tlogical_cpus={os.cpu_count() or 1}',
              flush=True)
    emit_progress(0.01, 'Reading temporary FITS')
    with fits.open(args.input) as h:
        hdu = h[0] if h[0].data is not None else h[1]
        img = hdu.data.astype(np.float64)
        # Sanitize malformed cards found in some PixInsight FITS exports.
        header = fits.Header()
        for card in hdu.header.cards:
            try:
                str(card)
                header.append(card)
            except Exception:
                continue
    emit_progress(0.05, 'Input image loaded')

    t0 = time.time()
    angles = [float(a) for a in args.angles.split(',')] if args.angles else None
    res = destripe_greedy(img, max_iter=args.max_iter, signif_stop=args.signif,
                          bg_sigma=args.bg_sigma, mask_k=args.mask_k,
                          detrend_sigma=args.detrend,
                          win=args.win if args.win > 0 else None,
                          angles=angles,
                          progress=lambda fraction, phase: emit_progress(
                              0.05 + 0.87 * fraction, phase))
    print(f'removed angles: {res["angles"]}  ({time.time() - t0:.0f}s)')

    emit_progress(0.94, 'Writing corrected FITS')
    fits.writeto(out / f'{stem}_destriped.fits',
                 res['corrected'].astype(np.float32), header, overwrite=True)
    emit_progress(0.97, 'Writing signed stripe model')
    fits.writeto(out / f'{stem}_stripes.fits',
                 res['stripes'].astype(np.float32), header, overwrite=True)
    if args.jpg:
        _save_jpg(img, res['corrected'], res['stripes'], res['bg_mask'],
                  res['mad'], out / f'{stem}_destripe.jpg')
    emit_progress(1.0, 'Python processing complete')
    print(f'outputs written to {out}/')


if __name__ == '__main__':
    main()
