/*
   BB_CosmeticCorrection.js

   Script to apply CosmeticCorrection to current view
   instead of batch processing files.

   Created by BB (Ben) - 2025
*/

#feature-id    BB_CosmeticCorrection : BB-Astro > CosmeticCorrection
#feature-icon  ./Favicon_CosmeticCorrection.svg

#feature-info  "Script to apply CosmeticCorrection directly on the active view.<br><br>" +
               "Instead of batch processing files, this script applies cosmetic " +
               "corrections on the opened image.<br><br>" +
               "Copyright &copy; 2025 BB"

#define TITLE  "BB Cosmetic Correction"
#define VERSION "2.1.0"

// UI Validation Constants
var UI_COLOR_VALID = 0xFFFFFFFF;    // White - valid input
var UI_COLOR_INVALID = 0xFFFF6666;  // Light red - invalid input

#include <pjsr/Sizer.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdCursor.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/NumericControl.jsh>

// Script data
function CosmeticCorrectionData()
{
   this.targetView = ImageWindow.activeWindow.mainView;
   this.processIconId = "";
   this.useProcessIcon = false;
   this.useAutoDetect = true;
   this.hotSigma = 1.8;
   this.coldSigma = 1.4;
   this.amount = 1.00;
   this.cfa = false;
}

var data = new CosmeticCorrectionData();

// ----------------------------------------------------------------------------
// Parameters Management for Process Icons
// ----------------------------------------------------------------------------

/*
 * Export parameters to process icon
 */
function exportParameters() {
   Parameters.set("useProcessIcon", data.useProcessIcon);
   Parameters.set("processIconId", data.processIconId);
   Parameters.set("useAutoDetect", data.useAutoDetect);
   Parameters.set("hotSigma", data.hotSigma);
   Parameters.set("coldSigma", data.coldSigma);
   Parameters.set("amount", data.amount);
   Parameters.set("cfa", data.cfa);
}

/*
 * Import parameters from saved process icon
 */
function importParameters() {
   if (Parameters.has("useProcessIcon"))
      data.useProcessIcon = Parameters.getBoolean("useProcessIcon");
   if (Parameters.has("processIconId"))
      data.processIconId = Parameters.getString("processIconId");
   if (Parameters.has("useAutoDetect"))
      data.useAutoDetect = Parameters.getBoolean("useAutoDetect");
   if (Parameters.has("hotSigma"))
      data.hotSigma = Parameters.getReal("hotSigma");
   if (Parameters.has("coldSigma"))
      data.coldSigma = Parameters.getReal("coldSigma");
   if (Parameters.has("amount"))
      data.amount = Parameters.getReal("amount");
   if (Parameters.has("cfa"))
      data.cfa = Parameters.getBoolean("cfa");
}

