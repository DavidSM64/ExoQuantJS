/*
ExoQuantJS (ExoQuant v0.7)

Copyright (c) 2019 David Benepe
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
*/

/******************************************************************************
* Usage:
* ------
*
* var exq = new ExoQuant(); // init quantizer (per image)
* exq.Feed(<byte array of rgba32 data>); // feed pixel data (32bpp)
* exq.Quantize(<num of colors>); // find palette
* var rgba32Palette = exq.GetPalette(<num of colors>); // get palette
* var indexData = exq.MapImage(<num of pixels>, <byte array of rgba32 data>);
* or:
* var indexData = exq.MapImageOrdered(<width>, <height>, <byte array of rgba32 data>); 
* // map image to palette
*
* Notes:
* ------
*
* All 32bpp data (input data and palette data) is considered a byte stream
* of the format:
* R0 G0 B0 A0 R1 G1 B1 A1 ...
* If you want to use a different order, the easiest way to do this is to
* change the SCALE_x constants in expquant.h, as those are the only differences
* between the channels.
*
******************************************************************************/

function _EXQ_MAKE_UNSIGNED(val)
{
    return val >>> 0;
}

var _EXQ_HASH_BITS = 16;
var _EXQ_HASH_SIZE = 1 << _EXQ_HASH_BITS;

var _EXQ_SCALE_R = 1.0;
var _EXQ_SCALE_G = 1.2;
var _EXQ_SCALE_B = 0.8;
var _EXQ_SCALE_A = 1.0;

class ExqColor 
{
    constructor()
    {
        this.r = 0.0; // double
        this.g = 0.0; // double
        this.b = 0.0; // double
        this.a = 0.0; // double
    }
}

var _EXQ_sortDir = new ExqColor();

class ExqHistogramEntry 
{
    constructor()
    {
        this.color = new ExqColor(); // ExqColor
        this.ored = 0; // byte
        this.ogreen = 0; // byte
        this.oblue = 0; // byte
        this.oalpha = 0; // byte
        this.palIndex = 0; // int
        this.ditherScale = new ExqColor(); // ExqColor
        this.ditherIndex = new Array(4); // int[4]
        this.num = 0; // int
        this.pNext = null; // ExqHistogramEntry
        this.pNextInHash = null; // ExqHistogramEntry
    }
}

class ExqNode 
{
    constructor()
    {
        this.dir = new ExqColor(); // ExqColor
        this.avg = new ExqColor(); // ExqColor
        this.vdif = 0.0; // double
        this.err = 0.0; // double
        this.num = 0; // int 
        this.pHistogram = null; // ExqHistogramEntry
        this.pSplit = null; // ExqHistogramEntry
    }
}

class ExqData 
{
    constructor()
    {
        this.pHash = new Array(_EXQ_HASH_SIZE); // ExqHistogramEntry[_EXQ_HASH_SIZE]
        this.node = new Array(256); // ExqNode[256]
        this.numColors = 0; // int
        this.numBitsPerChannel = 0; // int
        this.optimized = false; // bool
        this.transparency = false; // bool
    }
}

class ExoQuant 
{
    constructor()
    {
        this.pExq = new ExqData();
        
        for (var i = 0; i < 256; i++)
        {
            this.pExq.node[i] = new ExqNode();
        }

        for (var i = 0; i < _EXQ_HASH_SIZE; i++)
        {
            this.pExq.pHash[i] = null;
        }

        this.pExq.numColors = 0;
        this.pExq.optimized = false;
        this.pExq.transparency = true;
        this.pExq.numBitsPerChannel = 8;
    }
    
    NoTransparency()
    {
        this.pExq.transparency = false;
    }
    
    MakeHash(rgba)
    {
        rgba -= (rgba >>> 13) | (rgba << 19);
        rgba -= (rgba >>> 13) | (rgba << 19);
        rgba -= (rgba >>> 13) | (rgba << 19);
        rgba -= (rgba >>> 13) | (rgba << 19);
        rgba -= (rgba >>> 13) | (rgba << 19);
        rgba &= (_EXQ_HASH_SIZE - 1);
        return _EXQ_MAKE_UNSIGNED(rgba);
    }

    ToRGBA(r, g, b, a)
    {
        return _EXQ_MAKE_UNSIGNED(r | (g << 8) | (b << 16) | (a << 24));
    }
    
