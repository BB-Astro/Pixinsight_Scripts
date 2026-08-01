/*
 * BB_StripeField.js
 *
 * PixInsight front end for BB's validated Hubble stripe-field model.
 * The scientific computation is performed by the bundled destripe_astro.py
 * implementation with NumPy, SciPy and Astropy.
 *
 * Copyright (c) 2026 Benoit Blanco (BB-Astro)
 */

#ifndef BBSF_LIBRARY_MODE
#engine v8

#feature-id    BB_StripeField : BB-Astro > StripeField
#feature-icon  ./Favicon_StripeField.svg

#feature-info  "<b>BB StripeField v0.2.6</b><br><br>" +
               "Model and subtract weak, arbitrarily oriented row-bias fields " +
               "from linear Hubble mosaics. Includes source masking, a " +
               "noise-corrected angle search, robust profile estimation, " +
               "Wiener shrinkage and a signed model for quality control.<br><br>" +
               "Copyright &copy; 2026 Benoit Blanco."
#endif

#define TITLE   "BB StripeField"
#define VERSION "0.2.6"

#include <pjsr/FrameStyle.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdDialogCode.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/UndoFlag.jsh>

function bbsfBannerLines()
{
   return [
      "",
      "      :::::::::  :::::::::                                   :::      :::::::: ::::::::::: :::::::::   :::::::: ",
      "     :+:    :+: :+:    :+:                                :+: :+:   :+:    :+:    :+:     :+:    :+: :+:    :+: ",
      "    +:+    +:+ +:+    +:+                               +:+   +:+  +:+           +:+     +:+    +:+ +:+    +:+  ",
      "   +#++:++#+  +#++:++#+         +#++:++#++:++         +#++:++#++: +#++:++#++    +#+     +#++:++#:  +#+    +:+   ",
      "  +#+    +#+ +#+    +#+                              +#+     +#+        +#+    +#+     +#+    +#+ +#+    +#+    ",
      " #+#    #+# #+#    #+#                              #+#     #+# #+#    #+#    #+#     #+#    #+# #+#    #+#     ",
      "#########  #########                               ###     ###  ########     ###     ###    ###  ########       ",
      "",
      "                                  StripeField Oriented Destriping v" + VERSION,
      "",
      "==================================================================================================",
      "Oriented stripe-field correction for linear Hubble mosaics",
      "Author: BB-Astro - www.bb-astro.com",
      "==================================================================================================",
      ""
   ];
}

function bbsfPrintBanner()
{
   var lines = bbsfBannerLines();
   for ( var i = 0; i < lines.length; ++i )
      Console.writeln( lines[i] );
}

function BBSFData()
{
   this.targetView = null;

   /*
    * Validated Hubble defaults from destripe_astro.py and the three HST test
    * mosaics. HST stripes are effectively constant along their length, so the
    * local/windowed component is disabled by default.
    */
   this.maxIterations = 12;
   this.significance = 5.0;
   this.backgroundSigma = 100.0;
   this.sourceMaskSigma = 3.0;
   this.detrendSigma = 25.0;
   this.useWindowedProfile = false;
   this.windowSize = 1024;

   this.showStripeModel = true;
   this.replaceTarget = false;
}

function bbsfExportParameters( data )
{
   Parameters.set( "maxIterations", data.maxIterations );
   Parameters.set( "significance", data.significance );
   Parameters.set( "backgroundSigma", data.backgroundSigma );
   Parameters.set( "sourceMaskSigma", data.sourceMaskSigma );
   Parameters.set( "detrendSigma", data.detrendSigma );
   Parameters.set( "useWindowedProfile", data.useWindowedProfile );
   Parameters.set( "windowSize", data.windowSize );
   Parameters.set( "showStripeModel", data.showStripeModel );
   Parameters.set( "replaceTarget", data.replaceTarget );
}

function bbsfImportParameters( data )
{
   if ( Parameters.has( "maxIterations" ) )
      data.maxIterations = Parameters.getInteger( "maxIterations" );
   if ( Parameters.has( "significance" ) )
      data.significance = Parameters.getReal( "significance" );
   if ( Parameters.has( "backgroundSigma" ) )
      data.backgroundSigma = Parameters.getReal( "backgroundSigma" );
   if ( Parameters.has( "sourceMaskSigma" ) )
      data.sourceMaskSigma = Parameters.getReal( "sourceMaskSigma" );
   if ( Parameters.has( "detrendSigma" ) )
      data.detrendSigma = Parameters.getReal( "detrendSigma" );
   if ( Parameters.has( "useWindowedProfile" ) )
      data.useWindowedProfile = Parameters.getBoolean( "useWindowedProfile" );
   if ( Parameters.has( "windowSize" ) )
      data.windowSize = Parameters.getInteger( "windowSize" );
   if ( Parameters.has( "showStripeModel" ) )
      data.showStripeModel = Parameters.getBoolean( "showStripeModel" );
   if ( Parameters.has( "replaceTarget" ) )
      data.replaceTarget = Parameters.getBoolean( "replaceTarget" );
}

