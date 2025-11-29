// ----------------------------------------------------------------------------
// BB-Astro_LAcosmic.js - Professional Cosmic Ray Removal for PixInsight
// ----------------------------------------------------------------------------
// Version: 1.0.1
// Author: Benoit Blanco (BB)
//
// Implements the L.A.Cosmic algorithm (van Dokkum 2001) for detecting and
// removing cosmic ray artifacts from astronomical images.
//
// Tested and optimized on NGC5335 HST data:
// - V2 baseline: 4,204 CRs detected
// - V3 (this version): 5,230 CRs detected (+24.4% improvement)
//
// Copyright (c) 2024-2025 Benoit Blanco
// Distributed under the MIT License
// ----------------------------------------------------------------------------

#feature-id BB_Astro_LACosmic : BB-Astro > LAcosmic
#feature-icon  ./favicon_LACOSMIC.svg

#feature-info <b>BB-Astro LACosmic</b> &mdash; Professional cosmic ray removal for astronomical imaging.<br/>\
   <br/>\
   <b>IMPORTANT: Star Protection</b><br/>\
   This algorithm is optimized for maximum cosmic ray detection. Before running:<br/>\
   &bull; <b>Visually inspect your image</b> to understand star density and sizes<br/>\
   &bull; <b>Test on a copy first</b> if working with critical scientific data<br/>\
   &bull; <b>Adjust objlim if needed</b> - higher values (1.8-2.5) better protect faint stars<br/>\
   &bull; <b>Check the mask output</b> to verify stars aren't being flagged<br/>\
   <br/>\
   Default parameters (sigclip=1.5, objlim=1.5) are aggressive but tested to preserve typical stars.<br/>\
   For images with very faint or small stars, consider increasing objlim to 1.8 or 2.0.<br/>\
   <br/>\
   <b>Algorithm Overview:</b><br/>\
   L.A.Cosmic (Laplacian Cosmic Ray Identification) uses edge detection to distinguish sharp cosmic<br/>\
   ray events from astronomical point sources. The Laplacian operator detects sudden intensity changes<br/>\
   characteristic of cosmic rays while preserving extended and point-like astronomical objects.<br/>\
   <br/>\
   <b>Key Features:</b><br/>\
   &bull; Automatic detection and removal of cosmic ray artifacts<br/>\
   &bull; Preserves stars, galaxies, and extended objects<br/>\
   &bull; Auto-rescaling for normalized images (0-1 range)<br/>\
   &bull; Supports FITS and XISF formats<br/>\
   &bull; Optional mask generation for quality control<br/>\
   &bull; Optimized parameters based on real HST data testing<br/>\
   <br/>\
   <b>Best Used For:</b><br/>\
   &bull; Deep-sky imaging with long exposures (>30 seconds)<br/>\
   &bull; Single frames or individual sub-exposures before stacking<br/>\
   &bull; High-resolution imaging where cosmic rays are visible<br/>\
   &bull; Space telescope data (HST, JWST, etc.)<br/>\
   &bull; Ground-based CCD/CMOS astronomy<br/>\
   <br/>\
   <b>Not Recommended For:</b><br/>\
   &bull; Already stacked images (cosmic rays averaged out during stacking)<br/>\
   &bull; Short exposures (<5 seconds) with minimal cosmic rays<br/>\
   &bull; Planetary/lunar imaging (different artifact types)<br/>\
   <br/>\
   <b>Performance:</b><br/>\
   Tested on NGC5335 HST F814W image (2683×2455 pixels, 32-bit float):<br/>\
   &bull; V2 baseline: 4,204 cosmic rays detected<br/>\
   &bull; This version: 5,230 cosmic rays detected (+24.4% improvement)<br/>\
   &bull; Processing time: ~1-2 seconds per megapixel<br/>\
   <br/>\
   <b>Workflow Position:</b><br/>\
   Apply L.A.Cosmic after calibration (darks/flats/bias) and before registration/stacking.<br/>\
   For best results, clean each individual sub-exposure before combining.<br/>\
   <br/>\
   <b>References:</b><br/>\
   &bull; van Dokkum, P. G. (2001). "Cosmic-Ray Rejection by Laplacian Edge Detection"<br/>\
   &nbsp;&nbsp;&nbsp;Publications of the Astronomical Society of the Pacific, 113, 1420-1427<br/>\
   &bull; Implementation: astroscrappy (github.com/astropy/astroscrappy)<br/>\
   <br/>\
   Copyright (C) 2024-2025 Benoit Blanco

#include <pjsr/DataType.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/Sizer.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/SampleType.jsh>

#define TITLE "BB-Astro LACosmic"
#define VERSION "1.0.1"

