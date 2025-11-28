#!/usr/bin/env python3
"""
L.A.Cosmic CLI - Command-line interface for cosmic ray removal
Uses astroscrappy implementation of the L.A.Cosmic algorithm (van Dokkum 2001)

Usage:
    python lacosmic_cli.py input.fits --outdir ./out --suffix _crr --save-mask
        --sigclip 2.0 --objlim 2.0 --readnoise 9.0 --gain 1.0 --satlevel 65535
        --niter 4 --cleantype meanmask --sepmed True --fsmode median
        --psffwhm 2.5 --psfsize 7

Copyright (c) 2024 Benoit Blanco
Distributed under the MIT License
"""

import os
import sys
import argparse
import time
from pathlib import Path
import numpy as np

try:
    from astropy.io import fits
    from astropy.utils.exceptions import AstropyWarning
    import warnings
    warnings.simplefilter('ignore', AstropyWarning)
except ImportError:
    print("Error: astropy is required. Install with: pip install astropy", file=sys.stderr)
    sys.exit(1)

try:
    from astroscrappy import detect_cosmics
except ImportError:
    print("Error: astroscrappy is required. Install with: pip install astroscrappy", file=sys.stderr)
    sys.exit(1)


def parse_arguments():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description='L.A.Cosmic Cosmic Ray Removal CLI',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    # Input/Output
    parser.add_argument('input', help='Input FITS file')
    parser.add_argument('--outdir', default='.', help='Output directory')
    parser.add_argument('--suffix', default='_crr', help='Output file suffix for cleaned image')
    parser.add_argument('--save-mask', action='store_true', help='Save cosmic ray mask')

    # L.A.Cosmic parameters - V3 OPTIMIZED
    parser.add_argument('--sigclip', type=float, default=1.5,
                        help='Laplacian-to-noise limit for CR detection (V3: 1.5 = aggressive)')
    parser.add_argument('--sigfrac', type=float, default=0.3,
                        help='Fractional detection limit for neighboring pixels')
    parser.add_argument('--objlim', type=float, default=1.5,
                        help='Minimum Laplacian-to-noise for an object (V3: 1.5 = aggressive)')
    parser.add_argument('--gain', type=float, default=1.0,
                        help='CCD gain in electrons per ADU')
    parser.add_argument('--readnoise', type=float, default=9.0,
                        help='Read noise in electrons')
    parser.add_argument('--satlevel', type=float, default=65535,
                        help='Saturation level in ADU (V3: fixed to 65535)')
    parser.add_argument('--niter', type=int, default=6,
                        help='Number of L.A.Cosmic iterations (V3: 6 = optimal)')

    # Optional parameters
    parser.add_argument('--sepmed', type=str, default='True',
                        choices=['True', 'False'],
                        help='Use separable median filter')
    parser.add_argument('--cleantype', type=str, default='meanmask',
                        choices=['median', 'medmask', 'meanmask', 'idw'],
                        help='Method to clean cosmic ray pixels')
    parser.add_argument('--fsmode', type=str, default='median',
                        choices=['median', 'convolve'],
                        help='Method to build fine structure image')
    parser.add_argument('--psfmodel', type=str, default='gauss',
                        choices=['gauss', 'gaussx', 'gaussy', 'moffat'],
                        help='PSF model for convolution')
    parser.add_argument('--psffwhm', type=float, default=2.5,
                        help='FWHM of the PSF in pixels')
    parser.add_argument('--psfsize', type=int, default=7,
                        help='Size of PSF kernel (odd number)')
    parser.add_argument('--psfbeta', type=float, default=4.765,
                        help='Moffat beta parameter')

    # Verbosity
    parser.add_argument('--verbose', action='store_true',
                        help='Enable verbose output')

    return parser.parse_args()


