/*
 * BB_LinearPatternCorrection.js
 *
 * One-window workflow for PixInsight's LinearDefectDetection and
 * LinearPatternSubtraction engines.
 *
 * Copyright (c) 2026 Benoit Blanco (BB-Astro)
 *
 * This product is based on software from the PixInsight project, developed
 * by Pleiades Astrophoto and its contributors (https://pixinsight.com/).
 */

#ifndef BBLPC_LIBRARY_MODE
#engine v8

#feature-id    BB_LinearPatternCorrection : BB-Astro > LinearPatternCorrection
#feature-icon  ./Favicon_LinearPatternCorrection.svg

#feature-info  "<b>BB Linear Pattern Correction v1.1.0</b><br><br>" +
               "Detect defective rows or columns, inspect a live model, and " +
               "subtract the selected pattern without managing a defect-list file.<br><br>" +
               "Copyright &copy; 2026 Benoit Blanco (BB-Astro)."
#endif

#define TITLE   "BB Linear Pattern Correction"
#define VERSION "1.1.0"

#include <pjsr/FrameStyle.jsh>
#include <pjsr/ColorSpace.jsh>
#include <pjsr/LinearDefectDetection.jsh>
#include <pjsr/LinearPatternSubtraction.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/UndoFlag.jsh>

var BBLPC_PREVIEW_DETECTION = 0;
var BBLPC_PREVIEW_MODEL = 1;
var BBLPC_PREVIEW_DEBOUNCE_SECONDS = 1.0;
var BBLPC_PROTECTION_HALF_WIDTH = 8;
var BBLPC_PROTECTION_MIN_FRACTION = 0.20;

function BBLPCData()
{
   this.targetView = null;

   this.detectColumns = true;
   this.layersToRemove = 8;
   this.detectionRejectionLimit = 3;
   this.detectionThreshold = 4;
   this.partialLineDetectionThreshold = 4;
   this.imageShift = 50;
   this.protectBrightStructures = true;

   this.correctEntireImage = false;
   this.subtractionLayersToRemove = 9;
   this.subtractionRejectionLimit = 3;
   this.globalRejection = true;
   this.globalRejectionLimit = 3;
   this.backgroundPreviewId = "";

   this.autoUpdate = true;
   this.previewMode = BBLPC_PREVIEW_DETECTION;
   this.detection = null;
   this.detectionBitmap = null;
   this.modelBitmap = null;
   this.rawDetectionCount = 0;
   this.protectedDetectionCount = 0;
   this.lastError = "";
}

function bblpcWindowSnapshot()
{
   var snapshot = {};
   var windows = ImageWindow.windows;
   for ( var i = 0; i < windows.length; ++i )
      snapshot[windows[i].mainView.fullId] = true;
   return snapshot;
}

function bblpcNewWindows( snapshot )
{
   var result = [];
   var windows = ImageWindow.windows;
   for ( var i = 0; i < windows.length; ++i )
      if ( !snapshot[windows[i].mainView.fullId] )
         result.push( windows[i] );
   return result;
}

function bblpcFindWindow( windows, baseId )
{
   for ( var i = 0; i < windows.length; ++i )
   {
      var id = windows[i].mainView.id;
      if ( id == baseId || id.indexOf( baseId + "_" ) == 0 )
         return windows[i];
   }
   return null;
}

function bblpcCloseWindows( windows, exceptWindow )
{
   for ( var i = windows.length; --i >= 0; )
      if ( windows[i] != exceptWindow )
         try
         {
            if ( !windows[i].isNull )
               windows[i].forceClose();
         }
         catch ( error )
         {
            console.warningln( "Unable to close temporary window: " + error );
         }
}

function bblpcCloneView( view )
{
   var image = view.image;
   var id = "bblpc_work_" + Date.now().toString() + "_" +
            Math.random().toString( 36 ).substring( 2, 10 );
   var window = new ImageWindow(
      image.width,
      image.height,
      image.numberOfChannels,
      32,
      true,
      image.isColor,
      id
   );

   window.mainView.beginProcess( UndoFlag_NoSwapFile );
   window.mainView.image.apply( image );
   window.mainView.endProcess();
   window.show();
   window.bringToFront();
   CoreApplication.processEvents();
   return window;
}

function bblpcDisplayBitmap( image )
{
   var displayImage = new Image(
      image.width,
      image.height,
      image.numberOfChannels,
      image.colorSpace,
      32,
      SampleType_Real
   );
   displayImage.apply( image );
   displayImage.rescale();

   var scale = Math.max( image.width / 1000, image.height / 650 );
   var zoom = scale <= 1 ? 1 : -Math.max( 2, Math.ceil( scale ) );
   var bitmap = displayImage.render( zoom, false, true );
   displayImage.free();
   return bitmap;
}

function bblpcDefectTablePath()
{
   return File.systemTempDirectory + "/bblpc_defects_" +
      Date.now().toString() + "_" +
      Math.random().toString( 36 ).substring( 2, 15 ) + ".txt";
}