    Feed(pData)
    {
        var channelMask = 0xFF00 >> this.pExq.numBitsPerChannel;

        var nPixels = pData.length / 4;

        for (var i = 0; i < nPixels; i++)
        {
            var r = pData[i * 4 + 0], g = pData[i * 4 + 1], 
                b = pData[i * 4 + 2], a = pData[i * 4 + 3];
            
            var hash = this.MakeHash(this.ToRGBA(r, g, b, a));

            var pCur = this.pExq.pHash[hash];

            while (pCur != null && (pCur.ored != r || pCur.ogreen != g || pCur.oblue != b || pCur.oalpha != a))
                pCur = pCur.pNextInHash;

            if (pCur != null)
                pCur.num++;
            else
            {
                pCur = new ExqHistogramEntry();
                pCur.pNextInHash = this.pExq.pHash[hash];
                this.pExq.pHash[hash] = pCur;
                pCur.ored = r; pCur.ogreen = g; pCur.oblue = b; pCur.oalpha = a;
                r &= channelMask; g &= channelMask; b &= channelMask;
                pCur.color.r = r / 255.0 * _EXQ_SCALE_R;
                pCur.color.g = g / 255.0 * _EXQ_SCALE_G;
                pCur.color.b = b / 255.0 * _EXQ_SCALE_B;
                pCur.color.a = a / 255.0 * _EXQ_SCALE_A;

                if (this.pExq.transparency)
                {
                    pCur.color.r *= pCur.color.a;
                    pCur.color.g *= pCur.color.a;
                    pCur.color.b *= pCur.color.a;
                }

                pCur.num = 1;
                pCur.palIndex = -1;
                pCur.ditherScale.r = pCur.ditherScale.g = pCur.ditherScale.b =
                    pCur.ditherScale.a = -1;
                pCur.ditherIndex[0] = pCur.ditherIndex[1] = pCur.ditherIndex[2] =
                    pCur.ditherIndex[3] = -1;
            }
        }
    }
    
    Quantize(nColors)
    {
        this.QuantizeEx(nColors, false);
    }
    
    QuantizeHq(nColors)
    {
        this.QuantizeEx(nColors, true);
    }

    QuantizeEx(nColors, hq)
    {
        var besti;
        var beste;
        var pCur = null, pNext = null;
        var i, j;

        if (nColors > 256)
            nColors = 256;

        if (this.pExq.numColors == 0)
        {
            this.pExq.node[0].pHistogram = null;
            for (i = 0; i < _EXQ_HASH_SIZE; i++)
                for (pCur = this.pExq.pHash[i]; pCur != null; pCur = pCur.pNextInHash)
                {
                    pCur.pNext = this.pExq.node[0].pHistogram;
                    this.pExq.node[0].pHistogram = pCur;
                }
            this.SumNode(this.pExq.node[0]);
            this.pExq.numColors = 1;
        }
        
        for (i = this.pExq.numColors; i < nColors; i++)
        {
            beste = 0;
            besti = 0;
            for (j = 0; j < i; j++)
                if (this.pExq.node[j].vdif >= beste)
                {
                    beste = this.pExq.node[j].vdif;
                    besti = j;
                }
            
            pCur = this.pExq.node[besti].pHistogram;

            this.pExq.node[besti].pHistogram = null;
            this.pExq.node[i].pHistogram = null;
            while (pCur != null && pCur != this.pExq.node[besti].pSplit)
            {
                pNext = pCur.pNext;
                pCur.pNext = this.pExq.node[i].pHistogram;
                this.pExq.node[i].pHistogram = pCur;
                pCur = pNext;
            }

            while (pCur != null)
            {
                pNext = pCur.pNext;
                pCur.pNext = this.pExq.node[besti].pHistogram;
                this.pExq.node[besti].pHistogram = pCur;
                pCur = pNext;
            }
            
            this.SumNode(this.pExq.node[besti]);
            this.SumNode(this.pExq.node[i]);

            this.pExq.numColors = i + 1;
            if (hq)
                this.OptimizePalette(1);
        }

        this.pExq.optimized = false;
    }
    
    GetMeanError()
    {
        var n = 0;
        var err = 0;

        for (var i = 0; i < this.pExq.numColors; i++)
        {
            n += this.pExq.node[i].num;
            err += this.pExq.node[i].err;
        }

        return Math.sqrt(err / n) * 256;
    }

