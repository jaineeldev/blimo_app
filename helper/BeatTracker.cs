// Finds the beat in music as it plays, for "bop to the beat". It's fed the sound (see Loopback.cs) and
// keeps only a running measure of how much louder each pitch band just got. Drums and new notes show up
// as jumps in it. Every half second it looks for the tempo whose rhythm repeats best over the last eight
// seconds, then where its beats land. Only those numbers are kept; the sound itself goes nowhere.

using System;
using System.Globalization;

class BeatTracker
{
    const int Size = 1024;
    const int Hop = 512;
    // Bands up to this pitch count: kick, snare, bass and most instruments, below the hiss of cymbals.
    const double TopHz = 5000;
    // Sound quieter than this (about -60 dB) counts as silence.
    const double QuietLevel = 0.001;
    const double HistorySeconds = 8;
    // It needs this much to go on before it guesses.
    const double MinSeconds = 4;
    // Beats are matched over this much of the latest history.
    const double PhaseSeconds = 4;
    const double SlowestBpm = 60;
    const double FastestBpm = 200;
    // Tempos are nudged toward this one, an octave either way being half as likely, so a song at 128
    // doesn't come out as 64 or 256.
    const double LikelyBpm = 120;
    const double OctaveSpread = 0.9;
    // How strongly the rhythm has to repeat, from 0 to 1, to count as having a beat at all.
    const double MinStrength = 0.12;
    // Tempo guesses this close count as the same one.
    const double SameTempo = 0.04;
    // A different tempo has to come up this many times running to take over (a new song, say)...
    const int ChangeAfter = 3;
    // ...and this many weak guesses in a row lose the beat.
    const int LoseAfter = 6;

    readonly int rate;
    readonly double frameRate;
    readonly int topBin;
    readonly double[] window = new double[Size];
    readonly double[] re = new double[Size];
    readonly double[] im = new double[Size];
    readonly double[] level;
    readonly double[] lastLevel;
    readonly float[] samples = new float[Size];
    int filled;
    long fed;

    // How much louder it got, one value per hop, in a ring.
    readonly double[] flux;
    long frames;
    double sinceGuess;

    // The tempo it has settled on, as frames per beat (0 for none), and where the latest beat fell.
    double period;
    double beatFrame;
    double candidate;
    int changeVotes;
    int weakGuesses;

    // When the last sample fed played, which ties sample counts to the clock.
    double fedAtMs;
    // Feeding happens on the listening thread; the report is read on the main one.
    readonly object gate = new object();

    public BeatTracker(int rate)
    {
        this.rate = rate;
        frameRate = (double)rate / Hop;
        topBin = Math.Min(Size / 2 - 1, (int)(TopHz * Size / rate));
        level = new double[topBin + 1];
        lastLevel = new double[topBin + 1];
        flux = new double[(int)(frameRate * HistorySeconds)];
        for (int i = 0; i < Size; i++) window[i] = 0.5 - 0.5 * Math.Cos(2 * Math.PI * i / Size);
    }

    /** Takes the next stretch of sound, already mixed down to one channel. `playedAtMs` is when its last sample played. */
    public void Feed(float[] mono, int count, double playedAtMs)
    {
        lock (gate)
        {
            for (int i = 0; i < count; i++)
            {
                samples[filled++] = mono[i];
                if (filled == Size)
                {
                    Measure();
                    Array.Copy(samples, Hop, samples, 0, Size - Hop);
                    filled = Size - Hop;
                }
            }
            fed += count;
            fedAtMs = playedAtMs;
        }
    }

    /** The tempo and the time of a recent beat, as JSON for the helper's report, or "null" without a clear beat. */
    public string Json()
    {
        lock (gate)
        {
            if (period <= 0) return "null";
            double bpm = 60 * frameRate / period;
            // Hop f measures the window ending at sample Size + f * Hop. A new sound shows up most there
            // once it's about a quarter of the way in, three quarters back from the end.
            double sample = Size + beatFrame * Hop - Size * 0.75;
            double at = fedAtMs - (fed - sample) * 1000 / rate;
            return "{\"bpm\":" + bpm.ToString("0.0", CultureInfo.InvariantCulture) +
                ",\"at\":" + Math.Round(at).ToString(CultureInfo.InvariantCulture) + "}";
        }
    }

    /** One hop: how much louder each band got since the last, added up. */
    void Measure()
    {
        double power = 0;
        for (int i = 0; i < Size; i++)
        {
            power += samples[i] * samples[i];
            re[i] = samples[i] * window[i];
            im[i] = 0;
        }
        Fft(re, im);
        double rise = 0;
        for (int k = 1; k <= topBin; k++)
        {
            // Compressed, so a quiet song's beat counts as much as a loud one's.
            level[k] = Math.Log(1 + 1000 * Math.Sqrt(re[k] * re[k] + im[k] * im[k]));
            double up = level[k] - lastLevel[k];
            if (up > 0) rise += up;
            lastLevel[k] = level[k];
        }
        // Near silence (a quiet gap, or just hiss) has no beat, however its noise happens to fall.
        bool quiet = Math.Sqrt(power / Size) < QuietLevel;
        flux[frames % flux.Length] = quiet ? 0 : rise / topBin;
        frames++;
        sinceGuess += 1 / frameRate;
        if (sinceGuess >= 0.5)
        {
            sinceGuess = 0;
            Guess();
        }
    }

    /** The last `n` values of the flux, oldest first. */
    double[] Recent(int n)
    {
        var values = new double[n];
        for (int i = 0; i < n; i++) values[i] = flux[(frames - n + i) % flux.Length];
        return values;
    }

