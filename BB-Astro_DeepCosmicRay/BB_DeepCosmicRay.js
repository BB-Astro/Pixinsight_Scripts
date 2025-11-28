// ----------------------------------------------------------------------------
// BB_DeepCosmicRay.js - BB-Astro Deep Learning Cosmic Ray Removal
// ----------------------------------------------------------------------------
// Removes cosmic rays from astronomical images using DeepCR deep learning
// (Zhang & Bloom 2020)
//
// Copyright (c) 2025 Benoit Blanco
// Licensed under Creative Commons BY-NC-SA 4.0 (non-commercial)
//
// DeepCR: Copyright (c) 2019 The Regents of the University of California, BSD-3-Clause License
// ----------------------------------------------------------------------------

#feature-id BB_Astro_DeepCosmicRay : Utilities > BB_Astro_DeepCosmicRay

#feature-info <b>BB Astro - DeepCosmicRay</b> &mdash; Deep learning cosmic ray removal for astronomical images.<br/>\
   <br/>\
   This script uses DeepCR (Zhang & Bloom 2020), a state-of-the-art deep learning model trained on \
   Hubble Space Telescope data to detect and remove cosmic ray hits from astronomical images. DeepCR \
   outperforms traditional algorithms like L.A.Cosmic with better accuracy and fewer false positives.<br/>\
   <br/>\
   <b>Key Features:</b><br/>\
   &bull; Deep learning-based detection (WFC3-UVIS or ACS-WFC models)<br/>\
   &bull; Superior to traditional algorithms (L.A.Cosmic, etc.)<br/>\
   &bull; Automatic inpainting of detected cosmic rays<br/>\
   &bull; Optimized for 32-bit float images<br/>\
   &bull; Fast processing (~10-15 seconds for typical images)<br/>\
   &bull; Optional cosmic ray mask generation<br/>\
   <br/>\
   <b>Algorithm Details:</b><br/>\
   DeepCR uses convolutional neural networks trained on real HST images with labeled cosmic rays. \
   The network learns to distinguish cosmic rays from stars, galaxies, and noise with high accuracy. \
   Detection threshold controls sensitivity: lower values detect more cosmic rays but may include \
   false positives on faint sources.<br/>\
   <br/>\
   <b>Best Used For:</b><br/>\
   &bull; 32-bit float images (optimal performance)<br/>\
   &bull; Space telescope data (HST, JWST, etc.)<br/>\
   &bull; Ground-based long exposures<br/>\
   &bull; Single frames before stacking<br/>\
   &bull; Images with numerous cosmic rays<br/>\
   <br/>\
   <b>Recommended Parameters:</b><br/>\
   &bull; WFC3-UVIS model with threshold 0.1 (default, optimal for 32-bit)<br/>\
   &bull; ACS-WFC model with threshold 0.5 (alternative for specific data)<br/>\
   &bull; Aggressive: threshold 0.05 (detects more CRs, risk of false positives)<br/>\
   &bull; Conservative: threshold 0.2 (fewer false positives, may miss faint CRs)<br/>\
   <br/>\
   <b>Performance:</b><br/>\
   Processing time: ~1-2 seconds per megapixel on CPU<br/>\
   Typical detection rate: 0.4-0.6% of pixels flagged as cosmic rays<br/>\
   <br/>\
   <b>Technical Requirements:</b><br/>\
   &bull; Python 3.7+ with DeepCR, astropy, numpy, pytorch<br/>\
   &bull; First run downloads pretrained models (~100MB)<br/>\
   &bull; Works with FITS format (16-bit or 32-bit)<br/>\
   <br/>\
   <b>References:</b><br/>\
   &bull; Zhang, K., & Bloom, J. S. (2020). Identifying Cosmic Rays in Astronomical Images Using Deep Learning. ApJ, 889(1), 24.<br/>\
   &bull; DeepCR repository: github.com/profjsb/deepCR<br/>\
   &bull; BB-Astro_DeepCosmicRay: github.com/bb-astro/deepcosmic<br/>\
   <br/>\
   Copyright (C) 2025 BB-Astro