    GetPalette(nColors)
    {
        var r, g, b, a;
        var channelMask = 0xff00 >> this.pExq.numBitsPerChannel;

        var pPal = new Uint8Array(nColors * 4);

        if (nColors > this.pExq.numColors)
            nColors = this.pExq.numColors;
        
        if (!this.pExq.optimized)
            this.OptimizePalette(4);
        
        for (var i = 0; i < nColors; i++)
        {
            r = this.pExq.node[i].avg.r;
            g = this.pExq.node[i].avg.g;
            b = this.pExq.node[i].avg.b;
            a = this.pExq.node[i].avg.a;

            if (this.pExq.transparency && a != 0)
            {
                r /= a; g /= a; b /= a;
            }

            var pPalIndex = i * 4;

            pPal[pPalIndex + 0] = r / _EXQ_SCALE_R * 255.9;
            pPal[pPalIndex + 1] = g / _EXQ_SCALE_G * 255.9;
            pPal[pPalIndex + 2] = b / _EXQ_SCALE_B * 255.9;
            pPal[pPalIndex + 3] = a / _EXQ_SCALE_A * 255.9;

            for (var j = 0; j < 3; j++)
                pPal[pPalIndex + j] = (pPal[pPalIndex + j] + (1 << (8 - this.pExq.numBitsPerChannel)) / 2) & channelMask;
        }
        
        return pPal;
    }

    SetPalette(pPal, nColors)
    {
        this.pExq.numColors = nColors;

        for (var i = 0; i < nColors; i++)
        {
            this.pExq.node[i].avg.r = pPal[i * 4 + 0] * _EXQ_SCALE_R / 255.9;
            this.pExq.node[i].avg.g = pPal[i * 4 + 1] * _EXQ_SCALE_G / 255.9;
            this.pExq.node[i].avg.b = pPal[i * 4 + 2] * _EXQ_SCALE_B / 255.9;
            this.pExq.node[i].avg.a = pPal[i * 4 + 3] * _EXQ_SCALE_A / 255.9;
        }

        this.pExq.optimized = true;
    }
    
    MapImage(nPixels, pIn)
    {
        var c = new ExqColor();
        var pHist = null;

        var pOut = new Uint8Array(nPixels);

        if (!this.pExq.optimized)
            this.OptimizePalette(4);

        for (var i = 0; i < nPixels; i++)
        {
            pHist = this.FindHistogram(pIn, i);
            if (pHist != null && pHist.palIndex != -1)
            {
                pOut[i] = pHist.palIndex;
            }
            else
            {
                c.r = pIn[i * 4 + 0] / 255.0 * _EXQ_SCALE_R;
                c.g = pIn[i * 4 + 1] / 255.0 * _EXQ_SCALE_G;
                c.b = pIn[i * 4 + 2] / 255.0 * _EXQ_SCALE_B;
                c.a = pIn[i * 4 + 3] / 255.0 * _EXQ_SCALE_A;

                if(this.pExq.transparency)
                {
                    c.r *= c.a; c.g *= c.a; c.b *= c.a;
                }
                
                pOut[i] = this.FindNearestColor(c);
                if(pHist != null)
                    pHist.palIndex = i;
            }
        }
        
        return pOut;
    }

    MapImageOrdered(width, height, pIn)
    {
        return this.MapImageDither(width, height, pIn, true);
    }

    MapImageRandom(nPixels, pIn)
    {
        return this.MapImageDither(nPixels, 1, pIn, false);
    }
    