def load_image(filename):
    """Load FITS file and return data, header, rescale_factor, and rescale_offset.

    Args:
        filename: Path to the input FITS file (.fits or .fit)

    Returns:
        tuple: (data, header, rescale_factor, rescale_offset)
            - data: numpy array (float64) of image data
            - header: FITS header
            - rescale_factor: factor used if image was rescaled from normalized
            - rescale_offset: offset used if image was rescaled from normalized
    """
    try:
        # Determine file type
        ext = filename.lower().split('.')[-1]

        # XISF format is not supported - it requires a dedicated library (pyxisf)
        # PixInsight exports to FITS for this script
        if ext in ['xisf']:
            print(f"Error: XISF format is not directly supported.", file=sys.stderr)
            print(f"Please export your image as FITS from PixInsight first.", file=sys.stderr)
            print(f"In PixInsight: File > Save As > FITS (*.fits)", file=sys.stderr)
            sys.exit(1)

        # FITS format
        with fits.open(filename) as hdul:
            data = hdul[0].data
            header = hdul[0].header

            if data is None:
                # Try other HDUs
                for hdu in hdul[1:]:
                    if hasattr(hdu, 'data') and hdu.data is not None:
                        data = hdu.data
                        header = hdu.header
                        break

        if data is None:
            raise ValueError(f"No image data found in {filename}")

        # Ensure we have 2D data
        if data.ndim == 3:
            # Handle color images or data cubes
            if data.shape[0] == 1:
                data = data[0]
            elif data.shape[2] == 1:
                data = data[:, :, 0]
            else:
                # Multi-channel images are not supported
                print(f"Error: Multi-channel images are not supported. Image shape: {data.shape}", file=sys.stderr)
                print("Please extract individual channels in PixInsight before processing.", file=sys.stderr)
                sys.exit(1)
        elif data.ndim != 2:
            print(f"Error: Expected 2D image, got {data.ndim}D data", file=sys.stderr)
            sys.exit(1)

        # Validate minimum dimensions for L.A.Cosmic
        MIN_DIM = 25
        if data.shape[0] < MIN_DIM or data.shape[1] < MIN_DIM:
            print(f"Error: Image too small ({data.shape}). Minimum size is {MIN_DIM}x{MIN_DIM} pixels.", file=sys.stderr)
            sys.exit(1)

        # AUTO-DETECT: Is image in ADU or normalized?
        # If max value is <= 1.5, assume normalized (0-1 range)
        # Otherwise, assume ADU range
        data_min = data.min()
        data_max = data.max()
        data_median = np.median(data)

        is_normalized = (data_max <= 1.5)

        print(f"\nImage statistics:", file=sys.stderr)
        print(f"  Range: {data_min:.6f} → {data_max:.6f}", file=sys.stderr)
        print(f"  Median: {data_median:.6f}", file=sys.stderr)
        print(f"  Type: {data.dtype}", file=sys.stderr)

        # Store original scale info in header for later restoration
        rescale_factor = 1.0
        rescale_offset = 0.0

        if is_normalized:
            print(f"\n[WARNING] Image appears to be NORMALIZED (0-1 range)", file=sys.stderr)
            print(f"          L.A.Cosmic works best with ADU values (0-65535)", file=sys.stderr)
            print(f"          Auto-scaling to 16-bit ADU range...", file=sys.stderr)

            # Rescale to 16-bit ADU (0-65535)
            # Use 65535 instead of 65536 to stay within uint16 max for better compatibility
            rescale_offset = data_min
            rescale_factor = 65535.0 / (data_max - data_min) if (data_max - data_min) > 0 else 1.0

            data = (data - rescale_offset) * rescale_factor

            print(f"   Rescaled range: {data.min():.1f} → {data.max():.1f} ADU", file=sys.stderr)
            print(f"   Rescale factor: {rescale_factor:.2f}", file=sys.stderr)

            # Store flag to adjust noise parameters later
            header['BBRESCAL'] = (True, 'BB rescaled from normalized')
            header['BBRSCFAC'] = (rescale_factor, 'BB rescale factor')

        return data.astype(np.float64), header, rescale_factor, rescale_offset

    except Exception as e:
        print(f"Error loading {filename}: {e}", file=sys.stderr)
        sys.exit(1)


