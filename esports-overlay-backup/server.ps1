# Tournament Overlays - local sync server (Windows PowerShell, nothing to install).
# Keeps the control panel and every vMix browser input in sync.  Run via start-server.bat
param([int]$Port = 8080)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$src = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;

public class OverlayServer
{
    static HttpListener listener;
    static string root;
    static string stateJson = "null";
    static long rev = 1;
    static long seq = 0;
    public static bool Lan = false;
    public static string Pin = "";

    static bool IsLocal(HttpListenerContext c)
    {
        try { return IPAddress.IsLoopback(c.Request.RemoteEndPoint.Address); } catch { return false; }
    }
    static bool PinOk(HttpListenerContext c)
    {
        string given = c.Request.QueryString["pin"];
        if (given == null)
        {
            Cookie ck = c.Request.Cookies["tovpin"];
            if (ck != null) given = Uri.UnescapeDataString(ck.Value);
        }
        return given != null && given == Pin;
    }
    static readonly object lk = new object();
    static List<KeyValuePair<long, string>> cmds = new List<KeyValuePair<long, string>>();

    public static void Start(string rootDir, int port)
    {
        root = Path.GetFullPath(rootDir);
        try
        {
            string f = Path.Combine(root, "data", "state.json");
            if (File.Exists(f)) stateJson = File.ReadAllText(f, Encoding.UTF8);
        }
        catch { }
        try
        {
            string pf = Path.Combine(root, "data", "pin.txt");
            if (File.Exists(pf)) Pin = File.ReadAllText(pf).Trim();
        }
        catch { }
        // try to listen on the network (needs allow-network.bat once); fall back to this PC only
        try
        {
            listener = new HttpListener();
            listener.Prefixes.Add("http://+:" + port + "/");
            listener.Start();
            Lan = true;
        }
        catch
        {
            listener = new HttpListener();
            listener.Prefixes.Add("http://localhost:" + port + "/");
            listener.Prefixes.Add("http://127.0.0.1:" + port + "/");
            listener.Start();
            Lan = false;
        }
        listener.BeginGetContext(OnCtx, null);
    }

    static void OnCtx(IAsyncResult ar)
    {
        HttpListenerContext c;
        try { c = listener.EndGetContext(ar); } catch { return; }
        try { listener.BeginGetContext(OnCtx, null); } catch { }
        try { Handle(c); }
        catch { try { c.Response.StatusCode = 500; c.Response.Close(); } catch { } }
    }

    static void Send(HttpListenerContext c, int code, byte[] body, string type)
    {
        var r = c.Response;
        r.StatusCode = code;
        r.ContentType = type;
        r.ContentLength64 = body.Length;
        r.AddHeader("Access-Control-Allow-Origin", "*");
        r.AddHeader("Cache-Control", "no-store");
        r.OutputStream.Write(body, 0, body.Length);
        r.OutputStream.Close();
    }

    static void SendText(HttpListenerContext c, int code, string s, string type)
    {
        Send(c, code, Encoding.UTF8.GetBytes(s), type + "; charset=utf-8");
    }

    static string Esc(string s)
    {
        if (s == null) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ").Replace("\t", " ");
    }

    static string Mime(string ext)
    {
        switch (ext.ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".gif": return "image/gif";
            case ".svg": return "image/svg+xml";
            case ".webp": return "image/webp";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            case ".ttf": return "font/ttf";
            case ".mp4": return "video/mp4";
            case ".webm": return "video/webm";
            default: return "application/octet-stream";
        }
    }

    static void Handle(HttpListenerContext c)
    {
        string p = c.Request.Url.AbsolutePath;
        if (c.Request.HttpMethod == "OPTIONS")
        {
            c.Response.AddHeader("Access-Control-Allow-Origin", "*");
            c.Response.AddHeader("Access-Control-Allow-Headers", "*");
            c.Response.StatusCode = 204;
            c.Response.Close();
            return;
        }
        if (p == "/api/login")
        {
            if (Pin.Length == 0 || PinOk(c))
            {
                if (Pin.Length > 0) c.Response.AppendHeader("Set-Cookie", "tovpin=" + Uri.EscapeDataString(Pin) + "; Path=/; HttpOnly; SameSite=Lax");
                SendText(c, 200, "{\"ok\":true}", "application/json");
            }
            else SendText(c, 401, "{\"error\":\"pin\"}", "application/json");
            return;
        }
        // other PCs need the access code (data/pin.txt) if one is set; this PC (vMix) never does
        if (p.StartsWith("/api/") && Pin.Length > 0 && !IsLocal(c) && !PinOk(c)) { SendText(c, 401, "{\"error\":\"pin\"}", "application/json"); return; }
        if (p.StartsWith("/api/")) { Api(c, p); return; }
        if (p == "/") p = "/control.html";
        string rel = Uri.UnescapeDataString(p).TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        string file = Path.GetFullPath(Path.Combine(root, rel));
        string dataDir = Path.Combine(root, "data");
        if (!file.StartsWith(root, StringComparison.OrdinalIgnoreCase) ||
            file.StartsWith(dataDir, StringComparison.OrdinalIgnoreCase) ||
            !File.Exists(file))
        {
            SendText(c, 404, "Not found", "text/plain");
            return;
        }
        Send(c, 200, File.ReadAllBytes(file), Mime(Path.GetExtension(file)));
    }