function bbsfWrapperPath()
{
   return File.extractDirectory( #__FILE__ ) + "/run_stripefield.sh";
}

function bbsfSetupPath()
{
   return File.extractDirectory( #__FILE__ ) + "/install_stripefield.sh";
}

function bbsfConsoleEscape( text )
{
   return text.replace( /&/g, "&amp;" ).replace( /</g, "&lt;" );
}

function bbsfRemoveFile( path )
{
   if ( path == null || path.length == 0 )
      return;
   try
   {
      if ( File.exists( path ) )
         File.remove( path );
   }
   catch ( error )
   {
      Console.warningln(
         "Unable to remove temporary file " + path + ": " + error
      );
   }
}

function bbsfUniqueToken()
{
   return Date.now().toString() + "_" +
      Math.random().toString( 36 ).substring( 2, 15 ) +
      Math.random().toString( 36 ).substring( 2, 10 );
}

function bbsfSafeViewId( value )
{
   var id = value.replace( /[^A-Za-z0-9_]/g, "_" );
   if ( id.length == 0 || !/[A-Za-z_]/.test( id.charAt( 0 ) ) )
      id = "BB_" + id;

   var candidate = id;
   var suffix = 2;
   for ( ;; )
   {
      var existingView = View.viewById( candidate );
      if ( existingView == null || existingView.isNull )
         break;
      candidate = id + "_" + suffix++;
   }
   return candidate;
}

function bbsfProbeDependencies()
{
   var result = {
      ok: false,
      python: "",
      message: ""
   };
   var wrapper = bbsfWrapperPath();

   if ( !File.exists( wrapper ) )
   {
      result.message =
         "The StripeField wrapper script was not found:\n\n" + wrapper +
         "\n\nReinstall StripeField from Resources > Updates in PixInsight.";
      return result;
   }

   try
   {
      var process = new ExternalProcess;
      process.start( "/bin/bash", [ wrapper, "--probe" ] );
      if ( !process.waitForFinished( 60000 ) )
      {
         process.terminate();
         result.message =
            "The StripeField dependency check timed out after 60 seconds.";
         return result;
      }

      var output = process.stdout.utf8ToString().trim();

      if ( process.exitCode == 0 )
      {
         result.python = output;
         if ( result.python.length > 0 )
         {
            result.ok = true;
            return result;
         }
      }

      result.message =
         "No usable Python environment was found for the StripeField engine." +
         ( output.length > 0 ? "\n\n" + output : "" );
   }
   catch ( error )
   {
      result.message =
         "Unable to check the StripeField Python environment:\n\n" + error;
   }

   return result;
}

function bbsfRunSetup()
{
   var setup = bbsfSetupPath();
   if ( !File.exists( setup ) )
   {
      Console.criticalln( "install_stripefield.sh not found at: " + setup );
      return false;
   }

   Console.show();
   Console.writeln( "" );
   Console.writeln( "<b>Setting up the StripeField Python environment</b>" );
   Console.writeln( "Creating ~/.bb-astro/stripefield_venv and installing " +
                    "NumPy, SciPy and Astropy." );
   Console.writeln( "" );
   Console.flush();

   var previousAbortEnabled = Console.abortEnabled;
   Console.abortEnabled = true;
   var process = null;

   try
   {
      process = new ExternalProcess;
      process.start( "/bin/bash", [ setup, "--yes" ] );
      var startTime = Date.now();
      var startTimeout = 30000;
      var runTimeout = 30 * 60 * 1000;

      while ( process.isStarting )
      {
         if ( Date.now() - startTime > startTimeout )
         {
            process.terminate();
            Console.criticalln( "ERROR: the setup script did not start." );
            return false;
         }
         CoreApplication.processEvents();
         System.msleep( 100 );
      }

      while ( process.isRunning )
      {
         var output = process.stdout.utf8ToString();
         if ( output.length > 0 )
         {
            Console.write( bbsfConsoleEscape( output ) );
            Console.flush();
         }

         if ( Console.abortRequested )
         {
            process.terminate();
            Console.warningln(
               "Setup aborted. Run it again before using StripeField."
            );
            return false;
         }
         if ( Date.now() - startTime > runTimeout )
         {
            process.terminate();
            Console.criticalln( "ERROR: setup timed out after 30 minutes." );
            return false;
         }

         CoreApplication.processEvents();
         System.msleep( 200 );
      }

      var tail = process.stdout.utf8ToString();
      if ( tail.length > 0 )
         Console.write( bbsfConsoleEscape( tail ) );

      if ( process.exitCode != 0 )
      {
         Console.criticalln(
            "Setup failed with exit code " + process.exitCode + "."
         );
         return false;
      }
      return true;
   }
   catch ( error )
   {
      Console.criticalln(
         "ERROR: unable to run install_stripefield.sh: " + error
      );
      return false;
   }
   finally
   {
      Console.abortEnabled = previousAbortEnabled;
      Console.flush();
   }
}

function bbsfOfferSetup()
{
   var setup = bbsfSetupPath();
   var answer = ( new MessageBox(
      "The StripeField Python environment is not set up yet.\n\n" +
      "Set it up now? PixInsight will create " +
      "~/.bb-astro/stripefield_venv and install NumPy, SciPy and Astropy.\n\n" +
      "An Internet connection is required for this one-time setup. Progress " +
      "is shown in the Console and can be aborted there.\n\n" +
      "Choose No to display the Terminal command instead.",
      TITLE + " - Setup Required",
      StdIcon_Question,
      StdButton_Yes,
      StdButton_No
   ) ).execute();

   if ( answer == StdButton_Yes )
      return bbsfRunSetup();

   ( new MessageBox(
      "Open a Terminal and run:\n\n" +
      "  bash \"" + setup + "\"\n\n" +
      "Then launch StripeField again.",
      TITLE + " - Manual Setup",
      StdIcon_Information,
      StdButton_Ok
   ) ).execute();
   return false;
}

function bbsfLoadImage( path )
{
   var format = new FileFormat( ".fits", true, false );
   var instance = new FileFormatInstance( format );
   if ( !instance.open( path, "r" ) )
      throw new Error( "Cannot open FITS file: " + path );

   var image = new Image;
   try
   {
      if ( !instance.readImage( image ) )
         throw new Error( "Cannot read FITS image: " + path );
   }
   finally
   {
      instance.close();
   }
   return image;
}

function bbsfCreateImageWindow( image, id )
{
   var window = new ImageWindow(
      image.width,
      image.height,
      image.numberOfChannels,
      32,
      true,
      image.isColor,
      bbsfSafeViewId( id )
   );

   window.mainView.beginProcess( UndoFlag_NoSwapFile );
   window.mainView.image.assign( image );
   window.mainView.endProcess();
   window.show();
   window.bringToFront();
   return window;
}

class BBSFProgressBar extends Control
{
constructor( parent )
{
   super( parent );

   this.value = 0;
   this.setFixedHeight( this.font.tightBoundingRect( "100%" ).height * 2 );

   this.onPaint = function()
   {
      var d = this.logicalPixelsToPhysical( 1 );
      var d2 = d >> 1;
      var graphics = new Graphics( this );
      graphics.transparentBackground = true;
      graphics.textAntialiasing = true;
      graphics.pen = new Pen( 0xff505050, d );
      graphics.brush = new Brush( 0xfff0f0f0 );
      graphics.drawRect( this.boundsRect.deflatedBy( d2 ) );
      graphics.brush = new Brush( 0xff38bdf8 );
      graphics.fillRect(
         d,
         d,
         Math.round( this.value * ( this.width - d - d2 ) ),
         this.height - d - d2
      );
      graphics.pen = new Pen( 0xff101010 );
      graphics.drawTextRect(
         this.boundsRect,
         Math.round( this.value * 100 ).toString() + "%",
         TextAlignment.Center | TextAlignment.VertCenter
      );
      graphics.end();
   };
}
}

class BBSFProgressDialog extends Dialog
{
constructor()
{
   super();

   var dialog = this;
   this.canceled = false;

   this.statusLabel = new Label( this );
   this.statusLabel.text = "Preparing StripeField processing...";
   this.statusLabel.wordWrapping = true;

   this.detailLabel = new Label( this );
   this.detailLabel.text =
      "One engine worker is used. The progress follows completed angle scans.";
   this.detailLabel.wordWrapping = true;

   this.progressBar = new BBSFProgressBar( this );
   this.progressBar.setScaledFixedSize( 440, 22 );

   this.cancelButton = new PushButton( this );
   this.cancelButton.text = "Cancel";
   this.cancelButton.icon = this.scaledResource( ":/icons/cancel.png" );
   this.cancelButton.onClick = function()
   {
      dialog.canceled = true;
      this.enabled = false;
      dialog.statusLabel.text = "Stopping the Python process...";
      CoreApplication.processEvents();
   };

   this.buttonSizer = new HorizontalSizer;
   this.buttonSizer.addStretch();
   this.buttonSizer.add( this.cancelButton );

   this.sizer = new VerticalSizer;
   this.sizer.margin = 10;
   this.sizer.spacing = 8;
   this.sizer.add( this.statusLabel );
   this.sizer.add( this.progressBar );
   this.sizer.add( this.detailLabel );
   this.sizer.addSpacing( 4 );
   this.sizer.add( this.buttonSizer );

   this.windowTitle = TITLE + " progress";
   this.adjustToContents();
   this.setFixedSize();

   this.setProgress = function( fraction, status )
   {
      this.progressBar.value = Math.max( 0, Math.min( 1, fraction ) );
      if ( status != null && status.length > 0 )
         this.statusLabel.text = status;
      this.progressBar.update();
      CoreApplication.processEvents();
   };

   this.setEngineInfo = function( workers, logicalCpus )
   {
      this.detailLabel.text =
         "Python engine: " + workers + " worker" +
         ( workers == 1 ? "" : "s" ) + ", " +
         logicalCpus + " logical processors available.";
      CoreApplication.processEvents();
   };

   this.onHide = function()
   {
      this.canceled = true;
   };
}
}

function bbsfWriteEngineLine( line, progressDialog )
{
   var progressMatch = line.match(
      /^BBSF_PROGRESS\t([0-9]*\.?[0-9]+)\t(.*)$/
   );
   if ( progressMatch != null )
   {
      if ( progressDialog != null )
      {
         var engineFraction = parseFloat( progressMatch[1] );
         progressDialog.setProgress(
            0.08 + 0.80 * engineFraction,
            progressMatch[2]
         );
      }
      return;
   }

   var infoMatch = line.match(
      /^BBSF_INFO\tworkers=([0-9]+)\tlogical_cpus=([0-9]+)$/
   );
   if ( infoMatch != null )
   {
      var workers = parseInt( infoMatch[1] );
      var logicalCpus = parseInt( infoMatch[2] );
      if ( progressDialog != null )
         progressDialog.setEngineInfo( workers, logicalCpus );
      Console.noteln(
         "Python engine: " + workers + " worker" +
         ( workers == 1 ? "" : "s" ) + ", " +
         logicalCpus + " logical processors available."
      );
      return;
   }

   Console.writeln( bbsfConsoleEscape( line ) );
}

function bbsfConsumeEngineOutput( text, state, progressDialog, flush )
{
   if ( text.length > 0 )
      state.pending += text;

   var lines = state.pending.split( /\r?\n/ );
   if ( !flush )
      state.pending = lines.pop();
   else
      state.pending = "";

   for ( var i = 0; i < lines.length; ++i )
      if ( lines[i].length > 0 )
      {
         if (
            lines[i].indexOf( "BBSF_PROGRESS\t" ) != 0 &&
            lines[i].indexOf( "BBSF_INFO\t" ) != 0
         )
         {
            state.lines.push( lines[i] );
            if ( state.lines.length > 40 )
               state.lines.shift();
         }
         bbsfWriteEngineLine( lines[i], progressDialog );
      }
}

function bbsfRunExternalProcess( program, arguments, progressDialog )
{
   var process = null;
   var startTime = Date.now();
   var startTimeout = 60000;
   var runTimeout = 2 * 60 * 60 * 1000;
   var previousAbortEnabled = Console.abortEnabled;
   var outputState = { pending: "", lines: [] };

   Console.abortEnabled = true;
   try
   {
      process = new ExternalProcess;
      process.start( program, arguments );
      if ( progressDialog != null )
         progressDialog.setProgress( 0.08, "Starting the Python engine" );

      while ( process.isStarting )
      {
         if ( Date.now() - startTime > startTimeout )
         {
            process.terminate();
            throw new Error( "The Python process did not start within 60 seconds." );
         }
         CoreApplication.processEvents();
         System.msleep( 100 );
      }

      while ( process.isRunning )
      {
         var stdout = process.stdout.utf8ToString();
         bbsfConsumeEngineOutput(
            stdout,
            outputState,
            progressDialog,
            false
         );
         Console.flush();

         if (
            Console.abortRequested ||
            ( progressDialog != null && progressDialog.canceled )
         )
         {
            process.terminate();
            throw new Error( "Processing was aborted by the user." );
         }
         if ( Date.now() - startTime > runTimeout )
         {
            process.terminate();
            throw new Error( "Processing timed out after two hours." );
         }

         CoreApplication.processEvents();
         System.msleep( 200 );
      }

      var stdoutTail = process.stdout.utf8ToString();
      bbsfConsumeEngineOutput(
         stdoutTail,
         outputState,
         progressDialog,
         true
      );

      if ( process.exitCode != 0 )
      {
         var errorDetails = "";
         if ( outputState.lines.length > 0 )
            errorDetails = "\n\n" + outputState.lines.join( "\n" );
         throw new Error(
            "The StripeField engine failed with exit code " +
            process.exitCode + "." + errorDetails
         );
      }
   }
   finally
   {
      Console.abortEnabled = previousAbortEnabled;
   }
}

function bbsfExecute( data )
{
   var inputPath = "";
   var correctedPath = "";
   var modelPath = "";
   var correctedImage = null;
   var modelImage = null;
   var progressDialog = null;

   try
   {
      if (
         data.targetView == null ||
         data.targetView.isNull ||
         data.targetView.window.isNull
      )
         throw new Error( "Select a valid target image." );

      if ( data.targetView.image.numberOfChannels != 1 )
         throw new Error(
            "StripeField accepts monochrome images only.\n\n" +
            "Separate color channels before running StripeField."
         );

      if ( data.replaceTarget && !data.targetView.image.isReal )
         throw new Error(
            "In-place replacement requires a floating-point target image.\n\n" +
            "The corrected image can contain small negative background values " +
            "that an integer sample format would clip to zero. Convert the " +
            "target to 32-bit float, or disable in-place replacement to get " +
            "a new floating-point window instead."
         );

      var dependencies = bbsfProbeDependencies();
      if ( !dependencies.ok )
         throw new Error( dependencies.message );

      var wrapper = bbsfWrapperPath();
      var token = "bbsf_" + bbsfUniqueToken();
      var outputDirectory = File.systemTempDirectory;
      inputPath = outputDirectory + "/" + token + ".fits";
      correctedPath = outputDirectory + "/" + token + "_destriped.fits";
      modelPath = outputDirectory + "/" + token + "_stripes.fits";

      progressDialog = new BBSFProgressDialog;
      progressDialog.setProgress( 0.01, "Exporting the temporary FITS" );
      progressDialog.show();

      Console.show();
      bbsfPrintBanner();
      Console.writeln( "StripeField profile" );
      Console.writeln( "Target: " + data.targetView.fullId );
      Console.writeln( "Python: " + dependencies.python );
      Console.writeln(
         "Profile: " +
         ( data.useWindowedProfile ?
           "global plus along-stripe windowed component" :
           "global profile" )
      );
      Console.writeln(
         "Parameters: max passes=" + data.maxIterations +
         ", stop=" + data.significance.toFixed( 2 ) + " sigma" +
         ", background sigma=" + data.backgroundSigma.toFixed( 1 ) +
         ", source mask=" + data.sourceMaskSigma.toFixed( 1 ) + " MAD" +
         ", detrend sigma=" + data.detrendSigma.toFixed( 1 )
      );
      Console.writeln( "" );
      Console.writeln(
         "The model is estimated from a linear image. A strongly stretched " +
         "input invalidates the noise model."
      );
      Console.writeln( "" );
      Console.writeln( "<b>Exporting temporary FITS...</b>" );
      Console.flush();

      if (
         !data.targetView.window.saveAs(
            inputPath,
            false,
            false,
            false,
            false
         )
      )
         throw new Error( "Unable to export the target image to temporary FITS." );
      progressDialog.setProgress( 0.06, "Temporary FITS exported" );

      var arguments = [
         wrapper,
         inputPath,
         "--output",
         outputDirectory,
         "--max-iter",
         data.maxIterations.toString(),
         "--signif",
         data.significance.toString(),
         "--bg-sigma",
         data.backgroundSigma.toString(),
         "--mask-k",
         data.sourceMaskSigma.toString(),
         "--detrend",
         data.detrendSigma.toString(),
         "--win",
         data.useWindowedProfile ? data.windowSize.toString() : "0",
         "--progress-protocol"
      ];

      Console.writeln( "<b>Estimating and subtracting stripe families...</b>" );
      Console.writeln( "Use the Console abort button to stop." );
      Console.flush();

      var timer = new ElapsedTime;
      bbsfRunExternalProcess( "/bin/bash", arguments, progressDialog );
      progressDialog.setProgress( 0.90, "Loading the corrected image" );

      if ( !File.exists( correctedPath ) )
         throw new Error( "The corrected FITS file was not generated." );
      if ( !File.exists( modelPath ) )
         throw new Error( "The stripe-model FITS file was not generated." );

      correctedImage = bbsfLoadImage( correctedPath );
      if ( data.replaceTarget )
      {
         data.targetView.beginProcess();
         try
         {
            data.targetView.image.assign( correctedImage );
         }
         finally
         {
            data.targetView.endProcess();
         }
         data.targetView.window.bringToFront();
         Console.noteln( "Corrected the target image in place." );
      }
      else
      {
         bbsfCreateImageWindow(
            correctedImage,
            data.targetView.id + "_StripeFieldCorrected"
         );
         Console.noteln( "Created a corrected image window." );
      }

      progressDialog.setProgress( 0.95, "Loading the signed stripe model" );
      if ( data.showStripeModel )
      {
         modelImage = bbsfLoadImage( modelPath );
         bbsfCreateImageWindow(
            modelImage,
            data.targetView.id + "_StripeFieldModel"
         );
         Console.noteln(
            "Created the signed stripe-model window. Apply an STF to inspect it."
         );
      }

      progressDialog.setProgress( 1.0, "StripeField correction complete" );
      System.msleep( 250 );
      progressDialog.cancel();
      progressDialog = null;

      Console.noteln( TITLE + " completed in " + timer.text );
      Console.noteln(
         "Quality control: the stripe model should contain line structure only, " +
         "with no galaxy or star imprint."
      );

      ( new MessageBox(
         "StripeField correction completed.\n\n" +
         ( data.replaceTarget ?
           "The target image was corrected in place and can be undone.\n" :
           "A new corrected image window was created.\n" ) +
         ( data.showStripeModel ?
           "A signed stripe-model window was also created for inspection.\n\n" :
           "\n" ) +
         "Inspect the stripe model before keeping the correction.",
         TITLE,
         StdIcon_Information,
         StdButton_Ok
      ) ).execute();
   }
   catch ( error )
   {
      if ( progressDialog != null )
      {
         progressDialog.cancel();
         progressDialog = null;
      }
      Console.criticalln( "ERROR: " + error );
      ( new MessageBox(
         "Unable to complete StripeField correction:\n\n" + error +
         "\n\nSee the PixInsight Console for details.",
         TITLE,
         StdIcon_Error,
         StdButton_Ok
      ) ).execute();
   }
   finally
   {
      if ( progressDialog != null )
         progressDialog.cancel();
      if ( correctedImage != null )
         correctedImage.free();
      if ( modelImage != null )
         modelImage.free();
      bbsfRemoveFile( inputPath );
      bbsfRemoveFile( correctedPath );
      bbsfRemoveFile( modelPath );
   }
}

function bbsfMethodHelpText()
{
   return [
      "BB STRIPEFIELD v" + VERSION,
      "Oriented stripe-field correction for linear Hubble mosaics",
      "",
      "PURPOSE",
      "",
      "StripeField estimates the weak additive field produced by detector-row",
      "bias variations after drizzle reprojection. In a final mosaic, detector",
      "rows can appear at any angle and may be slightly curved. Their amplitude",
      "can be far below the pixel noise, but they remain visible because the",
      "error is coherent over thousands of pixels.",
      "",
      "INPUT REQUIREMENTS",
      "",
      "Use a linear, monochrome image. Do not use a",
      "strongly stretched image: stretching changes the noise distribution, the",
      "source mask and the Wiener weights.",
      "",
      "DATA MODEL",
      "",
      "For each detected stripe direction theta, StripeField defines:",
      "",
      "  v = y*cos(theta) - x*sin(theta)    coordinate across the stripes",
      "  u = x*cos(theta) + y*sin(theta)    coordinate along the stripes",
      "",
      "and models the image as:",
      "",
      "  image(x,y) = background(x,y) + astronomical signal(x,y)",
      "               + noise(x,y) + sum S_theta(v,u)",
      "",
      "The final signed stripe field is the sum of all accepted S_theta fields.",
      "The corrected image is exactly:",
      "",
      "  corrected = input - stripe field",
      "",
      "The name StripeField refers to this additive value defined at every image",
      "pixel. It is not a list of defective rows or columns.",
      "",
      "PROCESSING PIPELINE",
      "",
      "1. Source protection",
      "",
      "An iterative median and MAD clip excludes galaxies, stars, diffraction",
      "spikes and other bright structures. The rejected mask is dilated before",
      "any stripe estimation. Only background samples vote for the model.",
      "",
      "2. Large-scale background",
      "",
      "A normalized Gaussian convolution is computed separately for image times",
      "mask and for the mask itself. Dividing both results gives a large-scale",
      "background that does not bleed masked sources into the estimate. Stripe",
      "analysis uses the high-pass residual after subtracting this background.",
      "",
      "3. Noise-corrected angle search",
      "",
      "The code scans candidate directions from -90 to +90 degrees. Background",
      "pixels are binned directly by their v coordinate, after clipping the",
      "high-pass residual at four sigma so that isolated bright leftovers",
      "cannot dominate a score. The mean profile power is corrected for the",
      "expected estimator noise, making scores comparable across angles. A",
      "coarse one-degree scan is followed by a local 0.125-degree refinement.",
      "",
      "4. Robust transverse profile",
      "",
      "At the selected direction, the stripe amplitude is estimated as a median",
      "per v bin. A Gaussian high-pass along v removes broad astronomical",
      "background variations and retains the row-to-row component. This",
      "transverse detrending scale is the main photometric protection.",
      "",
      "5. Wiener shrinkage",
      "",
      "A profile median based on n pixels has an estimated variance:",
      "",
      "  noise variance = (1.2533 * pixel sigma)^2 / n",
      "",
      "The measured profile is multiplied by:",
      "",
      "  lambda = signal variance / (signal variance + noise variance)",
      "",
      "A profile that is not measured above its own estimator noise therefore",
      "shrinks toward zero instead of injecting a false correction.",
      "",
      "6. No resampling of the science image",
      "",
      "StripeField never rotates the input image. Each background pixel votes",
      "directly in oriented coordinates, then the accepted profile is evaluated",
      "analytically at every original pixel. Only the model is interpolated.",
      "This avoids the subpixel registration error caused by rotating an image",
      "and rotating it back. Profile bins without enough background samples are",
      "filled by linear interpolation along v before this evaluation.",
      "",
      "7. Linear-feature guard",
      "",
      "A satellite trail or an unmasked diffraction spike can mimic a perfect",
      "stripe direction. A real stripe family excites many profile rows, while",
      "an isolated linear feature concentrates most power into a few rows. When",
      "that concentration test fires, those pixels are added to the mask and no",
      "field is subtracted for that candidate.",
      "",
      "8. Greedy multi-angle removal",
      "",
      "After one stripe family is subtracted, the angle scan is repeated on the",
      "corrected image. The loop stops when no remaining direction exceeds the",
      "selected significance threshold or when Maximum passes is reached.",
      "Several neighboring angles can approximate slight drizzle curvature.",
      "",
      "PROFILE MODE",
      "",
      "The default model assumes a stripe is constant along u. This global",
      "profile is the default because the optional windowed component shrank to",
      "zero in the reference mosaics. The experimental windowed",
      "option allows slow variation along u, but should remain disabled unless",
      "the signed model demonstrates a real need. In windowed mode, the",
      "per-cell noise variance accounts for the effective sample count after",
      "the smoothing applied along u.",
      "",
      "PARAMETER GUIDANCE",
      "",
      "Maximum passes",
      "  Upper limit on accepted angle families. The default is twelve.",
      "",
      "Stopping significance",
      "  Higher values are more conservative. The default is five sigma.",
      "",
      "Background smoothing",
      "  Large-scale normalized Gaussian radius. One hundred pixels is",
      "  the default for the reference mosaics.",
      "",
      "Source mask threshold",
      "  Lower values mask more astronomical signal. The default is three MAD.",
      "",
      "Transverse detrending",
      "  Larger values allow broader bands into the removed field but increase",
      "  the risk of subtracting real sky structure. Twenty-five pixels is",
      "  the default.",
      "",
      "QUALITY CONTROL",
      "",
      "Always open the signed StripeField model and apply an STF for inspection.",
      "It must contain line structure only. Reject the result if the model shows",
      "a galaxy, halo, tidal feature, star or diffraction pattern. A visible",
      "astronomical imprint means the correction is not trustworthy.",
      "",
      "If real structure appears in the model, return to the original linear",
      "image and use a more conservative configuration: raise the stopping",
      "significance, reduce Maximum passes, lower the source-mask threshold to",
      "mask more signal, or reduce the transverse detrending scale.",
      "",
      "OUTPUTS",
      "",
      "StripeFieldCorrected",
      "  The linear corrected image, or the target itself when replacement is",
      "  enabled.",
      "",
      "StripeFieldModel",
      "  The signed, full-precision additive field that was subtracted.",
      "",
      "The temporary PixInsight to Python FITS transfer is float32 and was",
      "verified sample by sample with zero numerical difference on the test",
      "image."
   ].join( "\n" );
}

class BBSFHelpDialog extends Dialog
{
constructor()
{
   super();

   var dialog = this;
   this.helpBox = new TextBox( this );
   this.helpBox.readOnly = true;
   this.helpBox.setScaledMinSize( 760, 600 );
   this.helpBox.text = bbsfMethodHelpText();
   this.helpBox.caretPosition = 0;

   this.closeButton = new PushButton( this );
   this.closeButton.text = "Close";
   this.closeButton.icon = this.scaledResource( ":/icons/close.png" );
   this.closeButton.defaultButton = true;
   this.closeButton.onClick = function()
   {
      dialog.ok();
   };

   this.buttonSizer = new HorizontalSizer;
   this.buttonSizer.addStretch();
   this.buttonSizer.add( this.closeButton );

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add( this.helpBox, 100 );
   this.sizer.add( this.buttonSizer );

   this.windowTitle = TITLE + " Method Help";
   this.adjustToContents();
   this.setMinSize();
}
}

class BBSFDialog extends Dialog
{
constructor( data )
{
   super();

   var dialog = this;
   this.data = data;
   var labelWidth = this.font.width( "Background smoothing:" ) +
      this.font.width( "MM" );

   this.helpLabel = new Label( this );
   this.helpLabel.frameStyle = FrameStyle_Box;
   this.helpLabel.margin = 6;
   this.helpLabel.wordWrapping = true;
   this.helpLabel.useRichText = true;
   this.helpLabel.text =
      "<p><b>" + TITLE + " v" + VERSION + "</b></p>" +
      "<p>Detects arbitrarily oriented " +
      "row-bias fields, masks astronomical sources, estimates robust " +
      "transverse profiles and applies Wiener shrinkage before subtraction. " +
      "The science image is never rotated or resampled.</p>" +
      "<p><b>Use a linear, monochrome image.</b> Inspect the signed model before " +
      "keeping the correction.</p>";

   this.targetLabel = new Label( this );
   this.targetLabel.text = "Target image:";
   this.targetLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.targetLabel.setFixedWidth( labelWidth );

   this.targetViewList = new ViewList( this );
   this.targetViewList.getMainViews();
   this.targetViewList.currentView = data.targetView;
   this.targetViewList.setScaledMinWidth( 380 );
   this.targetViewList.onViewSelected = function( view )
   {
      if ( !view.isNull )
         dialog.data.targetView = view;
   };

   this.targetSizer = new HorizontalSizer;
   this.targetSizer.spacing = 6;
   this.targetSizer.add( this.targetLabel );
   this.targetSizer.add( this.targetViewList, 100 );

   function addSpinBox( title, minimum, maximum, value, toolTip, callback )
   {
      var label = new Label( dialog );
      label.text = title;
      label.textAlignment = TextAlign_Right | TextAlign_VertCenter;
      label.setFixedWidth( labelWidth );

      var control = new SpinBox( dialog );
      control.setRange( minimum, maximum );
      control.value = value;
      control.setFixedWidth( 90 );
      control.toolTip = toolTip;
      control.onValueUpdated = callback;

      var sizer = new HorizontalSizer;
      sizer.spacing = 6;
      sizer.add( label );
      sizer.add( control );
      sizer.addStretch();
      return { label: label, control: control, sizer: sizer };
   }

   function addNumericControl(
      title,
      minimum,
      maximum,
      precision,
      value,
      toolTip,
      callback
   )
   {
      var control = new NumericControl( dialog );
      control.label.text = title;
      control.label.setFixedWidth( labelWidth );
      control.setRange( minimum, maximum );
      control.slider.setRange( 0, 500 );
      control.slider.setScaledMinWidth( 260 );
      control.setPrecision( precision );
      control.setValue( value );
      control.toolTip = toolTip;
      control.onValueUpdated = callback;
      return control;
   }

   this.modelGroup = new GroupBox( this );
   this.modelGroup.title = "Stripe-field model";
   this.modelGroup.sizer = new VerticalSizer;
   this.modelGroup.sizer.margin = 8;
   this.modelGroup.sizer.spacing = 6;

   this.maxIterations = addSpinBox(
      "Maximum passes:",
      1,
      30,
      data.maxIterations,
      "<p>Maximum number of greedy angle-detection and subtraction passes. " +
      "Default: 12.</p>",
      function( value )
      {
         dialog.data.maxIterations = value;
      }
   );
   this.modelGroup.sizer.add( this.maxIterations.sizer );

   this.significance = addNumericControl(
      "Stopping significance:",
      3.0,
      15.0,
      2,
      data.significance,
      "<p>Stop when the strongest remaining stripe angle is below this " +
      "significance. Default: 5 sigma.</p>",
      function( value )
      {
         dialog.data.significance = value;
      }
   );
   this.modelGroup.sizer.add( this.significance );

   this.backgroundSigma = addNumericControl(
      "Background smoothing:",
      20.0,
      500.0,
      1,
      data.backgroundSigma,
      "<p>Gaussian scale in pixels used for the normalized large-scale " +
      "background model. Default: 100 px.</p>",
      function( value )
      {
         dialog.data.backgroundSigma = value;
      }
   );
   this.modelGroup.sizer.add( this.backgroundSigma );

   this.sourceMaskSigma = addNumericControl(
      "Source mask threshold:",
      2.0,
      8.0,
      2,
      data.sourceMaskSigma,
      "<p>Iterative MAD clipping threshold used to exclude galaxies, stars " +
      "and diffraction spikes. Default: 3 MAD.</p>",
      function( value )
      {
         dialog.data.sourceMaskSigma = value;
      }
   );
   this.modelGroup.sizer.add( this.sourceMaskSigma );

   this.detrendSigma = addNumericControl(
      "Transverse detrending:",
      5.0,
      200.0,
      1,
      data.detrendSigma,
      "<p>High-pass scale across the stripes. Increasing it removes broader " +
      "bands but raises the risk of subtracting real background. Default: " +
      "25 px.</p>",
      function( value )
      {
         dialog.data.detrendSigma = value;
      }
   );
   this.modelGroup.sizer.add( this.detrendSigma );

   this.windowedCheck = new CheckBox( this );
   this.windowedCheck.text =
      "Allow slow variation along each stripe (experimental)";
   this.windowedCheck.checked = data.useWindowedProfile;
   this.windowedCheck.toolTip =
      "<p>Enables an additional windowed 2-D component. It was suppressed " +
      "automatically by Wiener shrinkage in the reference tests, " +
      "so it is disabled by default.</p>";
   this.windowedCheck.onCheck = function( checked )
   {
      dialog.data.useWindowedProfile = checked;
      dialog.windowSize.control.enabled = checked;
      dialog.windowSize.label.enabled = checked;
   };
   this.modelGroup.sizer.add( this.windowedCheck );

   this.windowSize = addSpinBox(
      "Along-stripe window:",
      256,
      4096,
      data.windowSize,
      "<p>Window size in pixels for the optional along-stripe component. " +
      "Default: 1024 px.</p>",
      function( value )
      {
         dialog.data.windowSize = value;
      }
   );
   this.windowSize.control.enabled = data.useWindowedProfile;
   this.windowSize.label.enabled = data.useWindowedProfile;
   this.modelGroup.sizer.add( this.windowSize.sizer );

   this.outputGroup = new GroupBox( this );
   this.outputGroup.title = "Output";
   this.outputGroup.sizer = new VerticalSizer;
   this.outputGroup.sizer.margin = 8;
   this.outputGroup.sizer.spacing = 6;

   this.showModelCheck = new CheckBox( this );
   this.showModelCheck.text = "Open the signed stripe model for quality control";
   this.showModelCheck.checked = data.showStripeModel;
   this.showModelCheck.onCheck = function( checked )
   {
      dialog.data.showStripeModel = checked;
   };
   this.outputGroup.sizer.add( this.showModelCheck );

   this.replaceTargetCheck = new CheckBox( this );
   this.replaceTargetCheck.text = "Replace target image (undoable)";
   this.replaceTargetCheck.checked = data.replaceTarget;
   this.replaceTargetCheck.onCheck = function( checked )
   {
      dialog.data.replaceTarget = checked;
   };
   this.outputGroup.sizer.add( this.replaceTargetCheck );

   this.warningLabel = new Label( this );
   this.warningLabel.wordWrapping = true;
   this.warningLabel.useRichText = true;
   this.warningLabel.text =
      "<p><b>Quality gate:</b> the signed model must contain stripe structure " +
      "only. If a galaxy, halo, star or tidal feature is visible in the model, " +
      "discard the correction and increase source protection or reduce the " +
      "transverse detrending scale.</p>";

   this.executeButton = new PushButton( this );
   this.executeButton.text = "Run StripeField";
   this.executeButton.icon = this.scaledResource( ":/icons/power.png" );
   this.executeButton.onClick = function()
   {
      if (
         dialog.data.targetView == null ||
         dialog.data.targetView.isNull
      )
      {
         ( new MessageBox(
            "Select a target image.",
            TITLE,
            StdIcon_Warning,
            StdButton_Ok
         ) ).execute();
         return;
      }
      dialog.ok();
   };

   this.cancelButton = new PushButton( this );
   this.cancelButton.text = "Cancel";
   this.cancelButton.icon = this.scaledResource( ":/icons/cancel.png" );
   this.cancelButton.onClick = function()
   {
      dialog.cancel();
   };

   this.methodHelpButton = new PushButton( this );
   this.methodHelpButton.text = "Method help";
   this.methodHelpButton.icon = this.scaledResource( ":/icons/help.png" );
   this.methodHelpButton.onClick = function()
   {
      ( new BBSFHelpDialog ).execute();
   };

   this.newInstanceButton = new ToolButton( this );
   this.newInstanceButton.icon =
      this.scaledResource( ":/process-interface/new-instance.png" );
   this.newInstanceButton.setScaledFixedSize( 24, 24 );
   this.newInstanceButton.toolTip =
      "<p>Drag to the workspace to create a StripeField process icon with " +
      "the current settings.</p>";
   this.newInstanceButton.onMousePress = function()
   {
      this.hasFocus = true;
      this.pushed = false;
      bbsfExportParameters( dialog.data );
      dialog.newInstance();
   };

   this.buttonSizer = new HorizontalSizer;
   this.buttonSizer.spacing = 6;
   this.buttonSizer.add( this.newInstanceButton );
   this.buttonSizer.add( this.methodHelpButton );
   this.buttonSizer.addStretch();
   this.buttonSizer.add( this.executeButton );
   this.buttonSizer.add( this.cancelButton );

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add( this.helpLabel );
   this.sizer.add( this.targetSizer );
   this.sizer.add( this.modelGroup );
   this.sizer.add( this.outputGroup );
   this.sizer.add( this.warningLabel );
   this.sizer.add( this.buttonSizer );

   this.windowTitle = TITLE + " v" + VERSION;
   this.adjustToContents();
   this.setFixedSize();
}
}

function main()
{
   var data = new BBSFData;
   if ( Parameters.isGlobalTarget || Parameters.isViewTarget )
      bbsfImportParameters( data );

   if ( Parameters.isViewTarget )
      data.targetView = Parameters.targetView;
   else
   {
      var activeWindow = ImageWindow.activeWindow;
      if ( activeWindow == null || activeWindow.isNull )
      {
         ( new MessageBox(
            "Open a linear monochrome image before launching " + TITLE + ".",
            TITLE,
            StdIcon_Warning,
            StdButton_Ok
         ) ).execute();
         return;
      }
      data.targetView = activeWindow.mainView;
   }

   Console.show();
   Console.writeln( "Checking StripeField Python dependencies..." );
   var dependencies = bbsfProbeDependencies();
   if ( !dependencies.ok )
   {
      Console.warningln( dependencies.message );
      if ( !bbsfOfferSetup() )
         return;

      dependencies = bbsfProbeDependencies();
      if ( !dependencies.ok )
      {
         Console.criticalln(
            "Setup completed but no usable Python environment was found."
         );
         ( new MessageBox(
            "The setup completed, but StripeField still cannot reach its " +
            "Python environment.\n\nSee the Console for details.",
            TITLE + " - Setup Incomplete",
            StdIcon_Error,
            StdButton_Ok
         ) ).execute();
         return;
      }
   }
   Console.noteln( "Python OK: " + dependencies.python );
   Console.hide();

   if ( Parameters.isViewTarget )
   {
      bbsfExecute( data );
      return;
   }

   var dialog = new BBSFDialog( data );
   if ( dialog.execute() == StdDialogCode_Ok )
      bbsfExecute( data );
}

#ifndef BBSF_LIBRARY_MODE
main();
#endif