// Main Dialog
function CosmeticCorrectionDialog()
{
   this.__base__ = Dialog;
   this.__base__();

   var dialog = this;

   var labelWidth1 = 120;

   // Help label
   this.helpLabel = new Label(this);
   this.helpLabel.frameStyle = FrameStyle_Box;
   this.helpLabel.margin = 4;
   this.helpLabel.wordWrapping = true;
   this.helpLabel.useRichText = true;
   this.helpLabel.text = "<p><b>" + TITLE + " v" + VERSION + "</b></p>" +
      "<p>Apply cosmetic correction (hot/cold pixels) directly on the active view.</p>" +
      "<p>You can either use an existing process icon or use automatic detection.</p>";

   // Target view selection
   this.targetView_Label = new Label(this);
   this.targetView_Label.text = "Target View:";
   this.targetView_Label.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.targetView_Label.minWidth = labelWidth1;

   this.targetView_ViewList = new ViewList(this);
   this.targetView_ViewList.scaledMinWidth = 350;
   this.targetView_ViewList.getMainViews();
   this.targetView_ViewList.currentView = data.targetView;
   this.targetView_ViewList.toolTip = "Select the image to apply correction.";
   this.targetView_ViewList.onViewSelected = function(view)
   {
      data.targetView = view;
   };

   this.targetView_Sizer = new HorizontalSizer;
   this.targetView_Sizer.spacing = 4;
   this.targetView_Sizer.add(this.targetView_Label);
   this.targetView_Sizer.add(this.targetView_ViewList, 100);

   // Use Process Icon option
   this.useIcon_CheckBox = new CheckBox(this);
   this.useIcon_CheckBox.text = "Use Process Icon";
   this.useIcon_CheckBox.checked = data.useProcessIcon;
   this.useIcon_CheckBox.toolTip = "<p>If checked, uses parameters from a saved " +
      "CosmeticCorrection process icon.</p>";
   this.useIcon_CheckBox.onCheck = function(checked)
   {
      data.useProcessIcon = checked;
      dialog.processIcon_Edit.enabled = checked;
      dialog.autoDetect_GroupBox.enabled = !checked;
      dialog.hotSigma_Control.enabled = !checked;
      dialog.coldSigma_Control.enabled = !checked;
      dialog.amount_Control.enabled = !checked;
      dialog.cfa_CheckBox.enabled = !checked;
   };

   // Process Icon ID field
   this.processIcon_Label = new Label(this);
   this.processIcon_Label.text = "Process Icon ID:";
   this.processIcon_Label.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.processIcon_Label.minWidth = labelWidth1;

   this.processIcon_Edit = new Edit(this);
   this.processIcon_Edit.text = data.processIconId;
   this.processIcon_Edit.enabled = false;
   this.processIcon_Edit.toolTip = "<p>Enter the ID of the CosmeticCorrection process icon " +
      "(e.g., 'CC_Icon_01')</p>";
   this.processIcon_Edit.onTextUpdated = function(value)
   {
      data.processIconId = value.trim();
   };

   this.processIcon_Sizer = new HorizontalSizer;
   this.processIcon_Sizer.spacing = 4;
   this.processIcon_Sizer.addSpacing(20);
   this.processIcon_Sizer.add(this.processIcon_Label);
   this.processIcon_Sizer.add(this.processIcon_Edit, 100);

   // Auto Detect GroupBox
   this.autoDetect_GroupBox = new GroupBox(this);
   this.autoDetect_GroupBox.title = "Use Auto Detect";
   this.autoDetect_GroupBox.checkable = true;
   this.autoDetect_GroupBox.checked = data.useAutoDetect;
   this.autoDetect_GroupBox.toolTip = "<p>Enable automatic detection of hot and cold pixels.</p>";
   this.autoDetect_GroupBox.onCheck = function(checked)
   {
      data.useAutoDetect = checked;
      dialog.hotSigma_Control.enabled = checked;
      dialog.coldSigma_Control.enabled = checked;
   };
   this.autoDetect_GroupBox.sizer = new VerticalSizer;
   this.autoDetect_GroupBox.sizer.margin = 6;
   this.autoDetect_GroupBox.sizer.spacing = 4;

   // Hot Sigma control
   this.hotSigma_Control = new NumericControl(this);
   this.hotSigma_Control.label.text = "Hot Sigma:";
   this.hotSigma_Control.label.minWidth = labelWidth1 - 20;
   this.hotSigma_Control.setRange(0.1, 10.0);
   this.hotSigma_Control.slider.setRange(0, 200);
   this.hotSigma_Control.slider.scaledMinWidth = 250;
   this.hotSigma_Control.setPrecision(2);
   this.hotSigma_Control.setValue(data.hotSigma);
   this.hotSigma_Control.toolTip = "<p>Sigma threshold for hot pixel detection (typical: 1.0-3.0).</p>";

   this.autoDetect_GroupBox.sizer.add(this.hotSigma_Control);

   // Cold Sigma control
   this.coldSigma_Control = new NumericControl(this);
   this.coldSigma_Control.label.text = "Cold Sigma:";
   this.coldSigma_Control.label.minWidth = labelWidth1 - 20;
   this.coldSigma_Control.setRange(0.1, 10.0);
   this.coldSigma_Control.slider.setRange(0, 200);
   this.coldSigma_Control.slider.scaledMinWidth = 250;
   this.coldSigma_Control.setPrecision(2);
   this.coldSigma_Control.setValue(data.coldSigma);
   this.coldSigma_Control.toolTip = "<p>Sigma threshold for cold pixel detection (typical: 1.0-3.0).</p>";

   this.autoDetect_GroupBox.sizer.add(this.coldSigma_Control);

   // Validation status label
   this.validationStatus_Label = new Label(this);
   this.validationStatus_Label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   this.validationStatus_Label.useRichText = true;
   this.autoDetect_GroupBox.sizer.add(this.validationStatus_Label);

   // Validation function
   this.updateValidationStatus = function()
   {
      var warnings = [];

      // Check Hot Sigma range (typical: 1.0-3.0)
      if (data.hotSigma < 1.0)
         warnings.push("Hot Sigma very low (<1.0)");
      else if (data.hotSigma > 3.0)
         warnings.push("Hot Sigma high (>3.0)");

      // Check Cold Sigma range (typical: 1.0-3.0)
      if (data.coldSigma < 1.0)
         warnings.push("Cold Sigma very low (<1.0)");
      else if (data.coldSigma > 3.0)
         warnings.push("Cold Sigma high (>3.0)");

      if (warnings.length > 0)
      {
         this.validationStatus_Label.text = "<font color='#FF6666'>" + warnings.join(", ") + "</font>";
      }
      else
      {
         this.validationStatus_Label.text = "<font color='#66FF66'>Values in typical range</font>";
      }
   };

   // Update validation on sigma changes
   this.hotSigma_Control.onValueUpdated = function(value)
   {
      data.hotSigma = value;
      dialog.updateValidationStatus();
   };

   this.coldSigma_Control.onValueUpdated = function(value)
   {
      data.coldSigma = value;
      dialog.updateValidationStatus();
   };

   // Initialize validation status
   this.updateValidationStatus();

   // Amount control
   this.amount_Control = new NumericControl(this);
   this.amount_Control.label.text = "Amount:";
   this.amount_Control.label.minWidth = labelWidth1;
   this.amount_Control.setRange(0.0, 1.0);
   this.amount_Control.slider.setRange(0, 100);
   this.amount_Control.slider.scaledMinWidth = 250;
   this.amount_Control.setPrecision(2);
   this.amount_Control.setValue(data.amount);
   this.amount_Control.toolTip = "<p>Correction amount (0=none, 1=full correction).</p>";
   this.amount_Control.onValueUpdated = function(value)
   {
      data.amount = value;
   };

   // CFA checkbox
   this.cfa_CheckBox = new CheckBox(this);
   this.cfa_CheckBox.text = "CFA (Bayer pattern)";
   this.cfa_CheckBox.checked = data.cfa;
   this.cfa_CheckBox.toolTip = "<p>Enable for CFA (Color Filter Array) images.</p>";
   this.cfa_CheckBox.onCheck = function(checked)
   {
      data.cfa = checked;
   };

   // Info section (Real Time Preview not available)
   this.info_GroupBox = new GroupBox(this);
   this.info_GroupBox.title = "Information";
   this.info_GroupBox.sizer = new VerticalSizer;
   this.info_GroupBox.sizer.margin = 6;
   this.info_GroupBox.sizer.spacing = 4;

   this.info_Label = new Label(this);
   this.info_Label.text = "CosmeticCorrection processes images via temporary files.\n" +
      "Typical sigma values: 1.0-3.0 (lower = more aggressive detection).";
   this.info_Label.wordWrapping = true;
   this.info_GroupBox.sizer.add(this.info_Label);

   // OK/Cancel buttons
   this.ok_Button = new PushButton(this);
   this.ok_Button.text = "OK";
   this.ok_Button.icon = this.scaledResource(":/icons/ok.png");
   this.ok_Button.onClick = function()
   {
      // Validate target view
      if (data.targetView.isNull)
      {
         var msg = new MessageBox(
            "No active view! Open an image first.",
            TITLE,
            StdIcon_Error,
            StdButton_Ok
         );
         msg.execute();
         return;
      }

      // Validate process icon if used
      if (data.useProcessIcon)
      {
         if (data.processIconId == "")
         {
            var msg = new MessageBox(
               "Enter the process icon ID!",
               TITLE,
               StdIcon_Error,
               StdButton_Ok
            );
            msg.execute();
            return;
         }

         var CC = ProcessInstance.fromIcon(data.processIconId);
         if (CC == null)
         {
            var msg = new MessageBox(
               "Process icon '" + data.processIconId + "' does not exist!",
               TITLE,
               StdIcon_Error,
               StdButton_Ok
            );
            msg.execute();
            return;
         }

         if (!(CC instanceof CosmeticCorrection))
         {
            var msg = new MessageBox(
               "Icon '" + data.processIconId + "' is not a CosmeticCorrection instance!",
               TITLE,
               StdIcon_Error,
               StdButton_Ok
            );
            msg.execute();
            return;
         }
      }

      dialog.ok();
   };

   this.cancel_Button = new PushButton(this);
   this.cancel_Button.text = "Cancel";
   this.cancel_Button.icon = this.scaledResource(":/icons/cancel.png");
   this.cancel_Button.onClick = function()
   {
      dialog.cancel();
   };

   // New Instance button (triangle) for Process Icon support
   this.newInstance_Button = new ToolButton(this);
   this.newInstance_Button.icon = this.scaledResource(":/process-interface/new-instance.png");
   this.newInstance_Button.setScaledFixedSize(20, 20);
   this.newInstance_Button.toolTip = "<p>Drag to workspace to create a new process icon.</p>";
   this.newInstance_Button.onMousePress = function()
   {
      this.hasFocus = true;
      exportParameters();
      this.pushed = false;
      dialog.newInstance();
   };

   this.buttons_Sizer = new HorizontalSizer;
   this.buttons_Sizer.spacing = 6;
   this.buttons_Sizer.add(this.newInstance_Button);
   this.buttons_Sizer.addStretch();
   this.buttons_Sizer.add(this.ok_Button);
   this.buttons_Sizer.add(this.cancel_Button);

   // Main sizer
   this.sizer = new VerticalSizer;
   this.sizer.margin = 6;
   this.sizer.spacing = 6;
   this.sizer.add(this.helpLabel);
   this.sizer.addSpacing(4);
   this.sizer.add(this.targetView_Sizer);
   this.sizer.addSpacing(4);
   this.sizer.add(this.useIcon_CheckBox);
   this.sizer.add(this.processIcon_Sizer);
   this.sizer.addSpacing(8);
   this.sizer.add(this.autoDetect_GroupBox);
   this.sizer.addSpacing(4);
   this.sizer.add(this.amount_Control);
   this.sizer.add(this.cfa_CheckBox);
   this.sizer.addSpacing(8);
   this.sizer.add(this.info_GroupBox);
   this.sizer.addSpacing(4);
   this.sizer.add(this.buttons_Sizer);

   this.windowTitle = TITLE + " v" + VERSION;
   this.adjustToContents();
}