    //private readonly Random random = new Random();
    MapImageDither(width, height, pIn, ordered)
    {
        var ditherMatrix = [ -0.375, 0.125, 0.375, -0.125 ];

        var i, j, d;
        var p = new ExqColor(), 
          scale = new ExqColor(), 
          tmp = new ExqColor();
        var pHist = null;
        
        var pOut = new Uint8Array(width * height);

        if (!this.pExq.optimized)
            this.OptimizePalette(4);

        for (var y = 0; y < height; y++)
            for (var x = 0; x < width; x++)
            {
                var index = y * width + x;

                if (ordered)
                    d = (x & 1) + (y & 1) * 2;
                else
                    d = Math.random() & 3;

                pHist = this.FindHistogram(pIn, index);

                p.r = pIn[index * 4 + 0] / 255.0 * _EXQ_SCALE_R;
                p.g = pIn[index * 4 + 1] / 255.0 * _EXQ_SCALE_G;
                p.b = pIn[index * 4 + 2] / 255.0 * _EXQ_SCALE_B;
                p.a = pIn[index * 4 + 3] / 255.0 * _EXQ_SCALE_A;

                if (this.pExq.transparency)
                {
                    p.r *= p.a; p.g *= p.a; p.b *= p.a;
                }

                if (pHist == null || pHist.ditherScale.r < 0)
                {
                    i = this.FindNearestColor(p);
                    scale.r = this.pExq.node[i].avg.r - p.r;
                    scale.g = this.pExq.node[i].avg.g - p.g;
                    scale.b = this.pExq.node[i].avg.b - p.b;
                    scale.a = this.pExq.node[i].avg.a - p.a;
                    tmp.r = p.r - scale.r / 3;
                    tmp.g = p.g - scale.g / 3;
                    tmp.b = p.b - scale.b / 3;
                    tmp.a = p.a - scale.a / 3;
                    j = this.FindNearestColor(tmp);
                    if (i == j)
                    {
                        tmp.r = p.r - scale.r * 3;
                        tmp.g = p.g - scale.g * 3;
                        tmp.b = p.b - scale.b * 3;
                        tmp.a = p.a - scale.a * 3;
                        j = this.FindNearestColor(tmp);
                    }
                    if (i != j)
                    {
                        scale.r = (this.pExq.node[j].avg.r - this.pExq.node[i].avg.r) * 0.8;
                        scale.g = (this.pExq.node[j].avg.g - this.pExq.node[i].avg.g) * 0.8;
                        scale.b = (this.pExq.node[j].avg.b - this.pExq.node[i].avg.b) * 0.8;
                        scale.a = (this.pExq.node[j].avg.a - this.pExq.node[i].avg.a) * 0.8;
                        if (scale.r < 0) scale.r = -scale.r;
                        if (scale.g < 0) scale.g = -scale.g;
                        if (scale.b < 0) scale.b = -scale.b;
                        if (scale.a < 0) scale.a = -scale.a;
                    }
                    else
                        scale.r = scale.g = scale.b = scale.a = 0;

                    if (pHist != null)
                    {
                        pHist.ditherScale.r = scale.r;
                        pHist.ditherScale.g = scale.g;
                        pHist.ditherScale.b = scale.b;
                        pHist.ditherScale.a = scale.a;
                    }
                }
                else
                {
                    scale.r = pHist.ditherScale.r;
                    scale.g = pHist.ditherScale.g;
                    scale.b = pHist.ditherScale.b;
                    scale.a = pHist.ditherScale.a;
                }

                if (pHist != null && pHist.ditherIndex[d] >= 0)
                {
                    pOut[index] = pHist.ditherIndex[d];
                }
                else
                {
                    tmp.r = p.r + scale.r * ditherMatrix[d];
                    tmp.g = p.g + scale.g * ditherMatrix[d];
                    tmp.b = p.b + scale.b * ditherMatrix[d];
                    tmp.a = p.a + scale.a * ditherMatrix[d];
                    pOut[index] = this.FindNearestColor(tmp);
                    if (pHist != null)
                    {
                        pHist.ditherIndex[d] = pOut[index];
                    }
                }
            }
            
        return pOut;
    }
    
