# NDI relay: finds NDI sources on the network and streams the picture to the overlays as MJPEG.
# Needs the NDI runtime on this PC (installed with vMix / NDI Tools). Run via start-ndi-relay.bat
#   http://localhost:8089/sources            -> list of NDI source names (JSON)
#   http://localhost:8089/stream?name=...&w=1280&fps=25   -> live picture (multipart JPEG)
#   http://localhost:8089/snap?name=...&w=640              -> one JPEG frame
param([int]$Port = 8089)
$ErrorActionPreference = 'Stop'

$src = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class Ndi
{
    const string DLL = "Processing.NDI.Lib.x64.dll";

    [StructLayout(LayoutKind.Sequential)] public struct Source { public IntPtr name; public IntPtr url; }
    [StructLayout(LayoutKind.Sequential)] public struct FindCreate { [MarshalAs(UnmanagedType.U1)] public bool showLocal; public IntPtr groups; public IntPtr extraIps; }
    [StructLayout(LayoutKind.Sequential)] public struct RecvCreate { public Source src; public int colorFormat; public int bandwidth; [MarshalAs(UnmanagedType.U1)] public bool allowFields; public IntPtr recvName; }
    [StructLayout(LayoutKind.Sequential)] public struct VideoFrame { public int xres; public int yres; public int fourCC; public int frN; public int frD; public float aspect; public int fmt; public long timecode; public IntPtr data; public int stride; public IntPtr meta; public long timestamp; }

    [DllImport(DLL)] [return: MarshalAs(UnmanagedType.U1)] public static extern bool NDIlib_initialize();
    [DllImport(DLL)] public static extern IntPtr NDIlib_find_create_v2(ref FindCreate c);
    [DllImport(DLL)] [return: MarshalAs(UnmanagedType.U1)] public static extern bool NDIlib_find_wait_for_sources(IntPtr f, uint ms);
    [DllImport(DLL)] public static extern IntPtr NDIlib_find_get_current_sources(IntPtr f, ref uint n);
    [DllImport(DLL)] public static extern IntPtr NDIlib_recv_create_v3(ref RecvCreate c);
    [DllImport(DLL)] public static extern void NDIlib_recv_destroy(IntPtr r);
    [DllImport(DLL)] public static extern int NDIlib_recv_capture_v2(IntPtr r, ref VideoFrame v, IntPtr a, IntPtr m, uint ms);
    [DllImport(DLL)] public static extern void NDIlib_recv_free_video_v2(IntPtr r, ref VideoFrame v);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern IntPtr LoadLibrary(string path);
}

class Feed
{
    public string name;
    public IntPtr recv;
    public byte[] jpg;
    public long seq;
    public volatile bool stop;
    public DateTime lastUse = DateTime.UtcNow;
    public int width = 640, quality = 75, fps = 25;
    public object lk = new object();
}

public static class NdiRelay
{
    static HttpListener listener;
    static IntPtr finder = IntPtr.Zero;
    static bool ndiOk = false;
    public static string Status = "starting";
    public static bool Lan = false;
    static readonly Dictionary<string, Feed> feeds = new Dictionary<string, Feed>();
    static readonly object feedLock = new object();