#include <pjsr/DataType.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/Sizer.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/SampleType.jsh>

#define TITLE "BB Astro - DeepCosmicRay"
#define VERSION "2.1.1"

// UI Validation Constants
var UI_COLOR_VALID = 0xFFFFFFFF;    // White - valid input
var UI_COLOR_INVALID = 0xFFFF6666;  // Light red - invalid input

// Global settings object
var BBDeepCR = {
   // DeepCR parameters
   model: "WFC3-UVIS",  // "WFC3-UVIS" or "ACS-WFC"
   threshold: 0.1,      // Detection threshold (0.05-0.5)
   inpaint: true,       // Inpaint detected cosmic rays

   // Presets
   preset: "optimal",   // "optimal", "aggressive", "conservative", "acs_default"

   // Options
   saveMask: false,     // Save cosmic ray mask
   replaceActive: false, // Replace active window

   // System paths
   wrapperScript: File.extractDirectory(#__FILE__) + "/run_deepcr.sh",
   outputDir: File.systemTempDirectory
};

// Preset configurations
var PRESETS = {
   "optimal": { model: "WFC3-UVIS", threshold: 0.1 },
   "aggressive": { model: "WFC3-UVIS", threshold: 0.05 },
   "conservative": { model: "WFC3-UVIS", threshold: 0.2 },
   "acs_default": { model: "ACS-WFC", threshold: 0.5 }
};

// ----------------------------------------------------------------------------
// Process Icon Support - Parameters Export/Import
// ----------------------------------------------------------------------------

/*
 * Export parameters to process icon
 * Called when user clicks triangle button to create an icon
 */
function exportParameters() {
   Parameters.set("model", BBDeepCR.model);
   Parameters.set("threshold", BBDeepCR.threshold);
   Parameters.set("preset", BBDeepCR.preset);
   Parameters.set("saveMask", BBDeepCR.saveMask);
   Parameters.set("replaceActive", BBDeepCR.replaceActive);
}

/*
 * Import parameters from saved process icon
 * Called when script is launched from a saved icon
 */
function importParameters() {
   if (Parameters.has("model"))
      BBDeepCR.model = Parameters.getString("model");
   if (Parameters.has("threshold"))
      BBDeepCR.threshold = Parameters.getReal("threshold");
   if (Parameters.has("preset"))
      BBDeepCR.preset = Parameters.getString("preset");
   if (Parameters.has("saveMask"))
      BBDeepCR.saveMask = Parameters.getBoolean("saveMask");
   if (Parameters.has("replaceActive"))
      BBDeepCR.replaceActive = Parameters.getBoolean("replaceActive");
}

// ----------------------------------------------------------------------------
// Utility Functions
// ----------------------------------------------------------------------------

function generateSecureTempFilename() {
   var random = Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15);
   return File.systemTempDirectory + "/bbdcr_" +
          Date.now().toString() + "_" + random + ".xisf";
}

function buildCommandArray(inputPath) {
   var cmd = [
      "/bin/bash",
      BBDeepCR.wrapperScript,
      inputPath,
      BBDeepCR.outputDir,
      BBDeepCR.threshold.toString()
   ];

   // Add preset if selected
   if (BBDeepCR.preset && BBDeepCR.preset != "custom") {
      cmd.push("--preset");
      cmd.push(BBDeepCR.preset);
   }

   // Add save mask option
   if (BBDeepCR.saveMask) {
      cmd.push("--save-mask");
   }

   // Use XISF format (native PixInsight)
   cmd.push("--format");
   cmd.push("XISF");

   return cmd;
}