function bblpcWriteDefectTable( detection, detectColumns )
{
   var path = bblpcDefectTablePath();
   var file = null;
   try
   {
      file = File.createFileForWriting( path );
      var prefix = detectColumns ? "Col " : "Row ";
      for ( var i = 0; i < detection.columnOrRow.length; ++i )
         file.outTextLn(
            prefix +
            detection.columnOrRow[i] + " " +
            detection.startPixel[i] + " " +
            detection.endPixel[i]
         );
      file.close();
      file = null;
      return path;
   }
   catch ( error )
   {
      if ( file != null )
         try
         {
            file.close();
         }
         catch ( closeError )
         {
         }
      if ( File.exists( path ) )
         File.remove( path );
      throw error;
   }
}

function bblpcRemoveFile( path )
{
   if ( path.length == 0 )
      return;
   try
   {
      if ( File.exists( path ) )
         File.remove( path );
   }
   catch ( error )
   {
      console.warningln( "Unable to remove temporary file " + path + ": " + error );
   }
}

function bblpcAutomaticBackgroundRect( image )
{
   var width = Math.min(
      image.width,
      512,
      Math.max( 64, Math.floor( image.width / 3 ) )
   );
   var height = Math.min(
      image.height,
      512,
      Math.max( 64, Math.floor( image.height / 3 ) )
   );
   var xMargin = Math.floor( 0.05 * ( image.width - width ) );
   var yMargin = Math.floor( 0.05 * ( image.height - height ) );
   var xPositions = [
      xMargin,
      Math.floor( ( image.width - width ) / 2 ),
      image.width - width - xMargin
   ];
   var yPositions = [
      yMargin,
      Math.floor( ( image.height - height ) / 2 ),
      image.height - height - yMargin
   ];

   var bestRect = null;
   var bestMedian = Number.POSITIVE_INFINITY;
   for ( var yi = 0; yi < yPositions.length; ++yi )
      for ( var xi = 0; xi < xPositions.length; ++xi )
      {
         var rect = new Rect(
            xPositions[xi],
            yPositions[yi],
            xPositions[xi] + width,
            yPositions[yi] + height
         );
         var median = image.median( rect );
         if ( median < bestMedian )
         {
            bestMedian = median;
            bestRect = rect;
         }
      }

   return bestRect;
}

function bblpcBackgroundRect( data )
{
   if ( data.backgroundPreviewId.length > 0 )
   {
      var preview = data.targetView.window.previewById( data.backgroundPreviewId );
      if ( !preview.isNull )
         return data.targetView.window.previewRect( data.backgroundPreviewId );
   }
   return bblpcAutomaticBackgroundRect( data.targetView.image );
}

function bblpcBrightSampleFraction( image, rectangle, threshold )
{
   var samplesPerChannel = rectangle.width * rectangle.height;
   var brightSamples = 0;
   var finiteSamples = 0;

   for ( var channel = 0; channel < image.numberOfChannels; ++channel )
   {
      var samples = new Float32Array( samplesPerChannel );
      image.getSamples( samples, rectangle, channel );
      for ( var i = 0; i < samples.length; ++i )
         if ( isFinite( samples[i] ) )
         {
            ++finiteSamples;
            if ( samples[i] > threshold )
               ++brightSamples;
         }
   }

   return finiteSamples == 0 ? 0 : brightSamples / finiteSamples;
}

function bblpcFilterBrightStructureDetections( data, rawDetection )
{
   if ( !data.protectBrightStructures )
      return {
         detection: rawDetection,
         rejected: 0
      };

   var image = data.targetView.image;
   var backgroundRect = bblpcBackgroundRect( data );
   var backgroundMedian = image.median( backgroundRect );
   var backgroundMAD = image.MAD( backgroundMedian, backgroundRect );
   var backgroundSigma = Math.max( 1.0e-12, 1.4826 * backgroundMAD );
   var threshold =
      backgroundMedian +
      data.detectionRejectionLimit * backgroundSigma;
   var parallelMaximum =
      ( data.detectColumns ? image.height : image.width ) - 1;
   var perpendicularMaximum =
      ( data.detectColumns ? image.width : image.height ) - 1;

   var filtered = {
      columnOrRow: [],
      startPixel: [],
      endPixel: []
   };
   var rejected = 0;

   for ( var i = 0; i < rawDetection.columnOrRow.length; ++i )
   {
      var line = rawDetection.columnOrRow[i];
      var start = Math.max( 0, rawDetection.startPixel[i] );
      var end = Math.min( parallelMaximum, rawDetection.endPixel[i] );
      var isEntireLine = start == 0 && end == parallelMaximum;
      var reject = false;

      if ( !isEntireLine )
      {
         var perpendicularStart = Math.max(
            0,
            line - BBLPC_PROTECTION_HALF_WIDTH
         );
         var perpendicularEnd = Math.min(
            perpendicularMaximum + 1,
            line + BBLPC_PROTECTION_HALF_WIDTH + 1
         );
         var rect = data.detectColumns ?
            new Rect(
               perpendicularStart,
               start,
               perpendicularEnd,
               end + 1
            ) :
            new Rect(
               start,
               perpendicularStart,
               end + 1,
               perpendicularEnd
            );
         reject =
            bblpcBrightSampleFraction( image, rect, threshold ) >=
            BBLPC_PROTECTION_MIN_FRACTION;
      }

      if ( reject )
         ++rejected;
      else
      {
         filtered.columnOrRow.push( line );
         filtered.startPixel.push( start );
         filtered.endPixel.push( end );
      }
   }

   return {
      detection: filtered,
      rejected: rejected
   };
}