    static IntPtr Utf8(string s)
    {
        byte[] b = Encoding.UTF8.GetBytes(s + "\0");
        IntPtr p = Marshal.AllocHGlobal(b.Length);
        Marshal.Copy(b, 0, p, b.Length);
        return p;
    }
    static string FromUtf8(IntPtr p)
    {
        if (p == IntPtr.Zero) return "";
        int n = 0;
        while (Marshal.ReadByte(p, n) != 0) n++;
        byte[] b = new byte[n];
        Marshal.Copy(p, b, 0, n);
        return Encoding.UTF8.GetString(b);
    }
    static string Esc(string s)
    {
        return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    static bool LoadNdi()
    {
        var dirs = new List<string>();
        string env = Environment.GetEnvironmentVariable("NDILIB_REDIST_FOLDER");
        if (!string.IsNullOrEmpty(env)) dirs.Add(env);
        string[] roots = new string[] {
            @"C:\Program Files\NDI", @"C:\Program Files (x86)\NDI", @"C:\Program Files\vMix", @"C:\Program Files (x86)\vMix", @"C:\Program Files\NewTek", @"C:\Program Files (x86)\NewTek" };
        foreach (string r in roots) dirs.Add(r);
        foreach (string d in dirs)
        {
            try
            {
                if (!Directory.Exists(d)) continue;
                string[] hits = Directory.GetFiles(d, "Processing.NDI.Lib.x64.dll", SearchOption.AllDirectories);
                if (hits.Length == 0) continue;
                if (Ndi.LoadLibrary(hits[0]) == IntPtr.Zero) continue;
                Status = "NDI runtime: " + hits[0];
                return true;
            }
            catch { }
        }
        try { if (Ndi.NDIlib_initialize()) { Status = "NDI runtime found on PATH"; return true; } } catch { }
        Status = "NDI runtime NOT found. Install NDI Tools (ndi.video) or vMix, then restart.";
        return false;
    }

    public static void Start(int port)
    {
        try
        {
            if (LoadNdi() && Ndi.NDIlib_initialize())
            {
                var fc = new Ndi.FindCreate();
                fc.showLocal = true;
                finder = Ndi.NDIlib_find_create_v2(ref fc);
                ndiOk = finder != IntPtr.Zero;
                if (!ndiOk) Status = "NDI finder could not start";
            }
        }
        catch (Exception e) { ndiOk = false; Status = "NDI error: " + e.Message; }

        // 4 consecutive ports: a browser allows only 6 open connections per address:port, and every
        // live camera picture keeps one open. The overlays spread the cams over these ports.
        try
        {
            listener = new HttpListener();
            for (int k = 0; k < 4; k++) listener.Prefixes.Add("http://+:" + (port + k) + "/");
            listener.Start();
            Lan = true;
        }
        catch
        {
            listener = new HttpListener();
            for (int k = 0; k < 4; k++)
            {
                listener.Prefixes.Add("http://localhost:" + (port + k) + "/");
                listener.Prefixes.Add("http://127.0.0.1:" + (port + k) + "/");
            }
            listener.Start();
            Lan = false;
        }
        listener.BeginGetContext(OnCtx, null);
        var sweeper = new Thread(Sweep);
        sweeper.IsBackground = true;
        sweeper.Start();
    }

    static void Sweep()
    {
        while (true)
        {
            Thread.Sleep(3000);
            lock (feedLock)
            {
                var dead = new List<string>();
                foreach (var kv in feeds)
                    if ((DateTime.UtcNow - kv.Value.lastUse).TotalSeconds > 10) { kv.Value.stop = true; dead.Add(kv.Key); }
                foreach (string k in dead) feeds.Remove(k);
            }
        }
    }

    static void OnCtx(IAsyncResult ar)
    {
        HttpListenerContext c;
        try { c = listener.EndGetContext(ar); } catch { return; }
        try { listener.BeginGetContext(OnCtx, null); } catch { }
        // every request gets its own thread: live streams stay open for a long time and must not starve /sources
        var th = new Thread(delegate () { try { Handle(c); } catch { try { c.Response.Abort(); } catch { } } });
        th.IsBackground = true;
        th.Start();
    }

    static List<string> Sources()
    {
        var list = new List<string>();
        if (!ndiOk) return list;
        try
        {
            uint n = 0;
            IntPtr arr = Ndi.NDIlib_find_get_current_sources(finder, ref n);
            int sz = Marshal.SizeOf(typeof(Ndi.Source));
            for (int i = 0; i < n; i++)
            {
                var s = (Ndi.Source)Marshal.PtrToStructure(new IntPtr(arr.ToInt64() + (long)i * sz), typeof(Ndi.Source));
                list.Add(FromUtf8(s.name));
            }
        }
        catch { }
        return list;
    }

    static Feed GetFeed(string name, int width, int fps)
    {
        lock (feedLock)
        {
            Feed f;
            if (feeds.TryGetValue(name, out f)) { f.lastUse = DateTime.UtcNow; if (width > f.width) f.width = width; return f; }
            var rc = new Ndi.RecvCreate();
            rc.src.name = Utf8(name);
            rc.src.url = IntPtr.Zero;
            rc.colorFormat = 0;   // BGRX_BGRA
            rc.bandwidth = 100;   // highest
            rc.allowFields = false;
            rc.recvName = Utf8("Overlay relay");
            IntPtr recv = Ndi.NDIlib_recv_create_v3(ref rc);
            if (recv == IntPtr.Zero) return null;
            f = new Feed();
            f.name = name; f.recv = recv; f.width = width; f.fps = fps;
            feeds[name] = f;
            var th = new Thread(delegate () { Run(f); });
            th.IsBackground = true;
            th.Start();
            return f;
        }
    }

    static ImageCodecInfo jpegCodec;
    static ImageCodecInfo Codec()
    {
        if (jpegCodec == null)
            foreach (ImageCodecInfo ci in ImageCodecInfo.GetImageEncoders())
                if (ci.MimeType == "image/jpeg") jpegCodec = ci;
        return jpegCodec;
    }

    static void Run(Feed f)
    {
        var vf = new Ndi.VideoFrame();
        DateTime last = DateTime.MinValue;
        while (!f.stop)
        {
            int t = Ndi.NDIlib_recv_capture_v2(f.recv, ref vf, IntPtr.Zero, IntPtr.Zero, 400);
            if (t != 1) continue;
            try
            {
                if ((DateTime.UtcNow - last).TotalMilliseconds >= 1000.0 / Math.Max(1, f.fps))
                {
                    last = DateTime.UtcNow;
                    Encode(f, vf);
                }
            }
            catch { }
            finally { Ndi.NDIlib_recv_free_video_v2(f.recv, ref vf); }
        }
        Ndi.NDIlib_recv_destroy(f.recv);
    }

    static void Encode(Feed f, Ndi.VideoFrame vf)
    {
        if (vf.xres <= 0 || vf.yres <= 0 || vf.data == IntPtr.Zero) return;
        PixelFormat pf = vf.fourCC == 0x41524742 ? PixelFormat.Format32bppArgb : PixelFormat.Format32bppRgb;   // 'BGRA' : 'BGRX'
        int w = Math.Min(f.width, vf.xres);
        int h = (int)((long)vf.yres * w / vf.xres);
        using (var src = new Bitmap(vf.xres, vf.yres, vf.stride, pf, vf.data))
        using (var dst = new Bitmap(w, h, PixelFormat.Format24bppRgb))
        {
            using (var g = Graphics.FromImage(dst))
            {
                g.InterpolationMode = InterpolationMode.Bilinear;
                g.CompositingQuality = CompositingQuality.HighSpeed;
                g.DrawImage(src, 0, 0, w, h);
            }
            using (var ms = new MemoryStream())
            {
                var ep = new EncoderParameters(1);
                ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)f.quality);
                dst.Save(ms, Codec(), ep);
                lock (f.lk) { f.jpg = ms.ToArray(); f.seq++; Monitor.PulseAll(f.lk); }
            }
        }
    }

    static int IntQ(System.Collections.Specialized.NameValueCollection q, string k, int def)
    {
        int v;
        return int.TryParse(q[k], out v) ? v : def;
    }

    static void Text(HttpListenerContext c, int code, string body, string type)
    {
        byte[] b = Encoding.UTF8.GetBytes(body);
        var r = c.Response;
        r.StatusCode = code;
        r.ContentType = type + "; charset=utf-8";
        r.ContentLength64 = b.Length;
        r.AddHeader("Access-Control-Allow-Origin", "*");
        r.AddHeader("Cache-Control", "no-store");
        r.OutputStream.Write(b, 0, b.Length);
        r.OutputStream.Close();
    }

    static void Handle(HttpListenerContext c)
    {
        string p = c.Request.Url.AbsolutePath;
        var q = c.Request.QueryString;
        if (p == "/sources")
        {
            var sb = new StringBuilder("{\"ok\":" + (ndiOk ? "true" : "false") + ",\"status\":\"" + Esc(Status) + "\",\"sources\":[");
            bool first = true;
            foreach (string s in Sources()) { if (!first) sb.Append(','); sb.Append("\"" + Esc(s) + "\""); first = false; }
            sb.Append("]}");
            Text(c, 200, sb.ToString(), "application/json");
            return;
        }
        if (p == "/stream" || p == "/snap")
        {
            string name = q["name"];
            if (!ndiOk || string.IsNullOrEmpty(name)) { Text(c, 404, "no source", "text/plain"); return; }
            Feed f = GetFeed(name, IntQ(q, "w", 640), IntQ(q, "fps", 25));
            if (f == null) { Text(c, 500, "could not open source", "text/plain"); return; }
            var r = c.Response;
            r.AddHeader("Access-Control-Allow-Origin", "*");
            r.AddHeader("Cache-Control", "no-store");
            if (p == "/snap")
            {
                byte[] one = null;
                for (int i = 0; i < 100 && one == null; i++) { lock (f.lk) { one = f.jpg; } if (one == null) Thread.Sleep(100); }
                if (one == null) { Text(c, 504, "no frame yet", "text/plain"); return; }
                r.ContentType = "image/jpeg"; r.ContentLength64 = one.Length;
                r.OutputStream.Write(one, 0, one.Length); r.OutputStream.Close();
                return;
            }
            r.ContentType = "multipart/x-mixed-replace; boundary=frame";
            r.SendChunked = true;
            var os = r.OutputStream;
            long seen = 0;
            byte[] tail = Encoding.ASCII.GetBytes("\r\n");
            try
            {
                while (!f.stop)
                {
                    byte[] jpg = null;
                    lock (f.lk)
                    {
                        while (f.seq == seen && !f.stop) { Monitor.Wait(f.lk, 1000); f.lastUse = DateTime.UtcNow; }
                        if (f.stop) break;
                        jpg = f.jpg; seen = f.seq;
                    }
                    f.lastUse = DateTime.UtcNow;
                    byte[] head = Encoding.ASCII.GetBytes("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + jpg.Length + "\r\n\r\n");
                    os.Write(head, 0, head.Length);
                    os.Write(jpg, 0, jpg.Length);
                    os.Write(tail, 0, tail.Length);
                    os.Flush();
                }
            }
            catch { }
            try { r.Close(); } catch { }
            return;
        }
        Text(c, 200, "NDI relay running. " + Status, "text/plain");
    }
}
'@

Add-Type -TypeDefinition $src -Language CSharp -ReferencedAssemblies System.Drawing
[NdiRelay]::Start($Port)

Write-Host ''
Write-Host '  NDI RELAY running' -ForegroundColor Green
Write-Host "  $([NdiRelay]::Status)"
if ([NdiRelay]::Lan) { Write-Host '  Network access: ON' } else { Write-Host '  Network access: this PC only' }
Write-Host "  Sources list : http://localhost:$Port/sources"
Write-Host ''
Write-Host '  Keep this window open while streaming.' -ForegroundColor Yellow
while ($true) { Start-Sleep -Seconds 3600 }