function loadImage(path) {
   // Detect format from extension
   var extension = path.toLowerCase();
   var formatExt = "";

   if (extension.endsWith(".xisf")) {
      formatExt = ".xisf";
   } else if (extension.endsWith(".fits") || extension.endsWith(".fit")) {
      formatExt = ".fits";
   } else {
      throw new Error("Unsupported image format: " + path);
   }

   var fileFormat = new FileFormat(formatExt, true, false);
   var file = new FileFormatInstance(fileFormat);

   if (!file.open(path, "r")) {
      throw new Error("Cannot open image file: " + path);
   }

   var image = new Image();
   if (!file.readImage(image)) {
      file.close();
      throw new Error("Cannot read image: " + path);
   }

   file.close();
   return image;
}

function executeDeepCR() {
   var tempFile = null;
   var cleanedPath = null;
   var maskPath = null;

   try {
      Console.show();
      Console.writeln("");
      Console.writeln("      :::::::::  :::::::::                                   :::      :::::::: ::::::::::: :::::::::   :::::::: ");
      Console.writeln("     :+:    :+: :+:    :+:                                :+: :+:   :+:    :+:    :+:     :+:    :+: :+:    :+: ");
      Console.writeln("    +:+    +:+ +:+    +:+                               +:+   +:+  +:+           +:+     +:+    +:+ +:+    +:+  ");
      Console.writeln("   +#++:++#+  +#++:++#+         +#++:++#++:++         +#++:++#++: +#++:++#++    +#+     +#++:++#:  +#+    +:+   ");
      Console.writeln("  +#+    +#+ +#+    +#+                              +#+     +#+        +#+    +#+     +#+    +#+ +#+    +#+    ");
      Console.writeln(" #+#    #+# #+#    #+#                              #+#     #+# #+#    #+#    #+#     #+#    #+# #+#    #+#     ");
      Console.writeln("#########  #########                               ###     ###  ########     ###     ###    ###  ########       ");
      Console.writeln("");
      Console.writeln("                                  DeepCR Deep Learning Cosmic Ray Removal v" + VERSION);
      Console.writeln("");
      Console.writeln("==================================================================================================");
      Console.writeln("Based on DeepCR algorithm (Zhang & Bloom 2020) - Deep Learning trained on 15,000+ HST images");
      Console.writeln("Author: BB-Astro - www.bb-astro.com");
      Console.writeln("Superior accuracy vs traditional algorithms - Optimized for 32-bit float images");
      Console.writeln("==================================================================================================");
      Console.writeln("");

      // Validate paths
      if (!File.exists(BBDeepCR.wrapperScript)) {
         throw new Error("run_deepcr.sh wrapper script not found at: " + BBDeepCR.wrapperScript);
      }

      // Get active window
      var window = ImageWindow.activeWindow;
      if (!window || !window.isWindow) {
         throw new Error("No active image window");
      }

      var originalImageName = window.mainView.id;
      Console.writeln("Processing image: " + originalImageName);
      Console.writeln("Model: " + BBDeepCR.model);
      Console.writeln("Threshold: " + BBDeepCR.threshold);
      Console.writeln("Preset: " + BBDeepCR.preset);

      // Export to temporary FITS
      Console.writeln("\n<b>Exporting to temporary FITS...</b>");
      tempFile = generateSecureTempFilename();

      if (!window.saveAs(tempFile, false, false, false, false)) {
         throw new Error("Failed to export to FITS");
      }

      Console.writeln("Exported to: " + tempFile);

      // Build command
      var cmd = buildCommandArray(tempFile);
      var cmdString = cmd.join(" ");

      Console.writeln("\n<b>Running DeepCR...</b>");
      Console.writeln("Command: " + cmdString);

      // Execute
      var process = new ExternalProcess(cmdString);
      var startTime = Date.now();
      var TIMEOUT_MS = 600000; // 10 minutes

      // Wait for process
      while (!process.waitForFinished(100)) {
         processEvents();

         if ((Date.now() - startTime) > TIMEOUT_MS) {
            process.kill();
            Console.criticalln("\nWARNING BB: le traitement a pris trop de temps (timeout apres 10 minutes)!");
            Console.criticalln("Essaie avec une image plus petite ou verifie que DeepCR est bien installe.");
            throw new Error("Processing timed out after 10 minutes");
         }
      }

      var elapsedTime = (Date.now() - startTime) / 1000;

      // Get output
      var stdout = process.stdout;
      var stderr = process.stderr;
      var exitCode = process.exitCode;

      // Display output
      if (stderr.length > 0) {
         Console.write(stderr);
      }
      if (stdout.length > 0) {
         Console.write(stdout);
      }

      Console.writeln("");
      Console.writeln("Process completed in " + elapsedTime.toFixed(2) + " seconds");
      Console.writeln("Exit code: " + exitCode);

      if (exitCode != 0) {
         throw new Error("DeepCR failed with exit code " + exitCode);
      }

      // Load cleaned image
      var tempBaseName = File.extractName(tempFile);
      if (tempBaseName.endsWith(".xisf") || tempBaseName.endsWith(".fits") || tempBaseName.endsWith(".fit")) {
         tempBaseName = tempBaseName.substring(0, tempBaseName.lastIndexOf("."));
      }

      cleanedPath = BBDeepCR.outputDir + "/" + tempBaseName + "_deepcr_th" + BBDeepCR.threshold + "_cleaned.xisf";

      Console.writeln("\n<b>Loading cleaned image...</b>");
      Console.writeln("Path: " + cleanedPath);

      if (!File.exists(cleanedPath)) {
         throw new Error("Cleaned image not found at: " + cleanedPath);
      }

      var cleanedImage = loadImage(cleanedPath);

      // Create result window
      if (BBDeepCR.replaceActive) {
         window.mainView.beginProcess(UndoFlag_NoSwapFile);
         window.mainView.image.assign(cleanedImage);
         window.mainView.endProcess();
         Console.writeln("Active window updated with cleaned image");
      } else {
         var newWindow = new ImageWindow(
            cleanedImage.width,
            cleanedImage.height,
            cleanedImage.numberOfChannels,
            cleanedImage.bitsPerSample,
            cleanedImage.isReal,
            cleanedImage.isColor,
            originalImageName + "_DeepCR"
         );

         newWindow.mainView.beginProcess();
         newWindow.mainView.image.assign(cleanedImage);
         newWindow.mainView.endProcess();
         newWindow.show();

         Console.writeln("New window created: " + originalImageName + "_DeepCR");
      }

      // Load mask if requested
      if (BBDeepCR.saveMask) {
         maskPath = BBDeepCR.outputDir + "/" + tempBaseName + "_deepcr_th" + BBDeepCR.threshold + "_mask.xisf";

         if (File.exists(maskPath)) {
            Console.writeln("\n<b>Loading cosmic ray mask...</b>");
            var maskImage = loadImage(maskPath);

            var maskWindow = new ImageWindow(
               maskImage.width,
               maskImage.height,
               maskImage.numberOfChannels,
               8,
               false,
               false,
               originalImageName + "_CR_Mask"
            );

            maskWindow.mainView.beginProcess();
            maskWindow.mainView.image.assign(maskImage);
            maskWindow.mainView.endProcess();
            maskWindow.show();

            Console.writeln("Mask window created: " + originalImageName + "_CR_Mask");
         }
      }

      Console.writeln("\n<b>Success!</b> Cosmic rays removed using DeepCR");
      Console.writeln("Model: " + BBDeepCR.model + ", Threshold: " + BBDeepCR.threshold);

   } catch (error) {
      Console.criticalln("\n<b>Error:</b> " + error.message);
      Console.writeln("\nStack trace:");
      Console.writeln(error.stack);

      (new MessageBox(
         error.message,
         TITLE,
         StdIcon_Error,
         StdButton_Ok
      )).execute();
   } finally {
      // Always cleanup temporary files, even on error
      Console.writeln("\n<b>Cleaning up temporary files...</b>");

      if (tempFile && File.exists(tempFile)) {
         File.remove(tempFile);
         Console.writeln("Removed temp input: " + tempFile);
      }

      if (cleanedPath && File.exists(cleanedPath)) {
         File.remove(cleanedPath);
         Console.writeln("Removed temp cleaned: " + cleanedPath);
      }

      if (maskPath && File.exists(maskPath)) {
         File.remove(maskPath);
         Console.writeln("Removed temp mask: " + maskPath);
      }
   }
}

