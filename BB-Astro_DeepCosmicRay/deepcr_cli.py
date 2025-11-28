#!/usr/bin/env python3
"""
BB-Astro_DeepCosmicRay CLI for PixInsight - XISF Support
=========================================================

Command-line interface with native XISF format support.
Handles both FITS and XISF files natively.

License:
    CC BY-NC-SA 4.0 - Copyright (c) 2025 Benoit Blanco (non-commercial)
    DeepCR: BSD-3-Clause - Copyright (c) 2019 The Regents of the University of California

Author: Benoit Blanco (BB-Astro)
Version: 2.1
"""

import sys
import os
import argparse
import traceback
from pathlib import Path
import numpy as np

def load_image(filepath):
    """
    Load image from FITS or XISF file.

    Returns:
        tuple: (image_data, metadata_dict, format_type)
    """
    filepath = Path(filepath)
    suffix = filepath.suffix.lower()

    if suffix in ['.xisf']:
        # Load XISF
        try:
            from xisf import XISF

            xisf = XISF(str(filepath))
            file_meta = xisf.get_file_metadata()
            images_meta = xisf.get_images_metadata()

            # Read first image
            im_data = xisf.read_image(0)

            # Get metadata
            metadata = {
                'format': 'XISF',
                'file_meta': file_meta,
                'image_meta': images_meta[0] if images_meta else {}
            }

            return im_data, metadata, 'XISF'

        except ImportError:
            print("ERROR: xisf library not installed. Run: pip install xisf")
            sys.exit(1)

    elif suffix in ['.fits', '.fit']:
        # Load FITS
        try:
            from astropy.io import fits

            with fits.open(filepath) as hdul:
                image = hdul[0].data
                header = hdul[0].header

            metadata = {
                'format': 'FITS',
                'header': header
            }

            return image, metadata, 'FITS'

        except ImportError:
            print("ERROR: astropy not installed. Run: pip install astropy")
            sys.exit(1)
    else:
        print(f"ERROR: Unsupported file format: {suffix}")
        print("Supported formats: .xisf, .fits, .fit")
        sys.exit(1)

def save_image(filepath, data, metadata, output_format='XISF'):
    """
    Save image to FITS or XISF file.

    Args:
        filepath: Output path
        data: Image data (numpy array)
        metadata: Metadata dict from load_image
        output_format: 'XISF' or 'FITS'
    """
    filepath = Path(filepath)

    if output_format == 'XISF':
        try:
            from xisf import XISF

            # XISF needs (H, W, C) format for mono images
            if len(data.shape) == 2:
                data_to_save = data[:, :, np.newaxis]  # Add channel dimension
            else:
                data_to_save = data

            # XISF.write is a static method
            XISF.write(str(filepath), data_to_save)

        except ImportError:
            print("WARNING: xisf not available, falling back to FITS")
            save_image(filepath.with_suffix('.fits'), data, metadata, 'FITS')

    elif output_format == 'FITS':
        from astropy.io import fits

        header = metadata.get('header', None)

        try:
            fits.writeto(filepath, data.astype(np.float32),
                        header=header, overwrite=True)
        except (ValueError, OSError, fits.VerifyError) as e:
            # If header problematic, save without
            fits.writeto(filepath, data.astype(np.float32), overwrite=True)