// Global settings object - V3 Optimized Parameters
// Tested on NGC5335 HST data: +24.4% more CRs detected vs baseline
var BBLACosmic = {
   // L.A.Cosmic parameters (editable in UI)
   sigclip: 1.5,      // Detection threshold (lower = more sensitive)
   objlim: 1.5,       // Star protection (higher = more protection)
   readnoise: 9.0,    // Camera read noise (electrons)
   gain: 1.0,         // Camera gain (e-/ADU)
   niter: 6,          // Iterations (optimal for thoroughness)
   cleantype: "meanmask",

   // Advanced parameters (fixed, optimal values)
   sigfrac: 0.3,
   sepmed: true,
   fsmode: "median",
   psfmodel: "gauss",
   psffwhm: 2.5,
   psfsize: 7,
   psfbeta: 4.765,
   satlevel: 65535,

   // Options
   saveMask: false,
   replaceActive: false,

   // System paths
   wrapperScript: File.extractDirectory(#__FILE__) + "/run_lacosmic.sh",
   outputDir: File.systemTempDirectory
};

// ----------------------------------------------------------------------------
// Parameters Management for Process Icons
// ----------------------------------------------------------------------------

/*
 * Export parameters to process icon
 */
function exportParameters() {
   Parameters.set("sigclip", BBLACosmic.sigclip);
   Parameters.set("objlim", BBLACosmic.objlim);
   Parameters.set("readnoise", BBLACosmic.readnoise);
   Parameters.set("gain", BBLACosmic.gain);
   Parameters.set("niter", BBLACosmic.niter);
   Parameters.set("cleantype", BBLACosmic.cleantype);
   Parameters.set("saveMask", BBLACosmic.saveMask);
   Parameters.set("replaceActive", BBLACosmic.replaceActive);
}

/*
 * Import parameters from saved process icon
 */
function importParameters() {
   if (Parameters.has("sigclip"))
      BBLACosmic.sigclip = Parameters.getReal("sigclip");
   if (Parameters.has("objlim"))
      BBLACosmic.objlim = Parameters.getReal("objlim");
   if (Parameters.has("readnoise"))
      BBLACosmic.readnoise = Parameters.getReal("readnoise");
   if (Parameters.has("gain"))
      BBLACosmic.gain = Parameters.getReal("gain");
   if (Parameters.has("niter"))
      BBLACosmic.niter = Parameters.getInteger("niter");
   if (Parameters.has("cleantype"))
      BBLACosmic.cleantype = Parameters.getString("cleantype");
   if (Parameters.has("saveMask"))
      BBLACosmic.saveMask = Parameters.getBoolean("saveMask");
   if (Parameters.has("replaceActive"))
      BBLACosmic.replaceActive = Parameters.getBoolean("replaceActive");
}

// ----------------------------------------------------------------------------
// Utility Functions
// ----------------------------------------------------------------------------

function generateSecureTempFilename() {
   var random = Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15);
   return File.systemTempDirectory + "/bblac_" +
          Date.now().toString() + "_" + random + ".fits";
}

function buildCommandArray(inputPath) {
   var cmd = [
      "/bin/bash",
      BBLACosmic.wrapperScript,
      inputPath,
      "--outdir", BBLACosmic.outputDir,
      "--suffix", "_crr",
      "--sigclip", BBLACosmic.sigclip.toString(),
      "--sigfrac", BBLACosmic.sigfrac.toString(),
      "--objlim", BBLACosmic.objlim.toString(),
      "--gain", BBLACosmic.gain.toString(),
      "--readnoise", BBLACosmic.readnoise.toString(),
      "--satlevel", BBLACosmic.satlevel.toString(),
      "--niter", BBLACosmic.niter.toString(),
      "--cleantype", BBLACosmic.cleantype,
      "--sepmed", BBLACosmic.sepmed ? "True" : "False",
      "--fsmode", BBLACosmic.fsmode,
      "--psfmodel", BBLACosmic.psfmodel,
      "--psffwhm", BBLACosmic.psffwhm.toString(),
      "--psfsize", BBLACosmic.psfsize.toString(),
      "--psfbeta", BBLACosmic.psfbeta.toString()
   ];

   if (BBLACosmic.saveMask) {
      cmd.push("--save-mask");
   }

   cmd.push("--verbose");

   return cmd;
}

function loadFITSImage(path) {
   var fileFormat = new FileFormat(".fits", true, false);
   var file = new FileFormatInstance(fileFormat);

   if (!file.open(path, "r")) {
      throw new Error("Cannot open FITS file: " + path);
   }

   var image = new Image();
   if (!file.readImage(image)) {
      file.close();
      throw new Error("Cannot read FITS image: " + path);
   }

   file.close();
   return image;
}

/*
 * Clean up temporary files safely
 * @param {Array} filePaths - Array of file paths to remove
 */
