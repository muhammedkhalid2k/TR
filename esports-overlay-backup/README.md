# Tournament Overlays — CoD MW4 (4v4) & FC 27 (1v1) for vMix

Animated 1920×1080 broadcast graphics built as HTML pages. vMix loads each one as a **Web Browser input**
(transparent background). One control panel drives everything live.

## Quick start
1. Double-click **`start-server.bat`** (Windows, nothing to install). Leave the window open.
2. The control panel opens at `http://localhost:8080/control.html` — keep that tab open during the show.
3. Open **Preview all scenes** (`/preview.html`) to see every overlay, including a stacked layout with fake gameplay and cams.
4. In the panel: **Teams / Players** tab → names, tags, colours, **logo upload**, player names (they appear on the face-cam name plates). **Event** tab → tournament name, stage, ticker, sponsor, logo.
5. **vMix setup** tab → copy each scene's URL and the exact gameplay / face-cam positions.

## Scenes (both games)
| Scene | What it is |
|---|---|
| Game Layout Background | Opaque animated frame (base layer under gameplay + cams) |
| Main HUD (framed) | Scorebug, face-cam name plates + frames, gameplay frame, ticker bar (CoD also shows timeouts; FC adds player cards with score) |
| Scorebug (compact) | Floating scorebug for full-screen gameplay |
| Starting Soon | Countdown screen |
| Team Lineup / Player Intro | Versus screen with face-cam windows |
| Maps & Modes (CoD) | Series map/mode/pick board |
| Tactical Timeout | Team banner + countdown + timeouts left |
| Technical Timeout | Dimmed gameplay + paused panel + reason + countdown |
| Break / BRB | Big countdown, “up next”, matchup; title editable (BREAK, BE RIGHT BACK…) |
| Map Break (CoD) / Half Time (FC) | Score + map results, resume countdown |
| Map Win (CoD) / GOAL (FC) banner | Auto-hiding result banner |
| Lower Third, Replay Tag | Auto-hiding |
| Final Result | Winner screen with confetti |
| Ending | Thanks for watching |

## Canvas layout (1920×1080)
* Gameplay: **full screen** (your game capture is the base input).
* CoD cams (8): 240×135 stacked at x0 (team A) and x1680 (team B), y320 / 455 / 590 / 725
* FC cams (2): 320×180 at x24,y744 (player 1) and x1576,y744 (player 2)
* Full-screen scenes keep transparent windows exactly over the cam slots so the cams stay visible. Turning off the face-cam option in the Event tab removes every cam window, frame and name plate.

## Assets for native vMix use (PNG + MP4)
* Open `http://localhost:8080/assets.html` (or the **⬇ vMix assets** link in the control panel).
* **Download everything (ZIP)**: transparent PNGs — backgrounds, cam borders, name plates, scorebug / bars / banners / panels, your logos.
* **Animated MP4s (ZIP)**: H.264 MP4, 30 fps, seamless loops — animated background (10 s, opaque), animated cam borders (4 s) and a celebration loop (6 s). MP4 has no transparency: borders and celebration are on black — use vMix *Colour Key* on black (or an Add/Screen blend). Set the input to Loop.

## Separate overlays (each its own vMix browser input, movable / resizable)
* `overlay.html?game=cod&el=<id>` = ONE overlay on a tight, transparent canvas (ids: scorebug, scorecenter, infostrip, ticker, cams_a, cams_b, camborders, lowerthird, replay, alert, goal, tactical, technical, break, halftime, mapveto, desk, deskpip, starting, matchup, result, champions, podium, ending).
* Control panel → **vMix setup** lists every link with the exact Width × Height to type into the vMix browser input.
* It follows the same on/off button in the Scenes list; add `&force=1` to keep it always on.

## Backup
* Control panel → **💾 Backup** (or `backup.html`) downloads a ZIP of the whole project + your saved settings.