def main():
    parser = argparse.ArgumentParser(
        description='BB-Astro DeepCR - Deep learning cosmic ray removal with XISF support'
    )

    parser.add_argument('input', help='Input XISF or FITS file')
    parser.add_argument('output_dir', help='Output directory')
    parser.add_argument('threshold', type=float, help='Detection threshold (0.05-0.5)')
    parser.add_argument('--preset', choices=['optimal', 'aggressive', 'conservative', 'acs_default'],
                       help='Preset configuration')
    parser.add_argument('--save-mask', action='store_true', help='Save CR mask')
    parser.add_argument('--format', choices=['XISF', 'FITS'], default='XISF',
                       help='Output format (default: XISF)')

    args = parser.parse_args()

    # Import DeepCR
    try:
        from deepCR import deepCR
    except ImportError:
        print("ERROR: DeepCR not installed. Run: pip install deepCR")
        sys.exit(1)

    print(f"\nBB-Astro DeepCosmicRay v2.1 (XISF Support)")
    print("="*60)
    print(f"Input: {args.input}")
    print(f"Output directory: {args.output_dir}")
    print(f"Output format: {args.format}")
    print(f"Threshold: {args.threshold}")
    if args.preset:
        print(f"Preset: {args.preset}")

    # Determine model and threshold from preset
    if args.preset == 'optimal':
        model_name = "WFC3-UVIS"
        threshold = 0.1
    elif args.preset == 'aggressive':
        model_name = "WFC3-UVIS"
        threshold = 0.05
    elif args.preset == 'conservative':
        model_name = "WFC3-UVIS"
        threshold = 0.2
    elif args.preset == 'acs_default':
        model_name = "ACS-WFC"
        threshold = 0.5
    else:
        model_name = "WFC3-UVIS"
        threshold = args.threshold

    print(f"Model: {model_name}")

    # Validate threshold
    if not 0.0 < threshold <= 1.0:
        print(f"ERROR: Threshold must be between 0 and 1 (exclusive of 0), got {threshold}")
        sys.exit(1)

    # Load image
    print(f"\nLoading image...")
    try:
        image, metadata, input_format = load_image(args.input)

        print(f"  Format: {input_format}")

        # Convert to float32 if needed
        if image.dtype != np.float32:
            image = image.astype(np.float32)

        # XISF returns (H, W, C) format, DeepCR expects (H, W) for mono
        if len(image.shape) == 3 and image.shape[2] == 1:
            image = image.squeeze(axis=2)
            print(f"  Converted from 3D to 2D (mono channel)")

        print(f"  Shape: {image.shape}")
        print(f"  Dtype: {image.dtype}")
        print(f"  Range: [{np.nanmin(image):.3f}, {np.nanmax(image):.3f}]")

    except Exception as e:
        print(f"ERROR loading image: {e}")
        traceback.print_exc()
        sys.exit(1)

    # Initialize DeepCR
    print(f"\nInitializing DeepCR model: {model_name}...")
    try:
        mdl = deepCR(mask=model_name, device="CPU")
        print("  Model loaded successfully")
    except Exception as e:
        print(f"ERROR loading model: {e}")
        sys.exit(1)

    # Process
    print(f"\nProcessing image (threshold={threshold})...")
    try:
        mask, cleaned = mdl.clean(
            image,
            threshold=threshold,
            inpaint=True,
            segment=True,
            patch=512,
            n_jobs=1
        )

        n_cr = np.sum(mask)
        pct_cr = (n_cr / mask.size) * 100

        print(f"  Cosmic rays detected: {n_cr:.0f} pixels ({pct_cr:.3f}%)")

    except Exception as e:
        print(f"ERROR during processing: {e}")
        sys.exit(1)

    # Save results - validate output directory with security checks
    output_dir = Path(args.output_dir).resolve()

    # Security: Prevent path traversal attacks
    # Only allow output in home directory, temp directories, or current working directory
    cwd = Path.cwd().resolve()
    home = Path.home().resolve()
    temp_dirs = [Path('/tmp').resolve(), Path('/var/tmp').resolve()]
    temp_dirs.append(Path(os.environ.get('TMPDIR', '/tmp')).resolve())

    allowed_bases = [home, cwd] + temp_dirs
    is_allowed = False
    for base in allowed_bases:
        try:
            output_dir.relative_to(base)
            is_allowed = True
            break
        except ValueError:
            continue

    if not is_allowed:
        print(f"ERROR: Output directory must be within home, temp, or current directory")
        print(f"Requested: {output_dir}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    input_path = Path(args.input)
    base_name = input_path.stem

    # Determine output extension
    output_ext = '.xisf' if args.format == 'XISF' else '.fits'

    # Cleaned image
    cleaned_path = output_dir / f"{base_name}_deepcr_th{threshold}_cleaned{output_ext}"
    print(f"\nSaving cleaned image ({args.format}): {cleaned_path.name}")

    try:
        save_image(cleaned_path, cleaned, metadata, args.format)
        print(f"  Saved successfully")
    except Exception as e:
        print(f"ERROR saving cleaned image: {e}")
        traceback.print_exc()
        sys.exit(1)

    # Mask (if requested)
    if args.save_mask:
        mask_path = output_dir / f"{base_name}_deepcr_th{threshold}_mask{output_ext}"
        print(f"Saving CR mask ({args.format}): {mask_path.name}")

        try:
            # Mask metadata (simpler)
            mask_metadata = {'format': args.format}
            save_image(mask_path, mask.astype(np.uint8), mask_metadata, args.format)
            print(f"  Saved successfully")
        except Exception as e:
            print(f"ERROR saving mask: {e}")
            sys.exit(1)

    print(f"\n{'='*60}")
    print(f"SUCCESS! Cosmic rays removed with DeepCR")
    print(f"Model: {model_name}, Threshold: {threshold}")
    print(f"Output format: {args.format}")
    print(f"{'='*60}\n")

    return 0

if __name__ == '__main__':
    sys.exit(main())