function bblpcSelectedDefectBitmap(
   width,
   height,
   detection,
   detectColumns
)
{
   var mask = new Image(
      width,
      height,
      1,
      ColorSpace_Gray,
      32,
      SampleType_Real
   );
   mask.fill( 0 );

   for ( var i = 0; i < detection.columnOrRow.length; ++i )
   {
      var line = detection.columnOrRow[i];
      var start = detection.startPixel[i];
      var end = detection.endPixel[i];
      for ( var offset = -1; offset <= 1; ++offset )
      {
         var displayLine = line + offset;
         if (
            displayLine < 0 ||
            displayLine >= ( detectColumns ? width : height )
         )
            continue;
         for ( var position = start; position <= end; ++position )
            if ( detectColumns )
               mask.setSample( 1, displayLine, position );
            else
               mask.setSample( 1, position, displayLine );
      }
   }

   var bitmap = bblpcDisplayBitmap( mask );
   mask.free();
   return bitmap;
}

/*
 * PixInsight 1.9.4's V8 Image API accepts the default single-argument form of
 * medianWaveletTransform(), while the installed PatternCorrection engines
 * still pass the former scaling-sequence and layer-state arguments. All layer
 * states used by these engines are enabled, so the default form is equivalent.
 */
function bblpcRectangleSamples( image, rectangle )
{
   var samplesPerChannel = rectangle.width * rectangle.height;
   var channelCount = image.numberOfChannels;
   var samples = new Float64Array( samplesPerChannel * channelCount );

   for ( var channel = 0; channel < channelCount; ++channel )
   {
      var channelSamples = new Float64Array( samplesPerChannel );
      image.getSamples( channelSamples, rectangle, channel );
      samples.set( channelSamples, channel * samplesPerChannel );
   }

   var vector = new Vector( samples );
   vector.sort();
   return vector;
}

function bblpcUpperBound( sortedValues, value )
{
   var low = 0;
   var high = sortedValues.length;
   while ( low < high )
   {
      var middle = Math.floor( ( low + high ) / 2 );
      if ( sortedValues.at( middle ) <= value )
         low = middle + 1;
      else
         high = middle;
   }
   return low;
}

function bblpcInstallEngineCompatibility( engine )
{
   engine.multiscaleIsolation = function(
      image,
      largeScaleImage,
      layersToRemove
   )
   {
      /*
       * The detector performs a second cleanup pass with three fewer layers.
       * Its historical lower UI bound can consequently request zero MWT
       * layers. V8 rejects that value, so keep one transform layer active.
       */
      var effectiveLayers = Math.max( 2, Math.round( layersToRemove ) );
      var residualIndex = effectiveLayers - 1;
      var transform = image.medianWaveletTransform( residualIndex );
      try
      {
         var residual = transform[residualIndex];
         image.apply( residual, ImageOp_Sub );
         if ( largeScaleImage != null )
            largeScaleImage.apply( residual );
      }
      finally
      {
         for ( var i = 0; i < transform.length; ++i )
            transform[i].free();
      }
   };

   /*
    * ImageStatistics is not exposed by the V8-only PixInsight 1.9.4 build.
    * Keep the engines' iterative high-side clipping, but calculate it with
    * the current Vector statistics API.
    */
   engine.iterativeStatistics = function(
      image,
      rectangle,
      rejectionLimit
   )
   {
      var values = bblpcRectangleSamples( image, rectangle );
      var previousHigh = 1000;
      var currentHigh = 0.99;
      var median = 0;
      var mad = 0;
      var iteration = 0;

      do
      {
         var accepted = bblpcUpperBound( values, currentHigh );
         if ( accepted == 0 )
            throw new Error(
               "No finite samples remain after high-side rejection."
            );

         median = values.median( 0, accepted );
         mad = values.MAD( median, 0, accepted );
         previousHigh = currentHigh;
         currentHigh =
            median + mad * 1.4826 * rejectionLimit;
         ++iteration;
      }
      while (
         iteration < 10 ||
         (
            currentHigh != 0 &&
            previousHigh / currentHigh > 1.001
         )
      );

      return { median: median, MAD: mad };
   };
}

function bblpcConfigureSubtractionEngine( engine, data, defectTablePath )
{
   var background = bblpcBackgroundRect( data );

   engine.targetIsActiveImage = true;
   engine.inputFiles = [];
   engine.outputDir = "";
   engine.correctColumns = data.detectColumns;
   engine.correctEntireImage = data.correctEntireImage;
   engine.defectTableFilePath = defectTablePath;
   engine.postfix = "_bblpc";
   engine.layersToRemove = data.subtractionLayersToRemove;
   engine.rejectionLimit = data.subtractionRejectionLimit;
   engine.globalRejection = data.globalRejection;
   engine.globalRejectionLimit = data.globalRejectionLimit;
   engine.backgroundReferenceLeft = background.x0;
   engine.backgroundReferenceTop = background.y0;
   engine.backgroundReferenceWidth = background.width;
   engine.backgroundReferenceHeight = background.height;
   engine.closeFormerWorkingImages = false;
}