    static string Wrap() { return "{\"rev\":" + rev + ",\"state\":" + stateJson + "}"; }

    static void Api(HttpListenerContext c, string p)
    {
        var q = c.Request.QueryString;
        if (p == "/api/state")
        {
            if (c.Request.HttpMethod == "POST")
            {
                string body;
                using (var sr = new StreamReader(c.Request.InputStream, Encoding.UTF8)) body = sr.ReadToEnd();
                long r;
                lock (lk) { stateJson = body; rev++; r = rev; }
                try
                {
                    string dir = Path.Combine(root, "data");
                    Directory.CreateDirectory(dir);
                    File.WriteAllText(Path.Combine(dir, "state.json"), body, new UTF8Encoding(false));
                }
                catch { }
                SendText(c, 200, "{\"rev\":" + r + "}", "application/json");
            }
            else
            {
                string w; lock (lk) { w = Wrap(); }
                SendText(c, 200, w, "application/json");
            }
            return;
        }
        if (p == "/api/poll")
        {
            long have; long.TryParse(q["rev"], out have);
            string o; lock (lk) { o = have == rev ? "{\"rev\":" + rev + "}" : Wrap(); }
            SendText(c, 200, o, "application/json");
            return;
        }
        if (p == "/api/cmds")
        {
            long after; long.TryParse(q["after"], out after);
            var sb = new StringBuilder("[");
            lock (lk)
            {
                bool first = true;
                foreach (var kv in cmds)
                {
                    if (kv.Key <= after) continue;
                    if (!first) sb.Append(',');
                    sb.Append(kv.Value);
                    first = false;
                }
            }
            sb.Append(']');
            SendText(c, 200, sb.ToString(), "application/json");
            return;
        }
        if (p == "/api/live" || p == "/api/score" || p == "/api/timer" || p == "/api/clock" || p == "/api/hideall" || p == "/api/spot")
        {
            var qs = new StringBuilder("{");
            bool first = true;
            foreach (string k in q.AllKeys)
            {
                if (k == null) continue;
                if (!first) qs.Append(',');
                qs.Append("\"" + Esc(k) + "\":\"" + Esc(q[k]) + "\"");
                first = false;
            }
            qs.Append('}');
            lock (lk)
            {
                seq++;
                cmds.Add(new KeyValuePair<long, string>(seq, "{\"seq\":" + seq + ",\"name\":\"" + p.Substring(5) + "\",\"q\":" + qs + "}"));
                if (cmds.Count > 200) cmds.RemoveAt(0);
            }
            SendText(c, 200, "{\"ok\":true,\"note\":\"applied by the open control panel\"}", "application/json");
            return;
        }
        SendText(c, 404, "{\"error\":\"not found\"}", "application/json");
    }
}
'@

Add-Type -TypeDefinition $src -Language CSharp
[OverlayServer]::Start($root, $Port)

Write-Host ''
Write-Host '  TOURNAMENT OVERLAYS server is running' -ForegroundColor Green
Write-Host ''
if ([OverlayServer]::Pin.Length -gt 0) { Write-Host '  Access code: ON (other PCs must enter the code from data\pin.txt)' -ForegroundColor Green } else { Write-Host '  Access code: off (create data\pin.txt to require one from other PCs)' }
if ([OverlayServer]::Lan) {
    Write-Host '  Network access: ON  (other PCs can reach this server)' -ForegroundColor Green
    $ips = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.IPAddressToString }
    foreach ($ip in $ips) { Write-Host "    other PCs use: http://${ip}:$Port" }
} else {
    Write-Host '  Network access: OFF (this PC only). Run allow-network.bat as Administrator to let other PCs connect.' -ForegroundColor Yellow
}
Write-Host ''
Write-Host "  Control panel : http://localhost:$Port/control.html"
Write-Host "  Preview all   : http://localhost:$Port/preview.html"
Write-Host "  vMix browser input example: http://localhost:$Port/overlay.html?game=cod&scene=hud"
Write-Host ''
Write-Host '  Keep this window open during the stream. Close it to stop.' -ForegroundColor Yellow
Write-Host ''
while ($true) { Start-Sleep -Seconds 3600 }
