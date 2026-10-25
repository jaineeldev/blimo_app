// Hears what the PC is playing, for "bop to the beat", through Windows' own loopback recording (the
// mixed sound on its way to the speakers or headphones, never the microphone). The sound goes straight
// into the beat tracker, a hundredth of a second at a time, and is never kept or saved.

using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

static class Loopback
{
    const int Shared = 0;
    const int LoopbackFlag = 0x00020000;
    const int SilentFlag = 0x2;
    const int RenderFlow = 0;
    const int MultimediaRole = 1;
    const int AllContexts = 0x17;
    // Windows' buffer, in 100-nanosecond units: plenty, as it's read every 10 ms.
    const long BufferLength = 10000000;
    const int ReadEveryMs = 10;
    // The default output is checked this often, so switching to headphones moves the listening with you.
    const int CheckOutputMs = 3000;

    static readonly Guid AudioClientId = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
    static readonly Guid CaptureClientId = new Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317");
    static readonly Guid FloatFormat = new Guid("00000003-0000-0010-8000-00aa00389b71");
    static readonly Guid PcmFormat = new Guid("00000001-0000-0010-8000-00aa00389b71");

    /**
     * Listens to the default output and feeds the tracker until `keepGoing` says stop or the output
     * changes. The tracker is made once the sound's sample rate is known. Throws if the output can't be
     * heard, or goes away.
     */
    public static void Listen(Func<bool> keepGoing, Action<BeatTracker> started)
    {
        var devices = (IMMDeviceEnumerator)new MMDeviceEnumerator();
        IMMDevice device;
        devices.GetDefaultAudioEndpoint(RenderFlow, MultimediaRole, out device);
        string deviceId;
        device.GetId(out deviceId);
        object activated;
        device.Activate(AudioClientId, AllContexts, IntPtr.Zero, out activated);
        var client = (IAudioClient)activated;

        IntPtr format;
        client.GetMixFormat(out format);
        int channels, rate;
        bool isFloat;
        try
        {
            ushort tag = (ushort)Marshal.ReadInt16(format, 0);
            channels = Marshal.ReadInt16(format, 2);
            rate = Marshal.ReadInt32(format, 4);
            int bits = Marshal.ReadInt16(format, 14);
            Guid kind = tag == 0xFFFE ? (Guid)Marshal.PtrToStructure(new IntPtr(format.ToInt64() + 24), typeof(Guid)) : Guid.Empty;
            isFloat = (tag == 3 || kind == FloatFormat) && bits == 32;
            bool isPcm16 = (tag == 1 || kind == PcmFormat) && bits == 16;
            if (!isFloat && !isPcm16) throw new NotSupportedException("Unusual sound format");
            client.Initialize(Shared, LoopbackFlag, BufferLength, 0, format, IntPtr.Zero);
        }
        finally
        {
            Marshal.FreeCoTaskMem(format);
        }

        object service;
        client.GetService(CaptureClientId, out service);
        var capture = (IAudioCaptureClient)service;
        var tracker = new BeatTracker(rate);
        started(tracker);

        var floats = new float[0];
        var shorts = new short[0];
        var mono = new float[0];
        var checkedAt = Stopwatch.StartNew();
        client.Start();
        try
        {
            while (keepGoing())
            {
                Thread.Sleep(ReadEveryMs);
                if (checkedAt.ElapsedMilliseconds > CheckOutputMs)
                {
                    checkedAt.Restart();
                    IMMDevice now;
                    devices.GetDefaultAudioEndpoint(RenderFlow, MultimediaRole, out now);
                    string nowId;
                    now.GetId(out nowId);
                    if (nowId != deviceId) return;
                }
                int waiting;
                capture.GetNextPacketSize(out waiting);
                while (waiting > 0)
                {
                    IntPtr data;
                    int count, flags;
                    long position, playedAt;
                    capture.GetBuffer(out data, out count, out flags, out position, out playedAt);
                    if (mono.Length < count) mono = new float[count];
                    int values = count * channels;
                    if ((flags & SilentFlag) != 0) Array.Clear(mono, 0, count);
                    else if (isFloat)
                    {
                        if (floats.Length < values) floats = new float[values];
                        Marshal.Copy(data, floats, 0, values);
                        for (int i = 0; i < count; i++)
                        {
                            float sum = 0;
                            for (int c = 0; c < channels; c++) sum += floats[i * channels + c];
                            mono[i] = sum / channels;
                        }
                    }
                    else
                    {
                        if (shorts.Length < values) shorts = new short[values];
                        Marshal.Copy(data, shorts, 0, values);
                        for (int i = 0; i < count; i++)
                        {
                            float sum = 0;
                            for (int c = 0; c < channels; c++) sum += shorts[i * channels + c];
                            mono[i] = sum / channels / 32768f;
                        }
                    }
                    capture.ReleaseBuffer(count);
                    tracker.Feed(mono, count, PlayedAtMs(playedAt, count, rate));
                    capture.GetNextPacketSize(out waiting);
                }
            }
        }
        finally
        {
            client.Stop();
            Marshal.ReleaseComObject(capture);
            Marshal.ReleaseComObject(client);
            Marshal.ReleaseComObject(device);
            Marshal.ReleaseComObject(devices);
        }
    }

    /**
     * When a packet's last sample played, on the wall clock. Windows stamps when its first sample did, on
     * the high-resolution clock (100-nanosecond units); without a stamp, it's about now.
     */
    static double PlayedAtMs(long playedAt, int count, int rate)
    {
        double nowMs = (DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
        if (playedAt <= 0) return nowMs;
        double clockMs = Stopwatch.GetTimestamp() * 1000.0 / Stopwatch.Frequency;
        return nowMs - (clockMs - playedAt / 10000.0) + count * 1000.0 / rate;
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        void EnumAudioEndpoints(int flow, int states, out IntPtr devices);
        void GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        void Activate([MarshalAs(UnmanagedType.LPStruct)] Guid id, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object activated);
        void OpenPropertyStore(int access, out IntPtr properties);
        void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        void Initialize(int shareMode, int flags, long bufferLength, long period, IntPtr format, IntPtr session);
        void GetBufferSize(out int frames);
        void GetStreamLatency(out long latency);
        void GetCurrentPadding(out int frames);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
        void GetMixFormat(out IntPtr format);
        void GetDevicePeriod(out long usual, out long shortest);
        void Start();
        void Stop();
        void Reset();
        void SetEventHandle(IntPtr handle);
        void GetService([MarshalAs(UnmanagedType.LPStruct)] Guid id, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        void GetBuffer(out IntPtr data, out int frames, out int flags, out long position, out long playedAt);
        void ReleaseBuffer(int frames);
        void GetNextPacketSize(out int frames);
    }
}