class BBLPCPreviewControl extends Control
{
constructor( parent )
{
   super( parent );

   this.bitmap = null;
   this.setScaledMinSize( 680, 400 );
   this.toolTip =
      "<p>The display is automatically rescaled for visibility. This display " +
      "stretch does not change the model used for correction.</p>";

   this.setBitmap = function( bitmap )
   {
      this.bitmap = bitmap;
      this.update();
   };

   this.onPaint = function( x0, y0, x1, y1 )
   {
      var graphics = new Graphics( this );
      graphics.brush = new Brush( 0xff202124 );
      graphics.fillRect( x0, y0, x1, y1 );

      if ( this.bitmap != null && !this.bitmap.isNull )
      {
         var margin = this.logicalPixelsToPhysical( 8 );
         var availableWidth = Math.max( 1, this.width - 2 * margin );
         var availableHeight = Math.max( 1, this.height - 2 * margin );
         var scale = Math.min(
            availableWidth / this.bitmap.width,
            availableHeight / this.bitmap.height
         );
         var width = Math.max( 1, Math.round( this.bitmap.width * scale ) );
         var height = Math.max( 1, Math.round( this.bitmap.height * scale ) );
         var left = Math.round( ( this.width - width ) / 2 );
         var top = Math.round( ( this.height - height ) / 2 );
         graphics.drawScaledBitmap(
            left,
            top,
            left + width,
            top + height,
            this.bitmap
         );
      }

      graphics.end();
   };
}
}