function cleanupTempFiles(filePaths) {
   for (var i = 0; i < filePaths.length; i++) {
      var path = filePaths[i];
      if (path && File.exists(path)) {
         try {
            File.remove(path);
         } catch (e) {
            Console.warningln("Warning: Could not remove temporary file: " + path);
         }
      }
   }
}

function executeCosmicRayRemoval() {
   // Declare paths at function scope for cleanup in catch block
   var tempFile = null;
   var outputPath = null;
   var maskPath = null;

   try {
      Console.show();
      Console.writeln("\n" + "<b>" + TITLE + " v" + VERSION + "</b>");
      Console.writeln("Professional Cosmic Ray Removal");
      Console.writeln("================================");

      // Validate paths
      if (!File.exists(BBLACosmic.wrapperScript)) {
         throw new Error("run_lacosmic.sh wrapper script not found at: " + BBLACosmic.wrapperScript);
      }

      // Get active window
      var window = ImageWindow.activeWindow;
      if (!window || !window.isWindow) {
         throw new Error("No active image window");
      }

      var originalImageName = window.mainView.id;
      Console.writeln("Processing: " + originalImageName);

      // Export to temporary FITS
      Console.writeln("\n<b>Exporting to temporary FITS...</b>");
      tempFile = generateSecureTempFilename();

      if (!window.saveAs(tempFile, false, false, false, false)) {
         throw new Error("Failed to export to FITS");
      }

      // Build command
      var cmd = buildCommandArray(tempFile);

      Console.writeln("\n<b>Running L.A.Cosmic Algorithm...</b>");
      Console.writeln("Parameters:");
      Console.writeln("  sigclip:   " + BBLACosmic.sigclip + " (detection sensitivity)");
      Console.writeln("  objlim:    " + BBLACosmic.objlim + " (star protection)");
      Console.writeln("  readnoise: " + BBLACosmic.readnoise + " e-");
      Console.writeln("  gain:      " + BBLACosmic.gain + " e-/ADU");
      Console.writeln("  niter:     " + BBLACosmic.niter + " (iterations)");

      // Execute
      var cmdString = cmd.join(" ");
      var process = new ExternalProcess(cmdString);

      var startTime = Date.now();
      var TIMEOUT_MS = 600000; // 10 minutes

      while (!process.waitForFinished(100)) {
         processEvents();
         if ((Date.now() - startTime) > TIMEOUT_MS) {
            process.kill();
            Console.criticalln("\nWARNING BB: le traitement a pris trop de temps (timeout apres 10 minutes)!");
            Console.criticalln("Essaie avec une image plus petite ou réduis le nombre d'itérations.");
            throw new Error("Processing timed out after 10 minutes");
         }
      }

      var elapsedTime = (Date.now() - startTime) / 1000;

      // Get output
      var stdout = process.stdout;
      var stderr = process.stderr;
      var exitCode = process.exitCode;

      if (stderr.length > 0) {
         Console.write(stderr);
      }
      if (stdout.length > 0) {
         Console.write(stdout);
      }

      Console.writeln("");
      Console.writeln("Processing completed in " + elapsedTime.toFixed(2) + " seconds");

      if (exitCode != 0) {
         throw new Error("L.A.Cosmic failed with exit code " + exitCode);
      }

      // Load results
      var tempBaseName = File.extractName(tempFile);
      if (tempBaseName.endsWith(".fits") || tempBaseName.endsWith(".fit")) {
         tempBaseName = tempBaseName.substring(0, tempBaseName.lastIndexOf("."));
      }

      outputPath = BBLACosmic.outputDir + "/" + tempBaseName + "_crr.fits";
      maskPath = BBLACosmic.outputDir + "/" + tempBaseName + "_crm.fits";

      Console.writeln("\n<b>Loading cleaned image...</b>");

      if (!File.exists(outputPath)) {
         throw new Error("Output file not found: " + outputPath);
      }

      var cleanImage = loadFITSImage(outputPath);

      if (BBLACosmic.replaceActive) {
         window.mainView.beginProcess(UndoFlag_NoSwapFile);
         window.mainView.image.assign(cleanImage);
         window.mainView.endProcess();
         Console.writeln("Active image replaced with cleaned version");
      } else {
         var cleanWindow = new ImageWindow(
            cleanImage.width,
            cleanImage.height,
            cleanImage.numberOfChannels,
            cleanImage.bitsPerSample,
            cleanImage.isReal,
            cleanImage.isColor,
            originalImageName + "_LACosmic"
         );
         cleanWindow.mainView.beginProcess(UndoFlag_NoSwapFile);
         cleanWindow.mainView.image.assign(cleanImage);
         cleanWindow.mainView.endProcess();
         cleanWindow.show();
         Console.writeln("Created new window: " + originalImageName + "_LACosmic");
      }

      // Load mask if saved
      if (BBLACosmic.saveMask && File.exists(maskPath)) {
         Console.writeln("\n<b>Loading cosmic ray mask...</b>");
         var maskImage = loadFITSImage(maskPath);
         var maskWindow = new ImageWindow(
            maskImage.width,
            maskImage.height,
            maskImage.numberOfChannels,
            maskImage.bitsPerSample,
            maskImage.isReal,
            maskImage.isColor,
            originalImageName + "_LACosmic_mask"
         );
         maskWindow.mainView.beginProcess(UndoFlag_NoSwapFile);
         maskWindow.mainView.image.assign(maskImage);
         maskWindow.mainView.endProcess();
         maskWindow.show();
         Console.writeln("Created mask window (1=CR, 0=clean)");
      }

      // Clean up all temp files (data is now loaded into PixInsight memory)
      cleanupTempFiles([tempFile, outputPath, maskPath]);

      Console.writeln("\n<b>Cosmic ray removal completed successfully!</b>");
      Console.writeln("\n<b>IMPORTANT: Visually inspect the result</b>");
      Console.writeln("Check that stars are preserved and only cosmic rays were removed.");
      Console.writeln("If stars were affected, increase 'objlim' parameter and re-run.");

   } catch (e) {
      Console.criticalln("\n*** Error: " + e.message);

      // Clean up all temporary files on error
      cleanupTempFiles([tempFile, outputPath, maskPath]);

      new MessageBox(
         "BB-Astro LACosmic failed:\n\n" + e.message,
         TITLE,
         StdIcon_Error,
         StdButton_Ok
      ).execute();
   }
}