// ----------------------------------------------------------------------------
// User Interface
// ----------------------------------------------------------------------------

function BBDeepCRDialog() {
   this.__base__ = Dialog;
   this.__base__();

   var self = this;

   // Track validation state for threshold parameter
   this.validationState = {
      threshold: true
   };

   // Title
   this.title = new Label(this);
   this.title.text = TITLE + " v" + VERSION;
   this.title.useRichText = true;
   this.title.styleSheet = "font-size: 14pt; font-weight: bold;";

   // Description and Copyright Label
   this.descriptionLabel = new Label(this);
   this.descriptionLabel.frameStyle = FrameStyle_Box;
   this.descriptionLabel.margin = 4;
   this.descriptionLabel.wordWrapping = true;
   this.descriptionLabel.useRichText = true;
   this.descriptionLabel.text =
      "<b>BB-Astro DeepCosmicRay</b> &mdash; Deep Learning Cosmic Ray Removal<br/>" +
      "<br/>" +
      "State-of-the-art cosmic ray detection using <b>DeepCR</b> (Zhang &amp; Bloom 2020), a convolutional neural network " +
      "trained on 15,000+ real Hubble Space Telescope images. DeepCR achieves superior accuracy compared to traditional " +
      "algorithms, with fewer false positives and native 32-bit float support.<br/>" +
      "<br/>" +
      "<b>Native XISF Support:</b> Processes PixInsight XISF files directly (no FITS conversion needed). Also supports FITS format.<br/>" +
      "<br/>" +
      "<b>Optimized for:</b> 32-bit float images, space telescope data (HST/JWST), ground-based long exposures. " +
      "Best used on single frames before stacking.<br/>" +
      "<br/>" +
      "<b>Typical detection:</b> 0.4-0.6% of pixels at optimal threshold (0.1). Processing time: ~10-15 seconds per image.<br/>" +
      "<br/>" +
      "<b>Attribution:</b><br/>" +
      "• Module: Copyright © 2025 Benoit Blanco (CC BY-NC-SA 4.0)<br/>" +
      "• DeepCR Library: Copyright © 2019 The Regents of the University of California (BSD-3-Clause)<br/>" +
      "• Scientific Paper: Zhang &amp; Bloom (2020), ApJ 889:24, DOI: 10.3847/1538-4357/ab3fa6<br/>" +
      "<br/>" +
      "<i>Click Help button for complete documentation</i>";
   this.descriptionLabel.setScaledMinWidth(480);

   // Preset selector
   this.presetLabel = new Label(this);
   this.presetLabel.text = "Preset:";
   this.presetLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.presetLabel.minWidth = 100;

   this.presetCombo = new ComboBox(this);
   this.presetCombo.addItem("Optimal (WFC3-UVIS, th=0.1) [Recommended]");
   this.presetCombo.addItem("Aggressive (WFC3-UVIS, th=0.05)");
   this.presetCombo.addItem("Conservative (WFC3-UVIS, th=0.2)");
   this.presetCombo.addItem("ACS Default (ACS-WFC, th=0.5)");
   this.presetCombo.addItem("Custom");
   this.presetCombo.currentItem = 0;
   this.presetCombo.toolTip = "<p>Select detection preset:</p>" +
      "<p><b>Optimal:</b> Best for 32-bit images (0.5-0.6% detection rate)</p>" +
      "<p><b>Aggressive:</b> Detects more CRs but may flag faint sources</p>" +
      "<p><b>Conservative:</b> Fewer false positives, may miss faint CRs</p>" +
      "<p><b>ACS Default:</b> For ACS-WFC data</p>";

   this.presetCombo.onItemSelected = function(index) {
      var presetNames = ["optimal", "aggressive", "conservative", "acs_default", "custom"];
      BBDeepCR.preset = presetNames[index];

      if (BBDeepCR.preset != "custom") {
         var config = PRESETS[BBDeepCR.preset];
         BBDeepCR.model = config.model;
         BBDeepCR.threshold = config.threshold;

         self.thresholdEdit.text = BBDeepCR.threshold.toString();
         self.modelCombo.currentItem = (BBDeepCR.model == "WFC3-UVIS") ? 0 : 1;
      }
   };

   this.presetSizer = new HorizontalSizer;
   this.presetSizer.spacing = 4;
   this.presetSizer.add(this.presetLabel);
   this.presetSizer.add(this.presetCombo, 100);

   // Model selector
   this.modelLabel = new Label(this);
   this.modelLabel.text = "Model:";
   this.modelLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.modelLabel.minWidth = 100;

   this.modelCombo = new ComboBox(this);
   this.modelCombo.addItem("WFC3-UVIS (Recommended)");
   this.modelCombo.addItem("ACS-WFC");
   this.modelCombo.currentItem = 0;
   this.modelCombo.toolTip = "<p>DeepCR model:</p>" +
      "<p><b>WFC3-UVIS:</b> Best for most images (recommended)</p>" +
      "<p><b>ACS-WFC:</b> Alternative model for specific datasets</p>";

   this.modelCombo.onItemSelected = function(index) {
      BBDeepCR.model = (index == 0) ? "WFC3-UVIS" : "ACS-WFC";
      self.presetCombo.currentItem = 4; // Custom
      BBDeepCR.preset = "custom";
   };

   this.modelSizer = new HorizontalSizer;
   this.modelSizer.spacing = 4;
   this.modelSizer.add(this.modelLabel);
   this.modelSizer.add(this.modelCombo, 100);

   // Threshold control
   this.thresholdLabel = new Label(this);
   this.thresholdLabel.text = "Threshold:";
   this.thresholdLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.thresholdLabel.minWidth = 100;

   this.thresholdEdit = new Edit(this);
   this.thresholdEdit.text = BBDeepCR.threshold.toString();
   this.thresholdEdit.setFixedWidth(80);
   this.thresholdEdit.toolTip = "<p>Detection threshold (0.05-0.50):</p>" +
      "<p>Lower values detect more cosmic rays but increase false positives</p>" +
      "<p>Recommended: 0.10 for 32-bit images</p>";

   this.thresholdEdit.onTextUpdated = function(text) {
      var value = parseFloat(text);
      if (isNaN(value) || value <= 0.0 || value > 1.0) {
         self.thresholdEdit.backgroundColor = UI_COLOR_INVALID;
         self.thresholdEdit.toolTip = "WARNING: Value must be between 0.01 and 1.0";
         self.validationState.threshold = false;
      } else {
         self.thresholdEdit.backgroundColor = UI_COLOR_VALID;
         self.thresholdEdit.toolTip = "<p>Detection threshold (0.05-0.50):</p>" +
            "<p>Lower values detect more cosmic rays but increase false positives</p>" +
            "<p>Recommended: 0.10 for 32-bit images</p>";
         self.validationState.threshold = true;
         BBDeepCR.threshold = value;
         self.presetCombo.currentItem = 4; // Custom
         BBDeepCR.preset = "custom";
      }
   };

   this.thresholdSizer = new HorizontalSizer;
   this.thresholdSizer.spacing = 4;
   this.thresholdSizer.add(this.thresholdLabel);
   this.thresholdSizer.add(this.thresholdEdit);

   // Options
   this.saveMaskCheck = new CheckBox(this);
   this.saveMaskCheck.text = "Save cosmic ray mask";
   this.saveMaskCheck.checked = BBDeepCR.saveMask;
   this.saveMaskCheck.toolTip = "Create a separate window with the CR detection mask";
   this.saveMaskCheck.onCheck = function(checked) {
      BBDeepCR.saveMask = checked;
   };

   this.replaceActiveCheck = new CheckBox(this);
   this.replaceActiveCheck.text = "Replace active window";
   this.replaceActiveCheck.checked = BBDeepCR.replaceActive;
   this.replaceActiveCheck.toolTip = "Replace active image instead of creating new window";
   this.replaceActiveCheck.onCheck = function(checked) {
      BBDeepCR.replaceActive = checked;
   };

   // Buttons
   this.executeButton = new PushButton(this);
   this.executeButton.text = "Execute";
   this.executeButton.icon = this.scaledResource(":/icons/power.png");
   this.executeButton.onClick = function() {
      // Check validation state before executing
      if (!self.validationState.threshold) {
         new MessageBox(
            "Invalid parameter value detected:\n\n" +
            "• Threshold must be between 0.01 and 1.0\n\n" +
            "Please correct the highlighted field before running.",
            TITLE,
            StdIcon_Warning,
            StdButton_Ok
         ).execute();
         return;
      }

      self.ok();
      executeDeepCR();
   };

   this.cancelButton = new PushButton(this);
   this.cancelButton.text = "Cancel";
   this.cancelButton.icon = this.scaledResource(":/icons/cancel.png");
   this.cancelButton.onClick = function() {
      self.cancel();
   };

   this.helpButton = new PushButton(this);
   this.helpButton.text = "Help";
   this.helpButton.icon = this.scaledResource(":/icons/help.png");
   this.helpButton.onClick = function() {
      self.showHelp();
   };

   // Process Icon Triangle Button
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

   this.buttonSizer = new HorizontalSizer;
   this.buttonSizer.spacing = 6;
   this.buttonSizer.add(this.newInstanceButton);  // Triangle on LEFT
   this.buttonSizer.add(this.helpButton);
   this.buttonSizer.addStretch();
   this.buttonSizer.add(this.executeButton);
   this.buttonSizer.add(this.cancelButton);

   // Copyright Footer
   this.copyrightLabel = new Label(this);
   this.copyrightLabel.useRichText = true;
   this.copyrightLabel.text =
      "<small>Module © 2025 Benoit Blanco | DeepCR Library © 2019 The Regents of the University of California (BSD-3-Clause) | " +
      "Zhang &amp; Bloom (2020) ApJ 889:24</small>";
   this.copyrightLabel.textAlignment = TextAlign_Center | TextAlign_VertCenter;

   // Layout
   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 6;
   this.sizer.add(this.title);
   this.sizer.addSpacing(4);
   this.sizer.add(this.descriptionLabel);
   this.sizer.addSpacing(8);
   this.sizer.add(this.presetSizer);
   this.sizer.add(this.modelSizer);
   this.sizer.add(this.thresholdSizer);
   this.sizer.addSpacing(8);
   this.sizer.add(this.saveMaskCheck);
   this.sizer.add(this.replaceActiveCheck);
   this.sizer.addSpacing(8);
   this.sizer.add(this.buttonSizer);
   this.sizer.addSpacing(4);
   this.sizer.add(this.copyrightLabel);

   this.windowTitle = TITLE;
   this.adjustToContents();
   this.setFixedSize();

   // Help dialog
   this.showHelp = function() {
      var helpText =
         "<b>" + TITLE + " - Help &amp; Documentation</b><br/><br/>" +

         "<b>Overview</b><br/>" +
         "DeepCR uses deep learning (CNN trained on 15,000+ HST images) to detect and remove cosmic rays. " +
         "Superior accuracy vs traditional algorithms with fewer false positives. Optimized for 32-bit float images.<br/>" +
         "<b>Best for:</b> Single frames before stacking, HST/JWST/ground-based long exposures.<br/><br/>" +

         "<b>Preset Guide</b><br/>" +
         "• <b>Optimal (0.1):</b> ⭐ Recommended. Detects 0.5-0.6% of pixels. Best balance.<br/>" +
         "• <b>Aggressive (0.05):</b> Maximum detection (~1%). Check for false positives on faint stars.<br/>" +
         "• <b>Conservative (0.2):</b> Fewer false positives (~0.2-0.3%). May miss faint CRs.<br/>" +
         "• <b>ACS Default (0.5):</b> For ACS-WFC data specifically.<br/><br/>" +

         "<b>Models</b><br/>" +
         "• <b>WFC3-UVIS:</b> ⭐ Recommended for most images (more sensitive, 32-bit optimized)<br/>" +
         "• <b>ACS-WFC:</b> Alternative for specific ACS datasets<br/><br/>" +

         "<b>Threshold</b><br/>" +
         "Controls sensitivity (0.05-0.50). Lower = more detection but more false positives.<br/>" +
         "• 0.05-0.10: Sensitive | 0.10-0.20: ⭐ Balanced | 0.20-0.50: Conservative<br/><br/>" +

         "<b>Options</b><br/>" +
         "• <b>Save mask:</b> Creates window with CR detection map (quality control)<br/>" +
         "• <b>Replace window:</b> Updates current image instead of creating new one<br/><br/>" +

         "<b>Performance</b><br/>" +
         "Speed: ~10-15 sec/image | Detection: 0.4-0.6% typical | First run downloads models (~100MB)<br/><br/>" +

         "<b>Quick Tips</b><br/>" +
         "1. Start with Optimal preset | 2. Check CR mask to verify | 3. Too many stars flagged? Use Conservative | " +
         "4. Missing CRs? Try Aggressive | 5. Process before stacking<br/><br/>" +

         "<b>DeepCR vs L.A.Cosmic</b><br/>" +
         "DeepCR: Better accuracy, fewer false positives, native 32-bit | " +
         "L.A.Cosmic: Slightly faster, more parameters<br/><br/>" +

         "<b>System Requirements</b><br/>" +
         "Python 3.7+, 4GB RAM, 500MB disk, Internet (first run)<br/><br/>" +

         "<b>Citation</b><br/>" +
         "Zhang &amp; Bloom (2020), ApJ 889:24, DOI: 10.3847/1538-4357/ab3fa6<br/>" +
         "DeepCR: github.com/profjsb/deepCR<br/><br/>" +

         "<b>License</b><br/>" +
         "Module: MIT © 2025 BB-Astro | DeepCR: BSD-3-Clause © 2019 The Regents of the University of California";

      var msgBox = new MessageBox(
         helpText,
         TITLE + " - Help",
         StdIcon_Information,
         StdButton_Ok
      );
      msgBox.execute();
   };
}

BBDeepCRDialog.prototype = new Dialog;

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

function main() {
   // Import parameters if this is a saved instance (from process icon)
   if (Parameters.isGlobalTarget || Parameters.isViewTarget) {
      importParameters();
   }

   // If executed on a view (icon dragged onto image), run directly
   if (Parameters.isViewTarget) {
      Console.show();
      Console.writeln("\n<b>Executing from saved process icon...</b>");
      executeDeepCR();
      return;  // Exit without showing dialog
   }

   // Normal interactive mode - show dialog
   Console.hide();

   if (!ImageWindow.activeWindow) {
      (new MessageBox(
         "There is no active image window.",
         TITLE,
         StdIcon_Error,
         StdButton_Ok
      )).execute();
      return;
   }

   var dialog = new BBDeepCRDialog();
   dialog.execute();
}

main();