CosmeticCorrectionDialog.prototype = new Dialog;

// Main execution function
function applyCosmeticCorrection()
{
   Console.show();
   Console.writeln("<br>========================================");
   Console.writeln("<b>" + TITLE + " v" + VERSION + "</b>");
   Console.writeln("========================================<br>");

   // CosmeticCorrection only works in global context with files
   // We need to: save temp file -> process -> load result back

   var tempDir = File.systemTempDirectory;
   var timestamp = Date.now();
   var tempInputFile = tempDir + "/bb_cc_input_" + timestamp + ".xisf";
   var tempOutputFile = tempDir + "/bb_cc_input_" + timestamp + "_cc.xisf";

   Console.writeln("Temporary files:");
   Console.writeln("  Input: " + tempInputFile);
   Console.writeln("  Output: " + tempOutputFile);

   try
   {
      // Step 1: Save current view to temp file
      Console.writeln("<br>Saving view to temporary file...");
      Console.flush();

      var window = data.targetView.window;
      if (!window.saveAs(tempInputFile, false, false, false, false))
      {
         throw new Error("Failed to save temporary input file");
      }
      Console.writeln("  Saved successfully");

      // Step 2: Create and configure CosmeticCorrection
      var CC;

      if (data.useProcessIcon && data.processIconId != "")
      {
         Console.writeln("<br>Using process icon: " + data.processIconId);
         CC = ProcessInstance.fromIcon(data.processIconId);
         // Override targetFrames and output settings
         CC.targetFrames = [[true, tempInputFile]];
         CC.outputDir = tempDir;
         CC.overwrite = true;
      }
      else
      {
         Console.writeln("<br>Using automatic detection");
         Console.writeln("  Hot Sigma: ", data.hotSigma);
         Console.writeln("  Cold Sigma: ", data.coldSigma);
         Console.writeln("  Amount: ", data.amount);
         Console.writeln("  CFA: ", data.cfa);

         CC = new CosmeticCorrection;

         // Configure for file-based processing
         CC.targetFrames = [[true, tempInputFile]];
         CC.outputDir = tempDir;
         CC.outputExtension = ".xisf";
         CC.prefix = "";
         CC.postfix = "_cc";
         CC.overwrite = true;
         CC.cfa = data.cfa;
         CC.amount = data.amount;
         CC.useMasterDark = false;
         CC.masterDark = "";
         CC.hotDarkCheck = false;
         CC.coldDarkCheck = false;
         CC.useAutoDetect = data.useAutoDetect;
         CC.hotAutoCheck = data.useAutoDetect;
         CC.hotAutoValue = data.hotSigma;
         CC.coldAutoCheck = data.useAutoDetect;
         CC.coldAutoValue = data.coldSigma;
         CC.useDefectList = false;
         CC.defects = [];
      }

      // Step 3: Execute in global context
      Console.writeln("<br>Processing with CosmeticCorrection...");
      Console.writeln("  Target view: " + data.targetView.fullId);
      Console.flush();

      CC.executeGlobal();

      Console.writeln("  Processing complete");

      // Step 4: Load result back into the view
      Console.writeln("<br>Loading corrected image...");

      if (!File.exists(tempOutputFile))
      {
         throw new Error("Output file not found: " + tempOutputFile);
      }

      var resultWindows = ImageWindow.open(tempOutputFile);
      if (resultWindows.length == 0)
      {
         throw new Error("Failed to open corrected image");
      }

      var resultWindow = resultWindows[0];
      var resultView = resultWindow.mainView;

      // Copy result to original view
      data.targetView.beginProcess(UndoFlag_PixelData);
      data.targetView.image.assign(resultView.image);
      data.targetView.endProcess();

      // Close temp result window without saving
      resultWindow.forceClose();

      Console.writeln("  Result applied to " + data.targetView.fullId);
      Console.writeln("<br><b>Cosmetic correction applied successfully!</b>");
      Console.writeln("========================================<br>");

      var msg = new MessageBox(
         "Cosmetic correction applied successfully on " + data.targetView.fullId + "!",
         TITLE,
         StdIcon_Information,
         StdButton_Ok
      );
      msg.execute();
   }
   catch (error)
   {
      Console.criticalln("<br><b>Error during application:</b>");
      Console.criticalln(error);
      Console.writeln("========================================<br>");

      var msg = new MessageBox(
         "Error applying correction:\n\n" + error,
         TITLE,
         StdIcon_Error,
         StdButton_Ok
      );
      msg.execute();
   }
   finally
   {
      // Cleanup temp files
      Console.writeln("<br>Cleaning up temporary files...");
      try
      {
         if (File.exists(tempInputFile))
            File.remove(tempInputFile);
         if (File.exists(tempOutputFile))
            File.remove(tempOutputFile);
         Console.writeln("  Cleanup complete");
      }
      catch (e)
      {
         Console.warningln("  Warning: Could not remove temp files: " + e);
      }
   }
}

// Main entry point
function main()
{
   Console.hide();

   // Import parameters if available (from process icon)
   importParameters();

   // Check for active view
   if (!ImageWindow.activeWindow || ImageWindow.activeWindow.mainView.isNull)
   {
      var msg = new MessageBox(
         "No active image! Open an image first.",
         TITLE,
         StdIcon_Error,
         StdButton_Ok
      );
      msg.execute();
      return;
   }

   // Show dialog
   var dialog = new CosmeticCorrectionDialog();

   if (dialog.execute())
   {
      // Apply correction
      applyCosmeticCorrection();
   }
}

main();