class BBLPCDialog extends Dialog
{
constructor( data )
{
   super();

   var dialog = this;
   this.data = data;
   this.busy = false;
   this.previewDirty = true;

   var emWidth = this.font.width( "M" );
   var labelWidth = this.font.width( "Partial-line threshold:" ) + emWidth;
   var editWidth = 7 * emWidth;

   this.helpLabel = new Label( this );
   this.helpLabel.frameStyle = FrameStyle_Box;
   this.helpLabel.margin = 6;
   this.helpLabel.wordWrapping = true;
   this.helpLabel.useRichText = true;
   this.helpLabel.text =
      "<p><b>" + TITLE + " v" + VERSION + "</b></p>" +
      "<p>Detect defective rows or columns, inspect the detection model, then " +
      "subtract the corresponding pattern in one interface. The defect list " +
      "is transferred automatically and no file has to be saved manually.</p>";

   this.targetLabel = new Label( this );
   this.targetLabel.text = "Target image:";
   this.targetLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.targetLabel.setFixedWidth( labelWidth );

   this.targetViewList = new ViewList( this );
   this.targetViewList.getMainViews();
   this.targetViewList.currentView = data.targetView;
   this.targetViewList.setScaledMinWidth( 360 );
   this.targetViewList.onViewSelected = function( view )
   {
      if ( view.isNull )
         return;
      dialog.data.targetView = view;
      dialog.data.backgroundPreviewId = "";
      dialog.populateBackgroundPreviews();
      dialog.updateImageShiftRange();
      dialog.invalidatePreview();
   };

   this.targetSizer = new HorizontalSizer;
   this.targetSizer.spacing = 6;
   this.targetSizer.add( this.targetLabel );
   this.targetSizer.add( this.targetViewList, 100 );

   this.directionLabel = new Label( this );
   this.directionLabel.text = "Pattern direction:";
   this.directionLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.directionLabel.setFixedWidth( labelWidth );

   this.directionCombo = new ComboBox( this );
   this.directionCombo.addItem( "Columns" );
   this.directionCombo.addItem( "Rows" );
   this.directionCombo.currentItem = data.detectColumns ? 0 : 1;
   this.directionCombo.setFixedWidth( 14 * emWidth );
   this.directionCombo.onItemSelected = function( itemIndex )
   {
      dialog.data.detectColumns = itemIndex == 0;
      dialog.updateImageShiftRange();
      dialog.invalidatePreview();
   };

   this.directionSizer = new HorizontalSizer;
   this.directionSizer.spacing = 6;
   this.directionSizer.add( this.directionLabel );
   this.directionSizer.add( this.directionCombo );
   this.directionSizer.addStretch();

   function addSpinControl( title, minimum, maximum, value, toolTip, callback )
   {
      var label = new Label( dialog );
      label.text = title;
      label.textAlignment = TextAlign_Right | TextAlign_VertCenter;
      label.setFixedWidth( labelWidth );
      label.toolTip = toolTip;

      var spin = new SpinBox( dialog );
      spin.setRange( minimum, maximum );
      spin.value = value;
      spin.setFixedWidth( editWidth );
      spin.toolTip = toolTip;
      spin.onValueUpdated = callback;

      var sizer = new HorizontalSizer;
      sizer.spacing = 6;
      sizer.add( label );
      sizer.add( spin );
      sizer.addStretch();
      return { label: label, control: spin, sizer: sizer };
   }

   this.detectionLayers = addSpinControl(
      "Layers to remove:",
      7,
      15,
      data.layersToRemove,
      "<p>Small/large-scale separation used during defect detection.</p>",
      function( value )
      {
         dialog.data.layersToRemove = value;
         dialog.invalidatePreview();
      }
   );

   this.detectionRejection = addSpinControl(
      "Rejection limit:",
      0,
      15,
      data.detectionRejectionLimit,
      "<p>Bright-pixel rejection threshold in sigma units.</p>",
      function( value )
      {
         dialog.data.detectionRejectionLimit = value;
         dialog.invalidatePreview();
      }
   );

   this.wholeThreshold = addSpinControl(
      "Entire-line threshold:",
      0,
      15,
      data.detectionThreshold,
      "<p>Lower values detect more complete defective rows or columns.</p>",
      function( value )
      {
         dialog.data.detectionThreshold = value;
         dialog.invalidatePreview();
      }
   );

   this.partialThreshold = addSpinControl(
      "Partial-line threshold:",
      0,
      15,
      data.partialLineDetectionThreshold,
      "<p>Lower values detect more partial defective rows or columns.</p>",
      function( value )
      {
         dialog.data.partialLineDetectionThreshold = value;
         dialog.invalidatePreview();
      }
   );

   this.imageShiftControl = addSpinControl(
      "Image shift:",
      1,
      65535,
      data.imageShift,
      "<p>Shift used to reveal the origin of partial line defects.</p>",
      function( value )
      {
         dialog.data.imageShift = value;
         dialog.invalidatePreview();
      }
   );

   this.brightProtectionCheck = new CheckBox( this );
   this.brightProtectionCheck.text =
      "Protect bright extended structures";
   this.brightProtectionCheck.checked = data.protectBrightStructures;
   this.brightProtectionCheck.toolTip =
      "<p>Reject partial-line candidates whose surrounding band is dominated " +
      "by bright extended signal. This prevents galaxy cores and broad arms " +
      "from being interpreted as line defects. Complete defective lines are " +
      "never rejected by this protection.</p>";
   this.brightProtectionCheck.onCheck = function( checked )
   {
      dialog.data.protectBrightStructures = checked;
      dialog.invalidatePreview();
   };

   this.brightProtectionSizer = new HorizontalSizer;
   this.brightProtectionSizer.addUnscaledSpacing(
      labelWidth + this.logicalPixelsToPhysical( 6 )
   );
   this.brightProtectionSizer.add( this.brightProtectionCheck );
   this.brightProtectionSizer.addStretch();

   this.detectionGroup = new GroupBox( this );
   this.detectionGroup.title = "1. Defect detection";
   this.detectionGroup.sizer = new VerticalSizer;
   this.detectionGroup.sizer.margin = 8;
   this.detectionGroup.sizer.spacing = 6;
   this.detectionGroup.sizer.add( this.directionSizer );
   this.detectionGroup.sizer.add( this.detectionLayers.sizer );
   this.detectionGroup.sizer.add( this.detectionRejection.sizer );
   this.detectionGroup.sizer.add( this.wholeThreshold.sizer );
   this.detectionGroup.sizer.add( this.partialThreshold.sizer );
   this.detectionGroup.sizer.add( this.imageShiftControl.sizer );
   this.detectionGroup.sizer.add( this.brightProtectionSizer );

   this.correctEntireCheck = new CheckBox( this );
   this.correctEntireCheck.text = "Correct the entire row/column pattern";
   this.correctEntireCheck.checked = data.correctEntireImage;
   this.correctEntireCheck.toolTip =
      "<p>When disabled, only automatically detected defects are corrected. " +
      "When enabled, the whole row or column pattern is corrected, while " +
      "detected partial defects are still included.</p>";
   this.correctEntireCheck.onCheck = function( checked )
   {
      dialog.data.correctEntireImage = checked;
   };

   this.correctEntireSizer = new HorizontalSizer;
   this.correctEntireSizer.addUnscaledSpacing(
      labelWidth + this.logicalPixelsToPhysical( 6 )
   );
   this.correctEntireSizer.add( this.correctEntireCheck );
   this.correctEntireSizer.addStretch();

   this.subtractionLayers = addSpinControl(
      "Layers to remove:",
      6,
      15,
      data.subtractionLayersToRemove,
      "<p>Small/large-scale separation used to calculate the pattern that " +
      "will be subtracted.</p>",
      function( value )
      {
         dialog.data.subtractionLayersToRemove = value;
      }
   );

   this.subtractionRejection = addSpinControl(
      "Rejection limit:",
      0,
      15,
      data.subtractionRejectionLimit,
      "<p>Bright-pixel rejection threshold used while calculating the " +
      "subtraction pattern.</p>",
      function( value )
      {
         dialog.data.subtractionRejectionLimit = value;
      }
   );

   this.globalRejectionCheck = new CheckBox( this );
   this.globalRejectionCheck.text = "Global bright-structure rejection";
   this.globalRejectionCheck.checked = data.globalRejection;
   this.globalRejectionCheck.toolTip =
      "<p>Reject bright objects before estimating the line pattern.</p>";
   this.globalRejectionCheck.onCheck = function( checked )
   {
      dialog.data.globalRejection = checked;
      dialog.globalRejectionLimit.control.enabled = checked;
   };

   this.globalRejectionSizer = new HorizontalSizer;
   this.globalRejectionSizer.addUnscaledSpacing(
      labelWidth + this.logicalPixelsToPhysical( 6 )
   );
   this.globalRejectionSizer.add( this.globalRejectionCheck );
   this.globalRejectionSizer.addStretch();

   this.globalRejectionLimit = addSpinControl(
      "Global rejection:",
      0,
      15,
      data.globalRejectionLimit,
      "<p>Global bright-structure rejection threshold in sigma units.</p>",
      function( value )
      {
         dialog.data.globalRejectionLimit = value;
      }
   );
   this.globalRejectionLimit.control.enabled = data.globalRejection;

   this.backgroundLabel = new Label( this );
   this.backgroundLabel.text = "Background region:";
   this.backgroundLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.backgroundLabel.setFixedWidth( labelWidth );

   this.backgroundCombo = new ComboBox( this );
   this.backgroundCombo.setScaledMinWidth( 360 );
   this.backgroundCombo.toolTip =
      "<p>Use a preview containing representative background. If no preview " +
      "is selected, the lowest-median region in a 3 by 3 image grid is used. " +
      "This region also calibrates bright-structure protection.</p>";
   this.backgroundCombo.onItemSelected = function( itemIndex )
   {
      dialog.data.backgroundPreviewId =
         itemIndex <= 0 ? "" : dialog.backgroundPreviewIds[itemIndex - 1];
      if ( dialog.data.protectBrightStructures )
         dialog.invalidatePreview();
   };

   this.backgroundSizer = new HorizontalSizer;
   this.backgroundSizer.spacing = 6;
   this.backgroundSizer.add( this.backgroundLabel );
   this.backgroundSizer.add( this.backgroundCombo, 100 );

   this.subtractionGroup = new GroupBox( this );
   this.subtractionGroup.title = "2. Pattern subtraction";
   this.subtractionGroup.sizer = new VerticalSizer;
   this.subtractionGroup.sizer.margin = 8;
   this.subtractionGroup.sizer.spacing = 6;
   this.subtractionGroup.sizer.add( this.correctEntireSizer );
   this.subtractionGroup.sizer.add( this.subtractionLayers.sizer );
   this.subtractionGroup.sizer.add( this.subtractionRejection.sizer );
   this.subtractionGroup.sizer.add( this.globalRejectionSizer );
   this.subtractionGroup.sizer.add( this.globalRejectionLimit.sizer );
   this.subtractionGroup.sizer.add( this.backgroundSizer );

   this.autoUpdateCheck = new CheckBox( this );
   this.autoUpdateCheck.text = "Auto-update";
   this.autoUpdateCheck.checked = data.autoUpdate;
   this.autoUpdateCheck.toolTip =
      "<p>Recalculate the detection model one second after the last parameter " +
      "change. Disable this for very large images and use Update model manually.</p>";
   this.autoUpdateCheck.onCheck = function( checked )
   {
      dialog.data.autoUpdate = checked;
      if ( checked )
         dialog.previewDirty = true;
   };

   this.previewModeCombo = new ComboBox( this );
   this.previewModeCombo.addItem( "Selected defect mask" );
   this.previewModeCombo.addItem( "Line model" );
   this.previewModeCombo.currentItem = data.previewMode;
   this.previewModeCombo.toolTip =
      "<p>The selected defect mask shows exactly which complete or partial " +
      "lines will be sent to subtraction after bright-structure protection. " +
      "The line model shows the robust per-line signal used by the detector.</p>";
   this.previewModeCombo.onItemSelected = function( itemIndex )
   {
      dialog.data.previewMode = itemIndex;
      dialog.showCurrentBitmap();
   };

   this.updateButton = new PushButton( this );
   this.updateButton.text = "Update model";
   this.updateButton.icon = this.scaledResource( ":/icons/reload.png" );
   this.updateButton.onClick = function()
   {
      dialog.updatePreview();
   };

   this.previewToolbarSizer = new HorizontalSizer;
   this.previewToolbarSizer.spacing = 8;
   this.previewToolbarSizer.add( this.autoUpdateCheck );
   this.previewToolbarSizer.addSpacing( 12 );
   this.previewToolbarSizer.add( this.previewModeCombo );
   this.previewToolbarSizer.addStretch();
   this.previewToolbarSizer.add( this.updateButton );

   this.previewControl = new BBLPCPreviewControl( this );

   this.statusLabel = new Label( this );
   this.statusLabel.frameStyle = FrameStyle_Box;
   this.statusLabel.margin = 5;
   this.statusLabel.text = "Waiting for the first model calculation.";
   this.statusLabel.wordWrapping = true;

   this.previewNote = new Label( this );
   this.previewNote.wordWrapping = true;
   this.previewNote.useRichText = true;
   this.previewNote.text =
      "<p><i>The mask lines are widened for display only. The line model is " +
      "display-stretched only. Exact one-pixel coordinates and the full " +
      "precision subtraction pattern are used when Apply correction is " +
      "clicked.</i></p>";

   this.previewGroup = new GroupBox( this );
   this.previewGroup.title = "Live detection model";
   this.previewGroup.sizer = new VerticalSizer;
   this.previewGroup.sizer.margin = 8;
   this.previewGroup.sizer.spacing = 6;
   this.previewGroup.sizer.add( this.previewToolbarSizer );
   this.previewGroup.sizer.add( this.previewControl, 100 );
   this.previewGroup.sizer.add( this.statusLabel );
   this.previewGroup.sizer.add( this.previewNote );

   this.applyButton = new PushButton( this );
   this.applyButton.text = "Apply correction";
   this.applyButton.icon = this.scaledResource( ":/icons/power.png" );
   this.applyButton.defaultButton = true;
   this.applyButton.onClick = function()
   {
      dialog.applyCorrection();
   };

   this.closeButton = new PushButton( this );
   this.closeButton.text = "Close";
   this.closeButton.icon = this.scaledResource( ":/icons/close.png" );
   this.closeButton.onClick = function()
   {
      dialog.cancel();
   };

   this.buttonsSizer = new HorizontalSizer;
   this.buttonsSizer.spacing = 8;
   this.buttonsSizer.addStretch();
   this.buttonsSizer.add( this.applyButton );
   this.buttonsSizer.add( this.closeButton );

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add( this.helpLabel );
   this.sizer.add( this.targetSizer );
   this.sizer.add( this.detectionGroup );
   this.sizer.add( this.subtractionGroup );
   this.sizer.add( this.previewGroup, 100 );
   this.sizer.add( this.buttonsSizer );

   this.windowTitle = TITLE;
   this.setScaledMinWidth( 760 );
   this.setScaledMinHeight( 880 );
   this.adjustToContents();
   this.setVariableSize();

   this.previewTimer = new Timer;
   this.previewTimer.interval = BBLPC_PREVIEW_DEBOUNCE_SECONDS;
   this.previewTimer.periodic = true;
   this.previewTimer.dialog = this;
   this.previewTimer.onTimeout = function()
   {
      if ( this.dialog.data.autoUpdate &&
           this.dialog.previewDirty &&
           !this.dialog.busy )
         this.dialog.updatePreview();
   };

   this.onShow = function()
   {
      this.previewTimer.start();
   };

   this.onHide = function()
   {
      this.previewTimer.stop();
   };

   this.setBusy = function( busy )
   {
      this.busy = busy;
      this.updateButton.enabled = !busy;
      this.applyButton.enabled = !busy;
      this.targetViewList.enabled = !busy;
      this.detectionGroup.enabled = !busy;
      this.subtractionGroup.enabled = !busy;
      CoreApplication.processEvents();
   };

   this.invalidatePreview = function()
   {
      this.previewDirty = true;
      this.data.detection = null;
      this.data.rawDetectionCount = 0;
      this.data.protectedDetectionCount = 0;
      this.statusLabel.text = this.data.autoUpdate ?
         "Parameters changed. Model update pending..." :
         "Parameters changed. Click Update model.";
   };

   this.updateImageShiftRange = function()
   {
      var image = this.data.targetView.image;
      var length = this.data.detectColumns ? image.height : image.width;
      var maximum = Math.max( 1, Math.floor( ( length - 1 ) / 4 ) );
      this.imageShiftControl.control.setRange( 1, maximum );
      if ( this.data.imageShift > maximum )
         this.data.imageShift = maximum;
      this.imageShiftControl.control.value = this.data.imageShift;
   };

   this.populateBackgroundPreviews = function()
   {
      this.backgroundCombo.clear();
      this.backgroundCombo.addItem( "Automatic low-signal region" );
      this.backgroundPreviewIds = [];

      var previews = this.data.targetView.window.previews;
      for ( var i = 0; i < previews.length; ++i )
      {
         this.backgroundPreviewIds.push( previews[i].id );
         this.backgroundCombo.addItem( previews[i].id );
      }
      this.backgroundCombo.currentItem = 0;
   };

   this.showCurrentBitmap = function()
   {
      var bitmap = this.data.previewMode == BBLPC_PREVIEW_MODEL ?
         this.data.modelBitmap : this.data.detectionBitmap;
      this.previewControl.setBitmap( bitmap );
   };

   this.updatePreview = function()
   {
      if ( this.busy )
         return false;
      if ( this.data.targetView == null || this.data.targetView.isNull )
         return false;

      this.setBusy( true );
      this.previewDirty = false;
      this.data.lastError = "";
      this.statusLabel.text = "Calculating the detection model...";
      CoreApplication.processEvents();

      var workWindow = null;
      var generatedWindows = [];
      var snapshot = null;
      var timer = new ElapsedTime;

      try
      {
         workWindow = bblpcCloneView( this.data.targetView );
         snapshot = bblpcWindowSnapshot();

         var engine = new LDDEngine;
         bblpcInstallEngineCompatibility( engine );
         engine.detectColumns = this.data.detectColumns;
         engine.detectPartialLines = true;
         engine.layersToRemove = this.data.layersToRemove;
         engine.rejectionLimit = this.data.detectionRejectionLimit;
         engine.detectionThreshold = this.data.detectionThreshold;
         engine.partialLineDetectionThreshold =
            this.data.partialLineDetectionThreshold;
         engine.imageShift = this.data.imageShift;
         engine.closeFormerWorkingImages = false;
         engine.execute();

         generatedWindows = bblpcNewWindows( snapshot );
         var detectionWindow = bblpcFindWindow(
            generatedWindows,
            "line_detection"
         );
         var modelWindow = bblpcFindWindow( generatedWindows, "line_model" );
         if ( detectionWindow == null || modelWindow == null )
            throw new Error( "PixInsight did not generate the expected model windows." );

         var rawDetection = {
            columnOrRow: engine.detectedColumnOrRow.slice(),
            startPixel: engine.detectedStartPixel.slice(),
            endPixel: engine.detectedEndPixel.slice()
         };
         var protectionResult =
            bblpcFilterBrightStructureDetections(
               this.data,
               rawDetection
            );
         this.data.detection = protectionResult.detection;
         this.data.rawDetectionCount = rawDetection.columnOrRow.length;
         this.data.protectedDetectionCount = protectionResult.rejected;
         this.data.detectionBitmap = bblpcSelectedDefectBitmap(
            detectionWindow.mainView.image.width,
            detectionWindow.mainView.image.height,
            this.data.detection,
            this.data.detectColumns
         );
         this.data.modelBitmap =
            bblpcDisplayBitmap( modelWindow.mainView.image );
         this.showCurrentBitmap();

         var direction = this.data.detectColumns ? "columns" : "rows";
         this.statusLabel.text =
            this.data.detection.columnOrRow.length + " defective " +
            direction + " selected" +
            (
               this.data.protectedDetectionCount > 0 ?
               ", " + this.data.protectedDetectionCount +
               " bright-structure candidate" +
               (
                  this.data.protectedDetectionCount == 1 ? "" : "s"
               ) +
               " protected" :
               ""
            ) +
            ". Processing time: " + timer.text + ".";
         return true;
      }
      catch ( error )
      {
         this.previewDirty = true;
         this.data.detection = null;
         this.data.rawDetectionCount = 0;
         this.data.protectedDetectionCount = 0;
         this.data.lastError = error.toString();
         this.statusLabel.text = "Model calculation failed: " + error;
#ifndef BBLPC_SUPPRESS_MESSAGES
         ( new MessageBox(
            "Unable to calculate the detection model:\n\n" + error,
            TITLE,
            StdIcon_Error,
            StdButton_Ok
         ) ).execute();
#endif
         return false;
      }
      finally
      {
         if ( snapshot != null )
            generatedWindows = bblpcNewWindows( snapshot );
         bblpcCloseWindows( generatedWindows, null );
         if ( workWindow != null )
            try
            {
               if ( !workWindow.isNull )
                  workWindow.forceClose();
            }
            catch ( closeError )
            {
            }
         try
         {
            if ( !this.data.targetView.window.isNull )
               this.data.targetView.window.bringToFront();
         }
         catch ( focusError )
         {
         }
         this.setBusy( false );
      }
   };

   this.applyCorrection = function()
   {
      if ( this.busy )
         return;

      if ( this.previewDirty || this.data.detection == null )
         if ( !this.updatePreview() )
            return;

      if ( !this.data.correctEntireImage &&
           this.data.detection.columnOrRow.length == 0 )
      {
         ( new MessageBox(
            "No defects are currently selected. Lower a detection threshold, " +
            "update the model, or enable correction of the entire pattern.",
            TITLE,
            StdIcon_Warning,
            StdButton_Ok
         ) ).execute();
         return;
      }

      this.setBusy( true );
      this.statusLabel.text = "Calculating and subtracting the pattern...";
      CoreApplication.processEvents();

      var defectTablePath = "";
      var snapshot = null;
      var generatedWindows = [];
      var timer = new ElapsedTime;

      try
      {
         defectTablePath = bblpcWriteDefectTable(
            this.data.detection,
            this.data.detectColumns
         );

         this.data.targetView.window.bringToFront();
         CoreApplication.processEvents();
         snapshot = bblpcWindowSnapshot();

         var engine = new LPSEngine;
         bblpcInstallEngineCompatibility( engine );
         bblpcConfigureSubtractionEngine(
            engine,
            this.data,
            defectTablePath
         );
         engine.execute();

         generatedWindows = bblpcNewWindows( snapshot );
         console.noteln(
            "<end><cbr><br>" + TITLE + " completed in " + timer.text
         );
         console.noteln(
            "Corrected image: " + this.data.targetView.fullId
         );
         console.noteln(
            "Detected defects transferred automatically: " +
            this.data.detection.columnOrRow.length
         );

         bblpcCloseWindows( generatedWindows, null );
         generatedWindows = [];
         bblpcRemoveFile( defectTablePath );
         defectTablePath = "";

         ( new MessageBox(
            "Pattern correction applied to " + this.data.targetView.fullId +
            ".\n\nThe operation is available in PixInsight's undo history.",
            TITLE,
            StdIcon_Information,
            StdButton_Ok
         ) ).execute();
         this.ok();
      }
      catch ( error )
      {
         ( new MessageBox(
            "Unable to apply the pattern correction:\n\n" + error,
            TITLE,
            StdIcon_Error,
            StdButton_Ok
         ) ).execute();
      }
      finally
      {
         if ( snapshot != null )
            generatedWindows = bblpcNewWindows( snapshot );
         bblpcCloseWindows( generatedWindows, null );
         bblpcRemoveFile( defectTablePath );
         try
         {
            if ( !this.data.targetView.window.isNull )
               this.data.targetView.window.bringToFront();
         }
         catch ( focusError )
         {
         }
         this.setBusy( false );
      }
   };

   this.populateBackgroundPreviews();
   this.updateImageShiftRange();
}
}

function main()
{
   if ( Parameters.isViewTarget )
      throw new Error( TITLE + " must be launched from the Script menu." );

   var activeWindow = ImageWindow.activeWindow;
   if ( activeWindow == null || activeWindow.isNull )
   {
      ( new MessageBox(
         "Open an image before launching " + TITLE + ".",
         TITLE,
         StdIcon_Warning,
         StdButton_Ok
      ) ).execute();
      return;
   }

   var data = new BBLPCData;
   data.targetView = activeWindow.mainView;
   ( new BBLPCDialog( data ) ).execute();
}

#ifndef BBLPC_LIBRARY_MODE
main();
#endif
