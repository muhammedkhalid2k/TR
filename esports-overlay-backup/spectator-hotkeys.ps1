# Spectator-PC hotkeys: press 1-8 to spotlight that player's face cam, 0 to show all cams again.
# Run on the PC where you spectate. It only LISTENS to number keys (it does not block them, so the
# game still receives them) and sends a tiny request to the overlay server on the vMix PC.
#   usage: powershell -File spectator-hotkeys.ps1 -Server http://192.168.1.20:8080 -Game cod
param(
    [string]$Server = 'http://localhost:8080',
    [ValidateSet('cod', 'fc')][string]$Game = 'cod',
    [string]$Pin = ''
)
$Server = $Server.TrimEnd('/')
$GameArg = $Game
if ($Pin) { $GameArg = $Game + '&pin=' + [uri]::EscapeDataString($Pin) }   # sent with every key press

$src = @'
using System;
using System.Net;
using System.Threading;
using System.Runtime.InteropServices;

public class SpecHotkeys
{
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);

    public static void Run(string server, string game)
    {
        var down = new bool[10];
        while (true)
        {
            bool ctrl = (GetAsyncKeyState(0x11) & 0x8000) != 0 || (GetAsyncKeyState(0x12) & 0x8000) != 0;
            for (int d = 0; d < 10; d++)
            {
                bool pressed = !ctrl && (((GetAsyncKeyState(0x30 + d) & 0x8000) != 0) || ((GetAsyncKeyState(0x60 + d) & 0x8000) != 0));
                if (pressed && !down[d]) Send(server, game, d);
                down[d] = pressed;
            }
            Thread.Sleep(25);
        }
    }

    static void Send(string server, string game, int n)
    {
        ThreadPool.QueueUserWorkItem(delegate
        {
            try
            {
                using (var wc = new WebClient()) wc.DownloadString(server + "/api/spot?game=" + game + "&n=" + n);
                Console.WriteLine("  key " + n + (n == 0 ? "  -> all cams" : "  -> cam " + n));
            }
            catch (Exception e) { Console.WriteLine("  could not reach server: " + e.Message); }
        });
    }
}
'@
Add-Type -TypeDefinition $src -Language CSharp

Write-Host ''
Write-Host '  SPECTATOR HOTKEYS running' -ForegroundColor Green
Write-Host "  Server: $Server   Game: $Game"
Write-Host '  Keys 1-8 (or numpad) = spotlight that player''s cam | 0 = show all cams'
Write-Host '  Close this window to stop.'
Write-Host ''
[SpecHotkeys]::Run($Server, $GameArg)