    void Guess()
    {
        int n = (int)Math.Min(frames, flux.Length);
        if (n < frameRate * MinSeconds) return;
        double[] x = Smooth(Recent(n));
        double mean = 0;
        foreach (double v in x) mean += v;
        mean /= n;
        for (int i = 0; i < n; i++) x[i] -= mean;

        // How well the rhythm lines up with itself shifted by each lag, up to twice the slowest beat.
        int shortest = (int)Math.Floor(60 * frameRate / FastestBpm);
        int longest = (int)Math.Ceiling(60 * frameRate / SlowestBpm);
        var match = new double[2 * longest + 2];
        for (int lag = 0; lag < match.Length && lag < n; lag++)
        {
            double sum = 0;
            for (int i = lag; i < n; i++) sum += x[i] * x[i - lag];
            match[lag] = sum / (n - lag);
        }
        if (match[0] <= 0) { Weak(); return; }

        // A beat that also lines up two beats on is more likely the real one than its double or half.
        int best = 0;
        double bestScore = double.MinValue;
        for (int lag = shortest; lag <= longest; lag++)
        {
            double bpm = 60 * frameRate / lag;
            double octaves = Math.Log(bpm / LikelyBpm, 2) / OctaveSpread;
            double score = (match[lag] + 0.5 * match[2 * lag]) * Math.Exp(-0.5 * octaves * octaves);
            if (score > bestScore)
            {
                bestScore = score;
                best = lag;
            }
        }
        double strength = match[best] / match[0];
        if (strength < MinStrength) { Weak(); return; }
        weakGuesses = 0;

        // Between whole frames, from the curve through the peak and its neighbours.
        double before = match[best - 1], peak = match[best], after = match[best + 1];
        double bend = before - 2 * peak + after;
        double guess = best + (bend < 0 ? 0.5 * (before - after) / bend : 0);

        if (period <= 0)
        {
            // Two guesses that agree before it trusts a tempo.
            if (candidate > 0 && Math.Abs(guess - candidate) / candidate < SameTempo) period = guess;
            candidate = guess;
            if (period <= 0) return;
        }
        else if (Math.Abs(guess - period) / period < SameTempo)
        {
            period += 0.2 * (guess - period);
            changeVotes = 0;
        }
        else if (Math.Abs(guess - 2 * period) / period < 2 * SameTempo || Math.Abs(guess - period / 2) / period < SameTempo / 2)
        {
            // The same beat, an octave off: keep the one it has.
        }
        else
        {
            if (changeVotes > 0 && Math.Abs(guess - candidate) / candidate < SameTempo) changeVotes++;
            else changeVotes = 1;
            candidate = guess;
            if (changeVotes >= ChangeAfter)
            {
                period = guess;
                changeVotes = 0;
            }
        }
        FindBeats(x);
    }

    /** Where the beats fall: the offset back from now whose every beat, over the last few seconds, lands on the most rhythm. */
    void FindBeats(double[] x)
    {
        int n = x.Length;
        int span = (int)Math.Min(n, frameRate * PhaseSeconds);
        int steps = (int)Math.Ceiling(period);
        var score = new double[steps];
        for (int offset = 0; offset < steps; offset++)
        {
            double sum = 0;
            double weight = 1;
            for (double back = offset; back < span; back += period)
            {
                int i = n - 1 - (int)Math.Round(back);
                if (x[i] > 0) sum += weight * x[i];
                weight *= 0.85;
            }
            score[offset] = sum;
        }
        int best = 0;
        for (int offset = 1; offset < steps; offset++) if (score[offset] > score[best]) best = offset;
        double before = score[(best + steps - 1) % steps], peak = score[best], after = score[(best + 1) % steps];
        double bend = before - 2 * peak + after;
        double shift = bend < 0 ? 0.5 * (before - after) / bend : 0;
        beatFrame = frames - 1 - (best + shift);
    }

    /**
     * Blurred over a few hops. A beat rarely lasts a whole number of hops, so sharp spikes would only
     * line up with themselves at tempos that happen to, and those would win.
     */
    static double[] Smooth(double[] x)
    {
        double[] kernel = { 1, 2, 3, 2, 1 };
        var smooth = new double[x.Length];
        for (int i = 0; i < x.Length; i++)
        {
            double sum = 0, weight = 0;
            for (int k = 0; k < kernel.Length; k++)
            {
                int j = i + k - kernel.Length / 2;
                if (j < 0 || j >= x.Length) continue;
                sum += kernel[k] * x[j];
                weight += kernel[k];
            }
            smooth[i] = sum / weight;
        }
        return smooth;
    }

    void Weak()
    {
        if (++weakGuesses < LoseAfter) return;
        period = 0;
        candidate = 0;
        changeVotes = 0;
    }

    /** In place, for a power-of-two length. */
    static void Fft(double[] re, double[] im)
    {
        int n = re.Length;
        for (int i = 1, j = 0; i < n; i++)
        {
            int bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j)
            {
                double t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }
        for (int length = 2; length <= n; length <<= 1)
        {
            double angle = -2 * Math.PI / length;
            double stepRe = Math.Cos(angle), stepIm = Math.Sin(angle);
            for (int start = 0; start < n; start += length)
            {
                double wRe = 1, wIm = 0;
                for (int k = 0; k < length / 2; k++)
                {
                    int a = start + k, b = a + length / 2;
                    double tRe = re[b] * wRe - im[b] * wIm;
                    double tIm = re[b] * wIm + im[b] * wRe;
                    re[b] = re[a] - tRe; im[b] = im[a] - tIm;
                    re[a] += tRe; im[a] += tIm;
                    double next = wRe * stepRe - wIm * stepIm;
                    wIm = wRe * stepIm + wIm * stepRe;
                    wRe = next;
                }
            }
        }
    }
}