def save_fits(filename, data, header, history_msg=None, rescale_factor=1.0, rescale_offset=0.0):
    """Save data to FITS file with header preservation and optional rescaling."""
    try:
        # If image was rescaled, restore to original range
        if rescale_factor != 1.0 or rescale_offset != 0.0:
            print(f"\nRestoring original image scale...", file=sys.stderr)
            data = (data / rescale_factor) + rescale_offset
            print(f"  Restored range: {data.min():.6f} → {data.max():.6f}", file=sys.stderr)

        # Create a clean copy of the header to avoid CONTINUE card issues
        clean_header = fits.Header()

        # Copy essential keywords, skip problematic ones
        skip_keywords = ['COMMENT', 'HISTORY', 'CONTINUE', '']
        for card in header.cards:
            if card.keyword not in skip_keywords:
                try:
                    clean_header[card.keyword] = (card.value, card.comment)
                except Exception:
                    # Skip cards that can't be copied (e.g., malformed FITS cards)
                    pass

        # Add processing info
        if history_msg:
            try:
                clean_header.add_history(history_msg)
            except:
                pass

        # Create HDU and save
        hdu = fits.PrimaryHDU(data=data, header=clean_header)
        hdul = fits.HDUList([hdu])
        hdul.writeto(filename, overwrite=True)
        return True

    except Exception as e:
        print(f"Error saving {filename}: {e}", file=sys.stderr)
        return False


