// The helper DesktopBuddy runs in the background on Windows, so the buddy can react to what you're up
// to. Once a second it works out three things and, whenever they change, prints one line of JSON:
//
//   playing     "music", "video" or null: whether anything is playing, from Windows' own media info
//               (the same thing the volume pop-up shows)
//   video       the screen box [left, top, right, bottom] of the window the video is in, so the buddy
//               can turn to watch it
//   fullscreen  the box of the screen a full-screen app or game is covering, so the buddy can step aside
//
// It never reads what you're listening to or watching, and never touches the audio. Browsers call
// everything music, so to tell a video from a song it checks whether a browser window's title is a
// video site's, like YouTube. Nothing is kept or sent anywhere: it only talks to DesktopBuddy.
//
// scripts/build-helper.mjs builds it with the C# compiler that comes with Windows, so nobody has to
// install anything. Run as: DesktopBuddyHelper.exe <DesktopBuddy's process id>

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Windows.Foundation;
using Windows.Media;
using Windows.Media.Control;

[assembly: System.Reflection.AssemblyTitle("DesktopBuddy helper")]
[assembly: System.Reflection.AssemblyDescription("Lets DesktopBuddy react to music, videos and full-screen apps")]
[assembly: System.Reflection.AssemblyProduct("DesktopBuddy")]

static class Helper
{
    const int PollMs = 1000;
    // Playback has to stay stopped this long to count, so the gap between two songs doesn't.
    const int StopGraceMs = 3000;

    // Apps that only play music, matched against Windows' name for the app that's playing.
    static readonly string[] MusicApps = {
        "spotify", "applemusic", "itunes", "tidal", "deezer", "amazonmusic", "amazon music", "foobar2000",
        "musicbee", "aimp", "winamp", "soundcloud", "pandora", "youtube music", "youtubemusic",
    };

    // Apps that play videos, matched the same way. Media Player plays both, but says which.
    static readonly string[] VideoApps = {
        "zunevideo", "vlc", "potplayer", "mpc-hc", "mpc-be", "mpv", "kodi", "plex", "stremio", "netflix",
        "disney", "primevideo", "amazonvideo", "hulu", "jellyfin",
    };

    // How those video apps' windows can be found: by process name, or by title for store apps.
    static readonly string[] VideoProcesses = {
        "vlc", "potplayermini64", "potplayermini", "potplayer64", "mpc-hc64", "mpc-hc", "mpc-be64", "mpc-be",
        "mpv", "kodi", "plex", "plex htpc", "stremio", "jellyfin media player",
    };
    static readonly string[] VideoAppTitles = { "netflix", "films & tv", "movies & tv", "media player", "disney+", "prime video" };

