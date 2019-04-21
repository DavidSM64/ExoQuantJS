# ExoQuantJS (ExoQuant v0.7)

ExoQuantJS is a javascript port of Dennis Ranke's ExoQuant library: https://github.com/exoticorn/exoquant

ExoQuant is a high-quality, easy to use color quantization library. This is for you if you need one or more of the following:

* Very high-quality color reduction
* Reduction of images including alpha
* Creation of a shared palette for more than one image (or mipmap level)
* Dithering of the reduced image with very little noise

Other versions:\
C# - https://github.com/DavidSM64/ExoQuantSharp \
VB.NET - https://github.com/DavidSM64/ExoQuantVB \
Python - https://github.com/DavidSM64/ExoQuantPY

## Usage:

First, of course, you need to import the library:

    <script src="exoquant.js" type="text/javascript"></script>

Then for each image or texture to convert follow the following steps:

### Step 1: Initialise and set options.

First you need to create an Exoquant object:

    var exq = new ExoQuant();

Then you can set the following options:

#### Option: Alpha is no transparency

Use this option if you don't use the alpha channel of your image/texture as transparency or if the color is already premultiplied by the alpha. To set this option just call the method `NoTransparency()`:

    exq.NoTransparency();

### Step 2: Feed the image data

Now you need to feed the image data to the quantizer. The image data needs to be 32 bits per pixel. The first byte of each pixel needs to be the red channel, the last byte needs to be alpha.

To feed the image data you have to call `Feed`, which can be called more than once to create a shared palette for more than one image, for example for a texture with several mipmap levels:

    exq.Feed(imageData);

### Step 3: Color reduction

    exq.Quantize(numColors);
    exq.QuantizeHq(numColors); // High Quality, recommended option.
    exq.QuantizeEx(numColors, highQuality); // 'highQuality' is a boolean

### Step 4: Retrieve the palette

    var rgba32Palette = exq.GetPalette(numColors);

### Step 5: Map the image to the palette

    var indexData = exq.MapImage(numPixels, imageData);
    var indexData = exq.MapImageOrdered(width, height, imageData);

## Licence

ExoQuantJS (ExoQuant v0.7)

Copyright (c) 2019 David Benepe\
Copyright (c) 2004 Dennis Ranke

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