def run_lacosmic(data, args, rescale_factor=1.0):
    """Run L.A.Cosmic algorithm on the data."""
    try:
        # Convert string boolean to actual boolean
        sepmed = args.sepmed == 'True'

        # Ensure proper data type
        data = data.astype(np.float64)

        # V3: No readnoise adjustment needed
        # Testing showed the × 0.5 hack had minimal impact (<1%)
        # Better results achieved through optimized sigclip/objlim/niter
        adjusted_readnoise = args.readnoise
        adjusted_gain = args.gain
        adjusted_satlevel = args.satlevel

        if rescale_factor != 1.0 and args.verbose:
            print(f"\n  Image was rescaled (factor={rescale_factor:.1f})", file=sys.stderr)
            print(f"  Using readnoise as-is: {args.readnoise}", file=sys.stderr)

        # Print parameters if verbose
        if args.verbose:
            print(f"\nRunning L.A.Cosmic with parameters:", file=sys.stderr)
            print(f"  sigclip = {args.sigclip}", file=sys.stderr)
            print(f"  sigfrac = {args.sigfrac}", file=sys.stderr)
            print(f"  objlim = {args.objlim}", file=sys.stderr)
            print(f"  gain = {adjusted_gain}", file=sys.stderr)
            print(f"  readnoise = {adjusted_readnoise}", file=sys.stderr)
            print(f"  satlevel = {adjusted_satlevel}", file=sys.stderr)
            print(f"  niter = {args.niter}", file=sys.stderr)
            print(f"  sepmed = {sepmed}", file=sys.stderr)
            print(f"  cleantype = {args.cleantype}", file=sys.stderr)
            print(f"  fsmode = {args.fsmode}", file=sys.stderr)

        # Run cosmic ray detection
        # Note: astroscrappy.detect_cosmics returns (mask, cleaned_data) in that order
        mask, cleaned_data = detect_cosmics(
            data,
            sigclip=args.sigclip,
            sigfrac=args.sigfrac,
            objlim=args.objlim,
            gain=adjusted_gain,
            readnoise=adjusted_readnoise,
            satlevel=adjusted_satlevel,
            niter=args.niter,
            sepmed=sepmed,
            cleantype=args.cleantype,
            fsmode=args.fsmode,
            psfmodel=args.psfmodel,
            psffwhm=args.psffwhm,
            psfsize=args.psfsize,
            psfbeta=args.psfbeta,
            verbose=args.verbose
        )

        # Count cosmic rays
        num_crs = np.sum(mask)
        total_pixels = mask.size
        cr_percentage = (num_crs / total_pixels) * 100

        if args.verbose:
            print(f"Detected {num_crs} cosmic ray pixels ({cr_percentage:.3f}% of image)", file=sys.stderr)

        return cleaned_data, mask, num_crs

    except Exception as e:
        print(f"Error running L.A.Cosmic: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    """Main function."""
    args = parse_arguments()

    # Check input file
    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Validate and create output directory with security checks
    try:
        outdir = Path(args.outdir).resolve()

        # Security: Prevent path traversal attacks
        # Only allow output in home directory, temp directories, or current working directory
        cwd = Path.cwd().resolve()
        home = Path.home().resolve()
        temp_dirs = [Path('/tmp').resolve(), Path('/var/tmp').resolve()]
        if hasattr(Path, 'home'):
            temp_dirs.append(Path(os.environ.get('TMPDIR', '/tmp')).resolve())

        allowed_bases = [home, cwd] + temp_dirs
        is_allowed = False
        for base in allowed_bases:
            try:
                outdir.relative_to(base)
                is_allowed = True
                break
            except ValueError:
                continue

        if not is_allowed:
            print(f"Error: Output directory must be within home, temp, or current directory", file=sys.stderr)
            print(f"Requested: {outdir}", file=sys.stderr)
            sys.exit(1)

        outdir.mkdir(parents=True, exist_ok=True)
    except (OSError, ValueError) as e:
        print(f"Error: Invalid output directory: {args.outdir}", file=sys.stderr)
        print(f"Details: {e}", file=sys.stderr)
        sys.exit(1)

    # Load input FITS/XISF
    print(f"Loading {args.input}...", file=sys.stderr)
    data, header, rescale_factor, rescale_offset = load_image(args.input)

    # Get base filename
    base_name = Path(args.input).stem

    # Run L.A.Cosmic
    print(f"\nRunning L.A.Cosmic algorithm...", file=sys.stderr)
    start_time = time.time()

    cleaned_data, mask, num_crs = run_lacosmic(data, args, rescale_factor)

    elapsed = time.time() - start_time
    print(f"Processing completed in {elapsed:.2f} seconds", file=sys.stderr)

    # Prepare history message
    rescale_info = f", auto-rescaled from normalized" if rescale_factor != 1.0 else ""
    history = (f"L.A.Cosmic CRR: sigclip={args.sigclip}, objlim={args.objlim}, "
               f"niter={args.niter}, {num_crs} CRs removed{rescale_info}")

    # Save cleaned image
    output_file = outdir / f"{base_name}{args.suffix}.fits"
    print(f"\nSaving cleaned image to {output_file}...", file=sys.stderr)

    if save_fits(output_file, cleaned_data, header.copy(), history, rescale_factor, rescale_offset):
        print(f"Cleaned image saved: {output_file}")
    else:
        print(f"Error: Failed to save cleaned image", file=sys.stderr)
        sys.exit(1)

    # Save mask if requested
    if args.save_mask:
        mask_file = outdir / f"{base_name}_crm.fits"
        print(f"Saving cosmic ray mask to {mask_file}...", file=sys.stderr)

        # Create mask header
        mask_header = header.copy()
        mask_header.add_comment("Cosmic ray mask: 1 = cosmic ray, 0 = clean pixel")
        mask_header.add_history(f"L.A.Cosmic mask: {num_crs} cosmic rays detected")

        # Convert boolean mask to uint8
        mask_uint8 = mask.astype(np.uint8)

        if save_fits(mask_file, mask_uint8, mask_header):
            print(f"Mask saved: {mask_file}")
        else:
            print(f"Error: Failed to save mask", file=sys.stderr)
            sys.exit(1)

    # Summary
    print(f"\nSummary:", file=sys.stderr)
    print(f"  Input: {args.input}", file=sys.stderr)
    print(f"  Output: {output_file}", file=sys.stderr)
    if args.save_mask:
        print(f"  Mask: {mask_file}", file=sys.stderr)
    print(f"  Cosmic rays detected: {num_crs} ({(num_crs/mask.size)*100:.3f}%)", file=sys.stderr)
    print(f"  Processing time: {elapsed:.2f} seconds", file=sys.stderr)

    return 0


if __name__ == '__main__':
    sys.exit(main())