    static readonly HashSet<string> Browsers = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "chrome", "msedge", "firefox", "brave", "opera", "opera_gx", "vivaldi", "arc", "zen", "librewolf",
        "waterfox", "floorp", "thorium", "chromium", "yandex", "whale",
    };

    // A video site's name as its own part of a window title ("Some video - YouTube - Google Chrome"),
    // so "YouTube Music", or a page that just mentions Netflix, doesn't count. Edge adds "and 2 more pages".
    static readonly Regex VideoSite = new Regex(
        @"(?:^|[-|•·:—–]\s*)(?:youtube|netflix|twitch|prime video|disney\+|stan|binge|kayo(?: sports)?|abc iview|iview|" +
        @"sbs on demand|9now|7plus|10 ?play|paramount\+|crunchyroll|vimeo|hulu|max|apple tv\+?|plex|jellyfin|" +
        @"dailymotion|bbc iplayer|tubi|pluto tv|bilibili|kick|rumble|nebula|peacock|foxtel go|optus sport)" +
        @"(?=\s*(?:[-|•·:—–]|$|and \d+ more))",
        RegexOptions.IgnoreCase);

    // The desktop, taskbar, Start, search and task switchers can cover a whole screen, but they're not apps.
    static readonly HashSet<string> ShellClasses = new HashSet<string>(StringComparer.Ordinal) {
        "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Windows.UI.Core.CoreWindow",
        "XamlExplorerHostIslandWindow", "MultitaskingViewFrame", "ForegroundStaging", "LockScreenBackstopFrame",
    };

    static int appPid;
    static GlobalSystemMediaTransportControlsSessionManager media;
    static readonly Dictionary<uint, string> processNames = new Dictionary<uint, string>();

    static void Main(string[] args)
    {
        // Real pixels on every screen, whatever its scaling, so boxes line up with what DesktopBuddy sees.
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
        if (args.Length > 0) int.TryParse(args[0], out appPid);

        // When DesktopBuddy closes, its end of our input closes too, and the helper goes with it.
        var watchInput = new Thread(() => {
            try { while (Console.In.Read() != -1) { } } catch (IOException) { }
            Environment.Exit(0);
        });
        watchInput.IsBackground = true;
        watchInput.Start();

        // Not on Windows versions from before the media info existed (1809); full screen still works there.
        try { media = Await(GlobalSystemMediaTransportControlsSessionManager.RequestAsync()); } catch (Exception) { }

        string lastLine = null;
        string lastKind = null;
        int[] lastVideo = null;
        DateTime lastPlaying = DateTime.MinValue;
        while (true)
        {
            if (appPid != 0 && !IsRunning(appPid)) return;
            processNames.Clear();

            int[] video;
            string kind = Playing(out video);
            if (kind != null)
            {
                lastKind = kind;
                lastVideo = video;
                lastPlaying = DateTime.UtcNow;
            }
            else if ((DateTime.UtcNow - lastPlaying).TotalMilliseconds < StopGraceMs)
            {
                kind = lastKind;
                video = lastVideo;
            }

            string line = "{\"playing\":" + (kind == null ? "null" : "\"" + kind + "\"") +
                ",\"video\":" + Json(kind == "video" ? video : null) +
                ",\"fullscreen\":" + Json(FullScreen()) + "}";
            if (line != lastLine)
            {
                Console.Out.WriteLine(line);
                Console.Out.Flush();
                lastLine = line;
            }
            Thread.Sleep(PollMs);
        }
    }

    /** "video" if a video is playing (with its window's box, when it can be found), else "music" if anything is, else null. */
    static string Playing(out int[] video)
    {
        video = null;
        if (media == null) return null;
        bool music = false;
        IReadOnlyList<GlobalSystemMediaTransportControlsSession> sessions;
        try { sessions = media.GetSessions(); } catch (Exception) { return null; }
        foreach (var session in sessions)
        {
            try
            {
                var info = session.GetPlaybackInfo();
                if (info.PlaybackStatus != GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) continue;
                string app = session.SourceAppUserModelId.ToLowerInvariant();
                if (info.PlaybackType == MediaPlaybackType.Video || ContainsAny(app, VideoApps))
                {
                    video = FindWindow(false);
                    return "video";
                }
                if (ContainsAny(app, MusicApps)) { music = true; continue; }
                // A browser, or something unknown: a video if a browser is showing a video site.
                int[] site = FindWindow(true);
                if (site != null)
                {
                    video = site;
                    return "video";
                }
                music = true;
            }
            catch (Exception)
            {
                // The session ended while it was being read; the next look will see.
            }
        }
        return music ? "music" : null;
    }

    /**
     * The topmost visible window that's on a video site (in a browser), or that belongs to a video app.
     * Only browser and store-app windows have their titles read.
     */
    static int[] FindWindow(bool browserSite)
    {
        int[] found = null;
        EnumWindows((hwnd, _) => {
            if (!IsWindowVisible(hwnd) || IsIconic(hwnd) || IsCloaked(hwnd)) return true;
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            if (pid == appPid) return true;
            string process = ProcessName(pid);
            bool match;
            if (browserSite) match = Browsers.Contains(process) && VideoSite.IsMatch(Title(hwnd));
            else if (process == "applicationframehost") match = ContainsAny(Title(hwnd).ToLowerInvariant(), VideoAppTitles);
            else match = Array.IndexOf(VideoProcesses, process) >= 0;
            if (match) found = Bounds(hwnd);
            return found == null;
        }, IntPtr.Zero);
        return found;
    }

    /** The box of the screen the front window covers completely, if it's an app (not a maximised window). */
    static int[] FullScreen()
    {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero || IsZoomed(hwnd)) return null;
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        if (pid == appPid) return null;
        var name = new StringBuilder(256);
        GetClassName(hwnd, name, name.Capacity);
        if (ShellClasses.Contains(name.ToString())) return null;

        int[] box = Bounds(hwnd);
        var monitor = new MONITORINFO();
        monitor.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (!GetMonitorInfo(MonitorFromWindow(hwnd, 2), ref monitor)) return null;
        RECT screen = monitor.rcMonitor;
        bool covers = box[0] <= screen.Left && box[1] <= screen.Top && box[2] >= screen.Right && box[3] >= screen.Bottom;
        return covers ? new[] { screen.Left, screen.Top, screen.Right, screen.Bottom } : null;
    }

    static T Await<T>(IAsyncOperation<T> operation)
    {
        var done = new ManualResetEvent(false);
        operation.Completed = (op, status) => done.Set();
        done.WaitOne();
        return operation.GetResults();
    }

    static bool IsRunning(int pid)
    {
        try { return !Process.GetProcessById(pid).HasExited; } catch (ArgumentException) { return false; }
    }

    static bool ContainsAny(string text, string[] words)
    {
        foreach (var word in words) if (text.Contains(word)) return true;
        return false;
    }

    static string Json(int[] box)
    {
        return box == null ? "null" : "[" + box[0] + "," + box[1] + "," + box[2] + "," + box[3] + "]";
    }

    static string ProcessName(uint pid)
    {
        string name;
        if (processNames.TryGetValue(pid, out name)) return name;
        name = "";
        IntPtr process = OpenProcess(0x1000, false, pid);
        if (process != IntPtr.Zero)
        {
            var path = new StringBuilder(1024);
            int size = path.Capacity;
            if (QueryFullProcessImageName(process, 0, path, ref size)) name = Path.GetFileNameWithoutExtension(path.ToString()).ToLowerInvariant();
            CloseHandle(process);
        }
        processNames[pid] = name;
        return name;
    }

    static string Title(IntPtr hwnd)
    {
        var title = new StringBuilder(512);
        GetWindowText(hwnd, title, title.Capacity);
        return title.ToString();
    }

    // Windows on another virtual desktop, and suspended store apps, are "cloaked": there but not shown.
    static bool IsCloaked(IntPtr hwnd)
    {
        int cloaked;
        return DwmGetWindowAttribute(hwnd, 14, out cloaked, 4) == 0 && cloaked != 0;
    }

    // The box as you see it, without the invisible resize border Windows 10 and 11 add around windows.
    static int[] Bounds(IntPtr hwnd)
    {
        RECT r;
        if (DwmGetWindowAttribute(hwnd, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) GetWindowRect(hwnd, out r);
        return new[] { r.Left, r.Top, r.Right, r.Bottom };
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }

    delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out RECT value, int size);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder path, ref int size);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
}