    SumNode(pNode)
    {
        var n = 0, n2;
        var fsum = new ExqColor(), fsum2 = new ExqColor(), vc = new ExqColor(), 
              tmp = new ExqColor(), tmp2 = new ExqColor(), 
              sum = new ExqColor(), sum2 = new ExqColor();
        var pCur = null;
        var isqrt, nv, v;

        fsum.r = fsum.g = fsum.b = fsum.a = 0;
        fsum2.r = fsum2.g = fsum2.b = fsum2.a = 0;

        for (pCur = pNode.pHistogram; pCur != null; pCur = pCur.pNext)
        {
            n += pCur.num;
            fsum.r += pCur.color.r * pCur.num;
            fsum.g += pCur.color.g * pCur.num;
            fsum.b += pCur.color.b * pCur.num;
            fsum.a += pCur.color.a * pCur.num;
            fsum2.r += pCur.color.r * pCur.color.r * pCur.num;
            fsum2.g += pCur.color.g * pCur.color.g * pCur.num;
            fsum2.b += pCur.color.b * pCur.color.b * pCur.num;
            fsum2.a += pCur.color.a * pCur.color.a * pCur.num;
        }
        pNode.num = n;
        if (n == 0)
        {
            pNode.vdif = 0;
            pNode.err = 0;
            return;
        }

        pNode.avg.r = fsum.r / n;
        pNode.avg.g = fsum.g / n;
        pNode.avg.b = fsum.b / n;
        pNode.avg.a = fsum.a / n;

        vc.r = fsum2.r - fsum.r * pNode.avg.r;
        vc.g = fsum2.g - fsum.g * pNode.avg.g;
        vc.b = fsum2.b - fsum.b * pNode.avg.b;
        vc.a = fsum2.a - fsum.a * pNode.avg.a;

        v = vc.r + vc.g + vc.b + vc.a;
        pNode.err = v;
        pNode.vdif = -v;
        
        if (vc.r > vc.g && vc.r > vc.b && vc.r > vc.a)
            pNode.pHistogram = this.Sort(pNode.pHistogram, this.SortByRed);
        else if (vc.g > vc.b && vc.g > vc.a)
            pNode.pHistogram = this.Sort(pNode.pHistogram, this.SortByGreen);
        else if (vc.b > vc.a)
            pNode.pHistogram = this.Sort(pNode.pHistogram, this.SortByBlue);
        else
            pNode.pHistogram = this.Sort(pNode.pHistogram, this.SortByAlpha);

        pNode.dir.r = pNode.dir.g = pNode.dir.b = pNode.dir.a = 0;
        for (pCur = pNode.pHistogram; pCur != null; pCur = pCur.pNext)
        {
            tmp.r = (pCur.color.r - pNode.avg.r) * pCur.num;
            tmp.g = (pCur.color.g - pNode.avg.g) * pCur.num;
            tmp.b = (pCur.color.b - pNode.avg.b) * pCur.num;
            tmp.a = (pCur.color.a - pNode.avg.a) * pCur.num;
            if (tmp.r * pNode.dir.r + tmp.g * pNode.dir.g +
                tmp.b * pNode.dir.b + tmp.a * pNode.dir.a < 0)
            {
                tmp.r = -tmp.r;
                tmp.g = -tmp.g;
                tmp.b = -tmp.b;
                tmp.a = -tmp.a;
            }
            pNode.dir.r += tmp.r;
            pNode.dir.g += tmp.g;
            pNode.dir.b += tmp.b;
            pNode.dir.a += tmp.a;
        }
        isqrt = 1 / Math.sqrt(pNode.dir.r * pNode.dir.r + pNode.dir.g * pNode.dir.g + pNode.dir.b * pNode.dir.b + pNode.dir.a * pNode.dir.a);
        pNode.dir.r *= isqrt;
        pNode.dir.g *= isqrt;
        pNode.dir.b *= isqrt;
        pNode.dir.a *= isqrt;

        _EXQ_sortDir = pNode.dir;
        pNode.pHistogram = this.Sort(pNode.pHistogram, this.SortByDir);

        sum.r = sum.g = sum.b = sum.a = 0;
        sum2.r = sum2.g = sum2.b = sum2.a = 0;
        n2 = 0;
        pNode.pSplit = pNode.pHistogram;
        for (pCur = pNode.pHistogram; pCur != null; pCur = pCur.pNext)
        {
            if (pNode.pSplit == null)
                pNode.pSplit = pCur;

            n2 += pCur.num;
            sum.r += pCur.color.r * pCur.num;
            sum.g += pCur.color.g * pCur.num;
            sum.b += pCur.color.b * pCur.num;
            sum.a += pCur.color.a * pCur.num;
            sum2.r += pCur.color.r * pCur.color.r * pCur.num;
            sum2.g += pCur.color.g * pCur.color.g * pCur.num;
            sum2.b += pCur.color.b * pCur.color.b * pCur.num;
            sum2.a += pCur.color.a * pCur.color.a * pCur.num;

            if (n == n2)
                break;

            tmp.r = sum2.r - sum.r * sum.r / n2;
            tmp.g = sum2.g - sum.g * sum.g / n2;
            tmp.b = sum2.b - sum.b * sum.b / n2;
            tmp.a = sum2.a - sum.a * sum.a / n2;
            tmp2.r = (fsum2.r - sum2.r) - (fsum.r - sum.r) * (fsum.r - sum.r) / (n - n2);
            tmp2.g = (fsum2.g - sum2.g) - (fsum.g - sum.g) * (fsum.g - sum.g) / (n - n2);
            tmp2.b = (fsum2.b - sum2.b) - (fsum.b - sum.b) * (fsum.b - sum.b) / (n - n2);
            tmp2.a = (fsum2.a - sum2.a) - (fsum.a - sum.a) * (fsum.a - sum.a) / (n - n2);

            nv = tmp.r + tmp.g + tmp.b + tmp.a + tmp2.r + tmp2.g + tmp2.b + tmp2.a;
            if (-nv > pNode.vdif)
            {
                pNode.vdif = -nv;
                pNode.pSplit = null;
            }
        }

        if (pNode.pSplit == pNode.pHistogram)
            pNode.pSplit = pNode.pSplit.pNext;

        pNode.vdif += v;
    }