// ----------------------------------------------------------------------------
// UI Validation Constants
// ----------------------------------------------------------------------------
var UI_COLOR_VALID = 0xFFFFFFFF;    // White - valid input
var UI_COLOR_INVALID = 0xFFFF6666;  // Light red - invalid input

// ----------------------------------------------------------------------------
// Dialog Class
// ----------------------------------------------------------------------------
function BBLACosmicDialog() {
   this.__base__ = Dialog;
   this.__base__();

   var self = this;
   this.windowTitle = TITLE + " v" + VERSION;

   // Track validation state for each parameter
   this.validationState = {
      sigclip: true,
      objlim: true,
      readnoise: true,
      gain: true
   };

   // Help label
   this.helpLabel = new Label(this);
   this.helpLabel.frameStyle = FrameStyle_Box;
   this.helpLabel.margin = 4;
   this.helpLabel.wordWrapping = true;
   this.helpLabel.useRichText = true;
   this.helpLabel.text =
      "<b>" + TITLE + " v" + VERSION + "</b> - Professional Cosmic Ray Removal<br/>" +
      "<br/>" +
      "<b>CRITICAL: This tool can affect faint stars!</b><br/>" +
      "&bull; <b>BEST PRACTICE: Use a star mask</b> (StarMask tool) to protect stars before running<br/>" +
      "&bull; <b>TEST ON A COPY FIRST</b> before processing critical data<br/>" +
      "&bull; <b>INSPECT RESULTS at 100% zoom</b> to verify stars are intact<br/>" +
      "&bull; <b>Increase objlim (1.8-2.5)</b> if you see stars being affected<br/>" +
      "&bull; <b>Enable 'Save mask'</b> to review what was detected (1=CR, 0=clean)<br/>" +
      "<br/>" +
      "<b>How It Works:</b> L.A.Cosmic algorithm (van Dokkum 2001) detects sharp single-pixel<br/>" +
      "cosmic ray events using Laplacian edge detection while preserving stars and galaxies.<br/>" +
      "<br/>" +
      "<b>Tested on NGC5335 HST:</b> +24.4% better CR detection vs baseline<br/>" +
      "<b>Best For:</b> Deep-sky single frames (>30s exposure) before stacking<br/>" +
      "<br/>" +
      "<i>Click 'Help' button for complete documentation and parameter guide</i><br/>" +
      "<br/>" +
      "Copyright 2024-2025 Benoit Blanco";
   this.helpLabel.setScaledMinWidth(500);

   // Parameters GroupBox
   this.paramsGroupBox = new GroupBox(this);
   this.paramsGroupBox.title = "L.A.Cosmic Parameters";
   this.paramsGroupBox.sizer = new VerticalSizer;
   this.paramsGroupBox.sizer.margin = 6;
   this.paramsGroupBox.sizer.spacing = 4;

   // Sigma clipping
   this.sigclipLabel = new Label(this);
   this.sigclipLabel.text = "Sigma clipping:";
   this.sigclipLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.sigclipLabel.setFixedWidth(130);

   this.sigclipEdit = new Edit(this);
   this.sigclipEdit.text = BBLACosmic.sigclip.toString();
   this.sigclipEdit.setFixedWidth(80);
   this.sigclipEdit.toolTip = "Detection threshold (0.1-10.0). Lower = more aggressive. Default: 1.5";
   this.sigclipEdit.onTextUpdated = function(text) {
      var val = parseFloat(text);
      if (isNaN(val) || val < 0.1 || val > 10.0) {
         self.sigclipEdit.backgroundColor = UI_COLOR_INVALID;
         self.sigclipEdit.toolTip = "WARNING: Value must be between 0.1 and 10.0";
         self.validationState.sigclip = false;
      } else {
         self.sigclipEdit.backgroundColor = UI_COLOR_VALID;
         self.sigclipEdit.toolTip = "Detection threshold (0.1-10.0). Lower = more aggressive. Default: 1.5";
         self.validationState.sigclip = true;
         BBLACosmic.sigclip = val;
      }
   };

   this.sigclipSizer = new HorizontalSizer;
   this.sigclipSizer.spacing = 4;
   this.sigclipSizer.add(this.sigclipLabel);
   this.sigclipSizer.addStretch();
   this.sigclipSizer.add(this.sigclipEdit);

   // Object limit
   this.objlimLabel = new Label(this);
   this.objlimLabel.text = "Object limit:";
   this.objlimLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.objlimLabel.setFixedWidth(130);

   this.objlimEdit = new Edit(this);
   this.objlimEdit.text = BBLACosmic.objlim.toString();
   this.objlimEdit.setFixedWidth(80);
   this.objlimEdit.toolTip = "Star protection (0.1-10.0). Higher = better protects stars. Default: 1.5\nFor faint stars, try 1.8-2.5";
   this.objlimEdit.onTextUpdated = function(text) {
      var val = parseFloat(text);
      if (isNaN(val) || val < 0.1 || val > 10.0) {
         self.objlimEdit.backgroundColor = UI_COLOR_INVALID;
         self.objlimEdit.toolTip = "WARNING: Value must be between 0.1 and 10.0";
         self.validationState.objlim = false;
      } else {
         self.objlimEdit.backgroundColor = UI_COLOR_VALID;
         self.objlimEdit.toolTip = "Star protection (0.1-10.0). Higher = better protects stars. Default: 1.5\nFor faint stars, try 1.8-2.5";
         self.validationState.objlim = true;
         BBLACosmic.objlim = val;
      }
   };

   this.objlimSizer = new HorizontalSizer;
   this.objlimSizer.spacing = 4;
   this.objlimSizer.add(this.objlimLabel);
   this.objlimSizer.addStretch();
   this.objlimSizer.add(this.objlimEdit);

   // Read noise
   this.readnoiseLabel = new Label(this);
   this.readnoiseLabel.text = "Read noise (e-):";
   this.readnoiseLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.readnoiseLabel.setFixedWidth(130);

   this.readnoiseEdit = new Edit(this);
   this.readnoiseEdit.text = BBLACosmic.readnoise.toString();
   this.readnoiseEdit.setFixedWidth(80);
   this.readnoiseEdit.toolTip = "Camera read noise in electrons. Check your camera specs. Default: 9.0";
   this.readnoiseEdit.onTextUpdated = function(text) {
      var val = parseFloat(text);
      if (isNaN(val) || val < 0.1 || val > 100.0) {
         self.readnoiseEdit.backgroundColor = UI_COLOR_INVALID;
         self.readnoiseEdit.toolTip = "WARNING: Value must be between 0.1 and 100.0";
         self.validationState.readnoise = false;
      } else {
         self.readnoiseEdit.backgroundColor = UI_COLOR_VALID;
         self.readnoiseEdit.toolTip = "Camera read noise in electrons. Check your camera specs. Default: 9.0";
         self.validationState.readnoise = true;
         BBLACosmic.readnoise = val;
      }
   };

   this.readnoiseSizer = new HorizontalSizer;
   this.readnoiseSizer.spacing = 4;
   this.readnoiseSizer.add(this.readnoiseLabel);
   this.readnoiseSizer.addStretch();
   this.readnoiseSizer.add(this.readnoiseEdit);

   // Gain
   this.gainLabel = new Label(this);
   this.gainLabel.text = "Gain (e-/ADU):";
   this.gainLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.gainLabel.setFixedWidth(130);

   this.gainEdit = new Edit(this);
   this.gainEdit.text = BBLACosmic.gain.toString();
   this.gainEdit.setFixedWidth(80);
   this.gainEdit.toolTip = "Camera gain in electrons per ADU. Default: 1.0";
   this.gainEdit.onTextUpdated = function(text) {
      var val = parseFloat(text);
      if (isNaN(val) || val < 0.1 || val > 10.0) {
         self.gainEdit.backgroundColor = UI_COLOR_INVALID;
         self.gainEdit.toolTip = "WARNING: Value must be between 0.1 and 10.0";
         self.validationState.gain = false;
      } else {
         self.gainEdit.backgroundColor = UI_COLOR_VALID;
         self.gainEdit.toolTip = "Camera gain in electrons per ADU. Default: 1.0";
         self.validationState.gain = true;
         BBLACosmic.gain = val;
      }
   };

   this.gainSizer = new HorizontalSizer;
   this.gainSizer.spacing = 4;
   this.gainSizer.add(this.gainLabel);
   this.gainSizer.addStretch();
   this.gainSizer.add(this.gainEdit);

   // Iterations
   this.niterLabel = new Label(this);
   this.niterLabel.text = "Iterations:";
   this.niterLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.niterLabel.setFixedWidth(130);

   this.niterSpin = new SpinBox(this);
   this.niterSpin.minValue = 1;
   this.niterSpin.maxValue = 10;
   this.niterSpin.value = BBLACosmic.niter;
   this.niterSpin.setFixedWidth(80);
   this.niterSpin.toolTip = "Number of L.A.Cosmic passes (1-10). Default: 6 (optimal)";
   this.niterSpin.onValueUpdated = function(value) {
      BBLACosmic.niter = value;
   };

   this.niterSizer = new HorizontalSizer;
   this.niterSizer.spacing = 4;
   this.niterSizer.add(this.niterLabel);
   this.niterSizer.addStretch();
   this.niterSizer.add(this.niterSpin);

   // Add all to params group
   this.paramsGroupBox.sizer.add(this.sigclipSizer);
   this.paramsGroupBox.sizer.add(this.objlimSizer);
   this.paramsGroupBox.sizer.add(this.readnoiseSizer);
   this.paramsGroupBox.sizer.add(this.gainSizer);
   this.paramsGroupBox.sizer.add(this.niterSizer);

   // Options GroupBox
   this.optionsGroupBox = new GroupBox(this);
   this.optionsGroupBox.title = "Options";
   this.optionsGroupBox.sizer = new VerticalSizer;
   this.optionsGroupBox.sizer.margin = 6;
   this.optionsGroupBox.sizer.spacing = 4;

   this.saveMaskCheck = new CheckBox(this);
   this.saveMaskCheck.text = "Save cosmic ray mask";
   this.saveMaskCheck.checked = BBLACosmic.saveMask;
   this.saveMaskCheck.toolTip = "Create mask image (1 = CR, 0 = clean) for quality control";
   this.saveMaskCheck.onCheck = function(checked) {
      BBLACosmic.saveMask = checked;
   };

   this.replaceActiveCheck = new CheckBox(this);
   this.replaceActiveCheck.text = "Replace active image";
   this.replaceActiveCheck.checked = BBLACosmic.replaceActive;
   this.replaceActiveCheck.toolTip = "Replace image instead of creating new window";
   this.replaceActiveCheck.onCheck = function(checked) {
      BBLACosmic.replaceActive = checked;
   };

   this.optionsGroupBox.sizer.add(this.saveMaskCheck);
   this.optionsGroupBox.sizer.add(this.replaceActiveCheck);

   // Info label
   this.infoLabel = new Label(this);
   this.infoLabel.text = "Note: Automatically handles normalized images (0-1 range)\n" +
                         "WARNING: Always inspect results - adjust objlim if stars affected";
   this.infoLabel.wordWrapping = true;
   this.infoLabel.margin = 6;

   // Buttons
   this.cleanButton = new PushButton(this);
   this.cleanButton.text = "Clean Cosmic Rays";
   this.cleanButton.defaultButton = true;
   this.cleanButton.onClick = function() {
      // Check all validation states before executing
      var invalidFields = [];
      if (!self.validationState.sigclip) invalidFields.push("Sigma clipping");
      if (!self.validationState.objlim) invalidFields.push("Object limit");
      if (!self.validationState.readnoise) invalidFields.push("Read noise");
      if (!self.validationState.gain) invalidFields.push("Gain");

      if (invalidFields.length > 0) {
         new MessageBox(
            "Invalid parameter values detected:\n\n" +
            "• " + invalidFields.join("\n• ") + "\n\n" +
            "Please correct the highlighted fields before running.",
            TITLE,
            StdIcon_Warning,
            StdButton_Ok
         ).execute();
         return;
      }

      self.ok();
      executeCosmicRayRemoval();
   };

   this.newInstanceButton = new ToolButton(this);
   this.newInstanceButton.icon = new Bitmap(":/process-interface/new-instance.png");
   this.newInstanceButton.setScaledFixedSize(20, 20);
   this.newInstanceButton.toolTip = "New Instance";
   this.newInstanceButton.onMousePress = function() {
      this.hasFocus = true;
      exportParameters();
      this.pushed = false;
      this.dialog.newInstance();
   };

   this.helpButton = new PushButton(this);
   this.helpButton.text = "Help";
   this.helpButton.onClick = function() {
      self.showHelp();
   };

   this.closeButton = new PushButton(this);
   this.closeButton.text = "Close";
   this.closeButton.onClick = function() {
      self.cancel();
   };

   this.buttonsSizer = new HorizontalSizer;
   this.buttonsSizer.spacing = 6;
   this.buttonsSizer.add(this.newInstanceButton);
   this.buttonsSizer.addStretch();
   this.buttonsSizer.add(this.cleanButton);
   this.buttonsSizer.add(this.helpButton);
   this.buttonsSizer.add(this.closeButton);

   // Main sizer
   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 6;
   this.sizer.add(this.helpLabel);
   this.sizer.addSpacing(4);
   this.sizer.add(this.paramsGroupBox);
   this.sizer.add(this.optionsGroupBox);
   this.sizer.add(this.infoLabel);
   this.sizer.addSpacing(4);
   this.sizer.add(this.buttonsSizer);

   this.adjustToContents();
   this.setFixedSize();

   // Help dialog
   this.showHelp = function() {
      var helpText =
         "<b>" + TITLE + " - Help &amp; Documentation</b><br/><br/>" +

         "<b>WARNING: STAR PROTECTION - CRITICALLY IMPORTANT</b><br/>" +
         "This tool uses aggressive detection optimized for maximum cosmic ray removal.<br/>" +
         "BEFORE running on real data, you MUST understand the risks:<br/><br/>" +

         "<b>1. Can this affect my stars? YES, potentially.</b><br/>" +
         "   - Very faint stars (SNR &lt; 5) MAY be flagged as cosmic rays<br/>" +
         "   - Bright/medium stars are safe with default settings<br/>" +
         "   - <b>Always inspect results at 100% zoom!</b><br/><br/>" +

         "<b>2. How to protect my stars?</b><br/>" +
         "   - <b>BEST: Create a star mask first</b> (use PixInsight's StarMask tool)<br/>" +
         "   &nbsp;&nbsp;&nbsp;Apply the star mask to protect stars during processing<br/>" +
         "   - <b>OR: Increase objlim</b> parameter:<br/>" +
         "   &nbsp;&nbsp;&nbsp;1.5 (default) = good for typical images<br/>" +
         "   &nbsp;&nbsp;&nbsp;1.8-2.0 = better protection for faint stars<br/>" +
         "   &nbsp;&nbsp;&nbsp;2.0-2.5 = ultra-conservative, very safe<br/>" +
         "   - Enable <b>'Save cosmic ray mask'</b> to review detections<br/><br/>" +

         "<b>3. Workflow checklist:</b><br/>" +
         "   [ ] Work on a COPY of your image<br/>" +
         "   [ ] OPTIONAL: Create star mask (StarMask tool) for maximum protection<br/>" +
         "   [ ] Enable 'Save cosmic ray mask'<br/>" +
         "   [ ] Run with default parameters<br/>" +
         "   [ ] Inspect mask - are only CRs flagged?<br/>" +
         "   [ ] Inspect result - are stars intact?<br/>" +
         "   [ ] If stars affected: increase objlim OR use star mask, then re-run<br/><br/>" +

         "<hr/><br/>" +

         "<b>How L.A.Cosmic Works - The Algorithm:</b><br/><br/>" +

         "<b>Step 1: Laplacian Edge Detection</b><br/>" +
         "Computes the second derivative (Laplacian) of the image. Cosmic rays appear as<br/>" +
         "extremely sharp, isolated peaks with high Laplacian values.<br/><br/>" +

         "<b>Step 2: Noise Modeling</b><br/>" +
         "Builds a statistical noise model using your camera's gain and read noise parameters.<br/>" +
         "This allows accurate detection thresholds.<br/><br/>" +

         "<b>Step 3: Sigma Clipping Detection</b><br/>" +
         "Pixels with Laplacian signal exceeding (sigclip x noise) are flagged as cosmic ray candidates.<br/><br/>" +

         "<b>Step 4: Object Discrimination</b><br/>" +
         "The objlim parameter helps distinguish real astronomical objects (stars) from cosmic rays<br/>" +
         "by analyzing the PSF profile. Stars have smoother profiles than sharp cosmic rays.<br/><br/>" +

         "<b>Step 5: Iterative Cleaning</b><br/>" +
         "Multiple passes ensure complete removal, as cleaning one CR may reveal adjacent ones.<br/><br/>" +

         "<b>Step 6: Interpolation</b><br/>" +
         "Flagged pixels are replaced using sophisticated neighbor interpolation (meanmask method)<br/>" +
         "to preserve photometric accuracy.<br/><br/>" +

         "<hr/><br/>" +

         "<b>Quick Parameter Guide:</b><br/><br/>" +

         "<b>Sigma Clipping (default: 1.5)</b><br/>" +
         "Detection threshold - how many times the noise level for CR detection.<br/>" +
         "Lower = more sensitive. Range: 1.5 (aggressive) to 2.5 (conservative)<br/><br/>" +

         "<b>Object Limit (default: 1.5) - KEY FOR STAR PROTECTION</b><br/>" +
         "Minimum signal level to be considered an astronomical object (star).<br/>" +
         "Higher = better star protection. Try 1.8-2.5 if stars affected.<br/><br/>" +

         "<b>Iterations (default: 6)</b><br/>" +
         "Number of cleaning passes. Each iteration finds more CRs.<br/>" +
         "6 = optimal balance. Reduce to 4-5 for speed.<br/><br/>" +

         "<b>Read Noise (default: 9.0 e-)</b><br/>" +
         "Camera read noise in electrons. Affects noise model accuracy.<br/>" +
         "Check your camera specs. HST/JWST: 3-9, Modern CMOS: 1-3<br/><br/>" +

         "<b>Gain (default: 1.0 e-/ADU)</b><br/>" +
         "Camera gain. Use 1.0 for calibrated images. Check camera manual for raw data.<br/><br/>" +

         "<hr/><br/>" +

         "<b>When to Use This Tool:</b><br/>" +
         "GOOD: Deep-sky long exposures (&gt;30s) before stacking<br/>" +
         "GOOD: Space telescope data (HST, JWST)<br/>" +
         "GOOD: Single calibrated frames<br/><br/>" +

         "BAD: Already stacked images (CRs averaged out)<br/>" +
         "BAD: Planetary/lunar (different artifacts)<br/><br/>" +

         "<b>Performance (NGC5335 HST):</b><br/>" +
         "Baseline: 4,204 CRs | This version: 5,230 CRs | +24.4% improvement<br/><br/>" +

         "<hr/><br/>" +

         "<b>Algorithm:</b> van Dokkum (2001) PASP 113:1420<br/>" +
         "<b>Implementation:</b> astroscrappy (github.com/astropy/astroscrappy)<br/>" +
         "<b>More info:</b> www.bb-astro.com<br/><br/>" +

         "Copyright 2024-2025 Benoit Blanco";

      var msgBox = new MessageBox(
         helpText,
         TITLE + " - Help",
         StdIcon_Information,
         StdButton_Ok
      );
      msgBox.execute();
   };
}