## Only the pieces, transparent (no full-screen backgrounds)
* Add `&nobg=1` to any overlay URL (or tick **Transparent mode** in the Event tab): full-screen scenes then draw only their borders, frames, panels, logos and text.
* `overlay.html?game=cod&scene=camborders` = just the face-cam frames + name plates.
* The PNG/MP4 assets in `assets.html` are the same pieces as files.

## Fast setup: ONE browser input (recommended)
* vMix → Add Input → Web Browser → `http://localhost:8080/overlay.html?game=cod&scene=all` (use `game=fc` for FC), 1920×1080, Transparent Background, 30 fps. Put it on an Overlay channel and leave it ON.
* It contains every scene but only builds the ones that are on screen (scenes hidden under a live full-screen scene are not built at all, camera streams only run while visible), so it is far lighter than ~15 separate inputs.
* Still heavy? Event tab → **Performance mode** (or `&lite=1`): no glows/blur/beams, fewer particles. Don't leave "Show all" on during the show.
* vMix can't create browser inputs through its API, so this one input has to be added by hand once.

## Building it in vMix (old way: one input per scene — heavier)
1. Add Input → **Web Browser**, paste the scene URL, 1920×1080, tick *Transparent Background*.
2. Gameplay capture is the base input; add the face-cam inputs as its layers at the positions in the *vMix setup* tab.
3. Put *Main HUD* on Overlay 1; put every other scene on its own overlay channel (or as layers of one "Overlays" input) and leave them ON — the control panel animates them in/out.
4. Use *Scorebug only* if you don't want cams/ticker.

## Stream Deck / vMix shortcut triggers (control panel must be open)
```
http://localhost:8080/api/live?game=cod&scene=hud&on=toggle
http://localhost:8080/api/live?game=fc&scene=break&on=1
http://localhost:8080/api/score?game=fc&team=0&delta=1
http://localhost:8080/api/timer?name=break&action=start        (start | pause | reset | set&secs=600 | add&secs=30)
http://localhost:8080/api/hideall?game=cod
```

## Cams from the network (NDI) — players and casters
* `start-server.bat` also starts the **NDI relay** (`ndi-relay.ps1`, port 8089). It finds NDI sources on the network and streams them into the overlays (needs the NDI runtime that comes with vMix / NDI Tools).
* Control panel → **Teams / Players** tab: *Scan network for NDI cams*, then pick a cam from the dropdown next to each player. **Casters** tab: same for Caster 1-3 (desk shot + corner window).
* The picture is drawn inside the animated frames of the overlay itself — no vMix layers to set up.

## Cam focus (spectator hotkeys)
* Keys **1-8** (CoD) / **1-2** (FC) show only that player's cam: it grows and glides to the bottom centre while the others hide. **0** brings all cams back.

## Control from another PC / another VLAN
* On the vMix PC run `allow-network.bat` once as Administrator (opens TCP 8080 + 8089), then restart `start-server.bat`.
* Other PC: open `http://<vMix PC IP>:8080/control.html`. Across VLANs the network admin must allow TCP 8080 and 8089 to the vMix PC.
* Spectator PC: run `spectator-hotkeys.bat` (vMix PC address, game, access code).
* Optional access code: put a code in `data\pin.txt` and restart the server. The vMix PC itself is never asked; other PCs enter it once.
* Keep one control panel open (any PC) so it can apply key presses. Same action from a Stream Deck: `/api/spot?game=cod&n=1&pin=...` (n=0 shows all).

## Notes
* Fonts load from Google Fonts (Teko, Rajdhani, Saira Condensed, Exo 2) with Windows fallbacks; the vMix PC needs internet once, or install those fonts.
* Data (teams, logos, scores) is saved in `data/state.json` and survives restarts.
* Logos: PNG with transparent background works best (uploads are auto-resized to 512 px).
* Server listens on localhost only. To use another port: `powershell -File server.ps1 -Port 9090`.