    OptimizePalette(iter)
    {
        var pCur = null;

        this.pExq.optimized = true;

        for (var n = 0; n < iter; n++)
        {
            for (var i = 0; i < this.pExq.numColors; i++)
                this.pExq.node[i].pHistogram = null;

            for (var i = 0; i < _EXQ_HASH_SIZE; i++)
                for (pCur = this.pExq.pHash[i]; pCur != null; pCur = pCur.pNextInHash)
                {
                    var j = this.FindNearestColor(pCur.color);
                    pCur.pNext = this.pExq.node[j].pHistogram;
                    this.pExq.node[j].pHistogram = pCur;
                }

            for (var i = 0; i < this.pExq.numColors; i++)
                this.SumNode(this.pExq.node[i]);
        }
    }

    FindNearestColor(pColor)
    {
        var dif = new ExqColor();
        var bestv = 16;
        var besti = 0;

        for (var i = 0; i < this.pExq.numColors; i++)
        {
            dif.r = pColor.r - this.pExq.node[i].avg.r;
            dif.g = pColor.g - this.pExq.node[i].avg.g;
            dif.b = pColor.b - this.pExq.node[i].avg.b;
            dif.a = pColor.a - this.pExq.node[i].avg.a;
            if (dif.r * dif.r + dif.g * dif.g + dif.b * dif.b + dif.a * dif.a < bestv)
            {
                bestv = dif.r * dif.r + dif.g * dif.g + dif.b * dif.b + dif.a * dif.a;
                besti = i;
            }
        }
        return besti;
    }
    
    FindHistogram(pCol, index)
    {
        var hash;
        var pCur = null;

        var r = pCol[index * 4 + 0], 
             g = pCol[index * 4 + 1], 
             b = pCol[index * 4 + 2], 
             a = pCol[index * 4 + 3];
        
        hash = this.MakeHash(this.ToRGBA(r, g, b, a));
        
        pCur = this.pExq.pHash[hash];
        while (pCur != null && (pCur.ored != r || pCur.ogreen != g || pCur.oblue != b || pCur.oalpha != a))
        {
            pCur = pCur.pNextInHash;
        }

        return pCur;
    }

    Sort(ppHist, sortfunc)
    {
        var pLow = null, pHigh = null, pCur = null, pNext = null;
        var n = 0;
        var sum = 0;

        for (pCur = ppHist; pCur != null; pCur = pCur.pNext)
        {
            n++;
            sum += sortfunc(pCur);
        }
        
        if (n < 2)
        {
            return ppHist;
        }

        sum /= n;

        pLow = pHigh = null;
        for (pCur = ppHist; pCur != null; pCur = pNext)
        {
            pNext = pCur.pNext;
            if (sortfunc(pCur) < sum)
            {
                pCur.pNext = pLow;
                pLow = pCur;
            }
            else
            {
                pCur.pNext = pHigh;
                pHigh = pCur;
            }
        }

        if (pLow == null)
        {
            ppHist = pHigh;
            return ppHist;
        }
        if (pHigh == null)
        {
            ppHist = pLow;
            return ppHist;
        }

        pLow = this.Sort(pLow, sortfunc);
        pHigh = this.Sort(pHigh, sortfunc);

        ppHist = pLow;
        while (pLow.pNext != null)
            pLow = pLow.pNext;

        pLow.pNext = pHigh;
        
        return ppHist; // Because javascript can't pass by reference. :/
    }

    SortByRed(pHist)
    {
        return pHist.color.r;
    }

    SortByGreen(pHist)
    {
        return pHist.color.g;
    }

    SortByBlue(pHist)
    {
        return pHist.color.b;
    }

    SortByAlpha(pHist)
    {
        return pHist.color.a;
    }

    SortByDir(pHist)
    {
        return pHist.color.r * _EXQ_sortDir.r + 
            pHist.color.g * _EXQ_sortDir.g + 
            pHist.color.b * _EXQ_sortDir.b + 
            pHist.color.a * _EXQ_sortDir.a;
    }
}