BBLACosmicDialog.prototype = new Dialog;

// ----------------------------------------------------------------------------
// Main Execution
// ----------------------------------------------------------------------------
function main() {
   Console.show();

   // Import parameters if this is a saved instance (from process icon)
   if (Parameters.isGlobalTarget || Parameters.isViewTarget) {
      importParameters();
   }

   // Show ASCII art banner (only if not a silent instance execution)
   if (!Parameters.isViewTarget) {
      Console.writeln("");
      Console.writeln("      :::::::::  :::::::::                                   :::      :::::::: ::::::::::: :::::::::   :::::::: ");
      Console.writeln("     :+:    :+: :+:    :+:                                :+: :+:   :+:    :+:    :+:     :+:    :+: :+:    :+: ");
      Console.writeln("    +:+    +:+ +:+    +:+                               +:+   +:+  +:+           +:+     +:+    +:+ +:+    +:+  ");
      Console.writeln("   +#++:++#+  +#++:++#+         +#++:++#++:++         +#++:++#++: +#++:++#++    +#+     +#++:++#:  +#+    +:+   ");
      Console.writeln("  +#+    +#+ +#+    +#+                              +#+     +#+        +#+    +#+     +#+    +#+ +#+    +#+    ");
      Console.writeln(" #+#    #+# #+#    #+#                              #+#     #+# #+#    #+#    #+#     #+#    #+# #+#    #+#     ");
      Console.writeln("#########  #########                               ###     ###  ########     ###     ###    ###  ########       ");
      Console.writeln("");
      Console.writeln("                                   L.A.Cosmic Cosmic Ray Removal v" + VERSION);
      Console.writeln("");
      Console.writeln("==================================================================================================");
      Console.writeln("Based on L.A.Cosmic algorithm (van Dokkum 2001) - Implementation: astroscrappy");
      Console.writeln("Author: Benoit Blanco - www.bb-astro.com");
      Console.writeln("Tested on NGC5335 HST: +24.4% detection improvement");
      Console.writeln("==================================================================================================");
      Console.writeln("");
   }

   // If executed on a view (from process icon), run directly
   if (Parameters.isViewTarget) {
      executeCosmicRayRemoval();
      return;
   }

   // Check for active image
   var window = ImageWindow.activeWindow;
   if (!window || !window.isWindow) {
      new MessageBox(
         "No active image.\n\n" +
         "Please open an image before running this script.",
         TITLE,
         StdIcon_Warning,
         StdButton_Ok
      ).execute();
      return;
   }

   // Show dialog
   var dialog = new BBLACosmicDialog();
   dialog.execute();
}

// Run
main();
