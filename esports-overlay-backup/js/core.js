/* Tournament Overlays - shared core (state, timers, scene registry, sync).
   Works in the browser and in Node (server.js requires this file). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Geometry (1920x1080 canvas) ---------- */
  const GAME_RECT = { x: 0, y: 0, w: 1920, h: 1080 };   // gameplay is full screen
  const CAMS = {
    cod: [0, 1, 2, 3].map((k) => ({ team: 0, idx: k, x: 0, y: 330 + 162 * k, w: 288, h: 162 }))
      .concat([0, 1, 2, 3].map((k) => ({ team: 1, idx: k, x: 1632, y: 330 + 162 * k, w: 288, h: 162 }))),
    fc: [{ team: 0, idx: 0, x: 24, y: 760, w: 400, h: 225 }, { team: 1, idx: 0, x: 1496, y: 760, w: 400, h: 225 }]
  };

  /* Stage / desk cams (PTZ): window positions for 1, 2 or 3 cams, and the small corner window */
  const STAGE_PIP = { x: 1580, y: 150, w: 320, h: 180 };
  function stageRects(st) {
    const n = Math.max(1, Math.min(3, parseInt(st && st.count, 10) || 1));
    if (n === 1) return [{ x: 384, y: 200, w: 1152, h: 648 }];
    if (n === 2) return [{ x: 110, y: 270, w: 790, h: 444 }, { x: 1020, y: 270, w: 790, h: 444 }];
    return [{ x: 90, y: 300, w: 560, h: 315 }, { x: 680, y: 300, w: 560, h: 315 }, { x: 1270, y: 300, w: 560, h: 315 }];
  }
  /* Stand-alone overlays: the tight canvas [x, y, w, h] each one needs (everything else is 1920x1080).
     In vMix make the browser input exactly w x h and put it anywhere; it is a normal layer you can move / resize. */
  const ELEMENT_RECTS = {
    scorebug: [300, 26, 1320, 156], scorecenter: [815, 28, 290, 112], infostrip: [540, 134, 840, 48], ticker: [0, 1000, 1920, 80],
    lowerthird: { cod: [320, 880, 800, 124], fc: [440, 880, 800, 124] }, replay: [1230, 186, 380, 92],
    alert: [320, 396, 1280, 176], goal: [400, 116, 1120, 380], deskpip: [1566, 138, 348, 204],
    cams_a: { cod: [0, 0, 388, 660], fc: [0, 0, 532, 305] }, cams_b: { cod: [0, 0, 388, 660], fc: [0, 0, 532, 305] }
  };
  function elementRect(game, id) {
    let r = ELEMENT_RECTS[id]; if (r && !Array.isArray(r)) r = r[game];
    return r ? { x: r[0], y: r[1], w: r[2], h: r[3] } : { x: 0, y: 0, w: 1920, h: 1080 };
  }
  const SPOT_SCALE = 1.3;// size of the focused cam relative to its normal slot
  /* Cams currently in use: first N slots of each team (g.cams = cams per team) */
  const camsFor = (game, g) => {
    const max = CAMS[game].reduce((m, c) => Math.max(m, c.idx + 1), 0);
    const n = Math.min(max, g && g.cams != null ? g.cams : max);
    // fewer cams -> the stack re-centres vertically on the same column
    const all = CAMS[game].filter((c) => c.idx < n).map((c) => Object.assign({}, c, { y: c.y + ((max - n) * c.h) / 2 }));
    // spotlight: g.spot = camera number (1-based over CAMS order), 0 = show all
    const sp = g && g.spot > 0 ? CAMS[game][g.spot - 1] : null;
    // the focused cam grows (SPOT_SCALE) and moves to the bottom centre, just above the bottom bar
    return sp ? all.filter((c) => c.team === sp.team && c.idx === sp.idx).map((c) => {
      const w = Math.round(c.w * SPOT_SCALE), h = Math.round(c.h * SPOT_SCALE);
      return Object.assign({}, c, { w, h, x: Math.round((1920 - w) / 2), y: 980 - h });
    }) : all;
  };

  /* ---------- Scene registry ----------
     type: base = always on background | hud = in-match overlay | full = full screen | pop = banner | auto = timed */
  const SCENES = {
    cod: [
      { id: 'hud', label: 'Main HUD', type: 'hud', desc: 'Scorebug + cam name plates + ticker over full-screen gameplay' },
      { id: 'scorebug', label: 'Scorebug only', type: 'hud', desc: 'Just the scorebug, no cams or ticker' },
      { id: 'camborders', label: 'Cam borders only', type: 'hud', desc: 'Only the face-cam frames + name plates, transparent' },
      { id: 'cams_a', label: 'Team A cams (alone)', type: 'hud', desc: 'Only team A’s cams as one block' },
      { id: 'cams_b', label: 'Team B cams (alone)', type: 'hud', desc: 'Only team B’s cams as one block' },
      { id: 'scorecenter', label: 'Map / match clock (alone)', type: 'hud', desc: 'Only the centre block: map or match timer' },
      { id: 'infostrip', label: 'Info strip (alone)', type: 'hud', desc: 'Only the event / stage pill' },
      { id: 'ticker', label: 'Bottom ticker bar (alone)', type: 'hud', desc: 'Only the bottom bar with the ticker' },
      { id: 'starting', label: 'Starting Soon', type: 'full', desc: 'Pre-show countdown screen' },
      { id: 'matchup', label: 'Team Lineup / Versus', type: 'full', desc: 'Match intro with face-cam windows' },
      { id: 'mapveto', label: 'Maps & Modes', type: 'full', desc: 'Series map / mode / pick board' },
      { id: 'tactical', label: 'Tactical Timeout', type: 'full', desc: 'Full-screen team timeout with countdown' },
      { id: 'technical', label: 'Technical Timeout', type: 'full', desc: 'Full-screen technical pause with reason + countdown' },
      { id: 'break', label: 'Break / BRB', type: 'full', desc: 'Break screen with timer + next match' },
      { id: 'desk', label: 'Stage / Desk Cams', type: 'full', desc: 'Full-screen desk shot: framed PTZ cams with names' },
      { id: 'deskpip', label: 'Desk Cam (corner)', type: 'pop', desc: 'Framed desk cam window over the game' },
      { id: 'halftime', label: 'Map Break', type: 'full', desc: 'Between-maps summary with results' },
      { id: 'alert', label: 'Map Win Banner', type: 'pop', desc: 'Map result banner — stays until you turn it off' },
      { id: 'lowerthird', label: 'Lower Third', type: 'auto', secs: 8, desc: 'Player / caster name strap' },
      { id: 'replay', label: 'Replay Tag', type: 'auto', secs: 10, desc: 'REPLAY indicator' },
      { id: 'result', label: 'Final Result', type: 'full', desc: 'Winner screen with celebration' },
      { id: 'champions', label: 'Champions', type: 'full', desc: 'Champions trophy celebration' },
      { id: 'podium', label: 'Podium 1st · 2nd · 3rd', type: 'full', desc: 'Top-3 teams podium' },
      { id: 'ending', label: 'Ending / Thanks', type: 'full', desc: 'Outro screen' }
    ],
    fc: [
      { id: 'hud', label: 'Main HUD', type: 'hud', desc: 'Scorebug + cam name plates + ticker over full-screen gameplay' },
      { id: 'scorebug', label: 'Scorebug only', type: 'hud', desc: 'Just the scorebug, no cams or ticker' },
      { id: 'camborders', label: 'Cam borders only', type: 'hud', desc: 'Only the face-cam frames + name plates, transparent' },
      { id: 'cams_a', label: 'Team A cams (alone)', type: 'hud', desc: 'Only team A’s cams as one block' },
      { id: 'cams_b', label: 'Team B cams (alone)', type: 'hud', desc: 'Only team B’s cams as one block' },
      { id: 'scorecenter', label: 'Map / match clock (alone)', type: 'hud', desc: 'Only the centre block: map or match timer' },
      { id: 'infostrip', label: 'Info strip (alone)', type: 'hud', desc: 'Only the event / stage pill' },
      { id: 'ticker', label: 'Bottom ticker bar (alone)', type: 'hud', desc: 'Only the bottom bar with the ticker' },
      { id: 'starting', label: 'Starting Soon', type: 'full', desc: 'Pre-show countdown screen' },
      { id: 'matchup', label: 'Player Intro / Versus', type: 'full', desc: 'Match intro with face-cam windows' },
      { id: 'tactical', label: 'Tactical Timeout', type: 'full', desc: 'Full-screen player timeout with countdown' },
      { id: 'technical', label: 'Technical Timeout', type: 'full', desc: 'Full-screen technical pause with reason + countdown' },
      { id: 'break', label: 'Break / BRB', type: 'full', desc: 'Break screen with timer + next match' },
      { id: 'desk', label: 'Stage / Desk Cams', type: 'full', desc: 'Full-screen desk shot: framed PTZ cams with names' },
      { id: 'deskpip', label: 'Desk Cam (corner)', type: 'pop', desc: 'Framed desk cam window over the game' },
      { id: 'halftime', label: 'Half Time', type: 'full', desc: 'Half-time scoreboard' },
      { id: 'goal', label: 'GOAL Celebration', type: 'auto', secs: 8, desc: 'Small celebration with the scorer’s name on the live layout' },
      { id: 'alert', label: 'GOAL Banner', type: 'pop', desc: 'Goal banner — stays until you turn it off' },
      { id: 'lowerthird', label: 'Lower Third', type: 'auto', secs: 8, desc: 'Player / caster name strap' },
      { id: 'replay', label: 'Replay Tag', type: 'auto', secs: 10, desc: 'REPLAY indicator' },
      { id: 'result', label: 'Final Result', type: 'full', desc: 'Winner screen with celebration' },
      { id: 'champions', label: 'Champions', type: 'full', desc: 'Champions trophy celebration' },
      { id: 'podium', label: 'Podium 1st · 2nd · 3rd', type: 'full', desc: 'Top-3 players podium' },
      { id: 'ending', label: 'Ending / Thanks', type: 'full', desc: 'Outro screen' }
    ]
  };

  /* ---------- Defaults ---------- */
  const mkTeam = (name, tag, color, players, club) => ({ name, tag, color, club: club || '', logo: '', players, timeouts: 1 });
  const mkPlace = (color, players) => ({ name: '', tag: '', color, club: '', logo: '', players, prize: '' });
  const mkMap =(n, mode, pick) => ({ mode, map: 'MAP ' + n, pick, scores: [0, 0], winner: null });
  const mkTimer = (secs) => ({ dur: secs, left: secs, running: false, endsAt: null });

  const DEFAULTS = {
    rev: 0,
    event: {
      name: 'NEXUS CHAMPIONSHIP', season: 'SEASON 3', stage: 'GRAND FINAL', logo: '', showCams: true,
      themeAccent: '', themeAccent2: '', themeBg: '', themePanel: '', themeText: '', sceneTheme: {},
      ticker: 'WELCOME TO THE NEXUS CHAMPIONSHIP  •  FOLLOW @NEXUSESPORTS  •  USE #NEXUSCHAMP  •  POWERED BY YOUR SPONSOR',
      sponsor: 'YOUR SPONSOR HERE'
    },
    ui: { game: 'cod', exclusive: false, lite: false, noBg: false },
    stage: {
      count: 2, pipCam: 0, title: 'LIVE FROM THE DESK', relayPort: 8089,
      cams: [
        { name: 'CASTER 1', role: 'PLAY-BY-PLAY', ndiName: '' },
        { name: 'CASTER 2', role: 'COLOUR CASTER', ndiName: '' },
        { name: 'CASTER 3', role: 'ANALYST', ndiName: '' }
      ]
    },
    timers: { starting: mkTimer(300), break: mkTimer(600), tactical: mkTimer(60), technical: mkTimer(300) },
    tactical: { team: 0 },
    technical: { reason: 'TECHNICAL ISSUE' },
    breakInfo: { title: 'BREAK', next: 'NEXT MATCH STARTS SOON' },
    lower: { name: 'CASTER NAME', title: 'PLAY-BY-PLAY CASTER' },
    replay: { text: 'REPLAY' },
    live: { cod: {}, fc: {} },
    cod: {
      teams: [
        mkTeam('SHADOW OPS', 'SHD', '#ffb21a', ['GHOST', 'REAPER', 'VIPER', 'NOMAD']),
        mkTeam('IRON WOLVES', 'IRW', '#3ad6a0', ['FENRIR', 'TALON', 'RAZOR', 'BISHOP'])
      ],
      podium: [mkPlace('#ffc83d', ['', '', '', '']), mkPlace('#cfd8e3', ['', '', '', '']), mkPlace('#e0975a', ['', '', '', ''])],
      showStrip: true, spot: 0, camNdi: ['', '', '', '', '', '', '', ''],
      cams: 4, bo: 5, wins: [0, 0], score: [0, 0], mapIndex: 0, period: '', alert: { team: 0, title: 'MAP WIN', sub: 'HARDPOINT' },
      maps: [mkMap(1, 'HARDPOINT', 0), mkMap(2, 'SEARCH & DESTROY', 1), mkMap(3, 'CONTROL', 0), mkMap(4, 'HARDPOINT', 1), mkMap(5, 'SEARCH & DESTROY', null)]
    },
    fc: {
      teams: [
        mkTeam('KING_ALEX', 'ALX', '#00f08c', ['KING_ALEX'], 'REAL MADRID'),
        mkTeam('NOVA_FC', 'NOV', '#19b5ff', ['NOVA_FC'], 'MANCHESTER CITY')
      ],
      podium: [mkPlace('#ffc83d', ['']), mkPlace('#cfd8e3', ['']), mkPlace('#e0975a', [''])],
      goal: { team: 0, minute: '' }, showStrip: true, spot: 0, camNdi: ['', ''],
      cams: 1, bo: 3, wins: [0, 0], score: [0, 0], period: '1ST HALF', alert: { team: 0, title: 'GOAL!', sub: "KING_ALEX 23'" },
      clock: { running: false, base: 0, startedAt: 0 }
    }
  };

  /* ---------- Helpers ---------- */
  function merge(base, patch) {
    if (Array.isArray(base)) return Array.isArray(patch) ? patch : base;
    if (base && typeof base === 'object') {
      const out = {};
      const keys = new Set(Object.keys(base).concat(patch && typeof patch === 'object' ? Object.keys(patch) : []));
      keys.forEach((k) => {
        out[k] = patch && typeof patch === 'object' && k in patch ? merge(base[k], patch[k]) : clone(base[k]);
      });
      return out;
    }
    return patch === undefined ? base : patch;
  }
  /* drop settings left over from controls that no longer exist (vMix layers, PTZ pad, browser webcams) */
  function clean(s) {
    delete s.vmix;
    if (s.stage) {
      ['inputs', 'pipInput', 'pipLayer', 'speed', 'ptzSel'].forEach((k) => { delete s.stage[k]; });
      (s.stage.cams || []).forEach((c) => { ['input', 'layer', 'preset', 'source', 'deviceId', 'deviceLabel'].forEach((k) => { delete c[k]; }); });
    }
    return s;
  }
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.'); let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = {}; a = a[ks[i]]; }
    a[ks[ks.length - 1]] = v;
  }

  function fmt(sec, forceH) {
    sec = Math.max(0, Math.ceil(sec - 1e-6));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h > 0 || forceH ? h + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s);
  }
  const timerLeft = (t, now) => (t.running ? Math.max(0, (t.endsAt - (now || Date.now())) / 1000) : t.left);
  function timerAction(state, name, action, secs) {
    const t = state.timers[name]; if (!t) return;
    const now = Date.now();
    if (action === 'start') { if (t.left <= 0) t.left = t.dur; t.endsAt = now + t.left * 1000; t.running = true; }
    else if (action === 'pause') { t.left = timerLeft(t, now); t.running = false; t.endsAt = null; }
    else if (action === 'reset') { t.left = t.dur; t.running = false; t.endsAt = null; }
    else if (action === 'set') { t.dur = t.left = Math.max(0, secs | 0); t.running = false; t.endsAt = null; }
    else if (action === 'add') { const l = timerLeft(t, now) + (secs | 0); t.left = Math.max(0, l); if (t.running) t.endsAt = now + t.left * 1000; }
  }
  const clockNow = (c, now) => (c ? c.base + (c.running ? ((now || Date.now()) - c.startedAt) / 1000 : 0) : 0);
  function clockAction(state, action, secs) {
    const c = state.fc.clock, now = Date.now();
    if (action === 'start') { if (!c.running) { c.startedAt = now; c.running = true; } }
    else if (action === 'pause') { c.base = clockNow(c, now); c.running = false; }
    else if (action === 'set') { c.base = Math.max(0, secs | 0); c.startedAt = now; }
  }

  const FULL_GROUP = ['starting', 'matchup', 'mapveto', 'tactical', 'technical', 'desk', 'break', 'halftime', 'result', 'champions', 'podium', 'ending'];
  const OVER_GROUP = ['hud', 'scorebug', 'tactical', 'technical', 'alert', 'lowerthird', 'replay'];
  function setLive(state, game, id, val, exclusive) {
    const live = state.live[game];
    if (val && exclusive) {
      if (FULL_GROUP.includes(id)) {
        FULL_GROUP.forEach((o) => { if (o !== id) live[o] = false; });
        ['hud', 'scorebug', 'tactical', 'technical'].forEach((o) => { live[o] = false; });
      } else if (id === 'hud' || id === 'scorebug') {
        FULL_GROUP.forEach((o) => { live[o] = false; });
        live[id === 'hud' ? 'scorebug' : 'hud'] = false;
      } else if (id === 'tactical') live.technical = false;
      else if (id === 'technical') live.tactical = false;
    }
    live[id] = val;
  }
  function addScore(state, game, team, delta, field) {
    const g = state[game], f = field || 'score';
    g[f][team] = Math.max(0, (g[f][team] | 0) + delta);
  }
  const isLive = (state, game, id, now) => {
    const v = state.live && state.live[game] && state.live[game][id];
    return v === true || (typeof v === 'number' && v > (now || Date.now()));
  };

  /* HTTP trigger commands (Stream Deck / vMix shortcuts) - applied by the control panel.
     name: live | score | timer | clock | hideall ; q: query params as an object */
  function applyCommand(state, name, q) {
    const game = q.game === 'fc' ? 'fc' : (q.game === 'cod' ? 'cod' : state.ui.game);
    if (name === 'live') {
      const meta = SCENES[game].find((s) => s.id === q.scene); if (!meta) return;
      const cur = isLive(state, game, meta.id);
      let val = q.on === undefined || q.on === 'toggle' ? !cur : (q.on === '1' || q.on === 'true');
      if (val && meta.type === 'auto') val = Date.now() + (parseFloat(q.secs) || meta.secs || 7) * 1000;
      setLive(state, game, meta.id, val, state.ui.exclusive);
    } else if (name === 'score') {
      addScore(state, game, parseInt(q.team || '0', 10) ? 1 : 0, parseInt(q.delta || '1', 10), q.field === 'wins' ? 'wins' : 'score');
    } else if (name === 'timer') timerAction(state, q.name, q.action, parseInt(q.secs || '0', 10));
    else if (name === 'clock') clockAction(state, q.action, parseInt(q.secs || '0', 10));
    else if (name === 'spot') { const n = parseInt(q.n || '0', 10); state[game].spot = n >= 0 && n <= CAMS[game].length ? n : 0; }
    else if (name === 'hideall') SCENES[game].forEach((m) => { state.live[game][m.id] = false; });
  }

  /* Theme colour -> CSS variable overrides (null when using the game's default theme) */
  function themeVars(t) {
    t = t || {};
    const a1 = t.accent, a2 = t.accent2, out = {};
    const ok = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const mix = (h, w, a) => { const c = rgb(h), d = rgb(w); return '#' + [0, 1, 2].map((i) => Math.round(c[i] + (d[i] - c[i]) * a).toString(16).padStart(2, '0')).join(''); };
    const rgba = (h, a) => 'rgba(' + rgb(h).join(',') + ',' + a + ')';
    if (ok(t.bg)) { out['--bg'] = t.bg; out['--bg2'] = mix(t.bg, '#ffffff', .07); }
    if (ok(t.panel)) { out['--panel'] = rgba(t.panel, .95); out['--panel2'] = rgba(mix(t.panel, '#ffffff', .06), .95); }
    if (ok(t.text)) { out['--text'] = t.text; out['--muted'] = mix(t.text, ok(t.bg) ? t.bg : '#000000', .45); }
    if (!ok(a1)) { if (ok(a2)) out['--accent2'] = a2; return Object.keys(out).length ? out : null; }
    const [r, g, b] = rgb(a1);
    let second = a2;
    if (!ok(second)) { // derive a companion colour by rotating the hue
      const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, d = mx - mn;
      let hh = 0; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      if (d) { if (mx === r / 255) hh = ((g - b) / 255 / d) % 6; else if (mx === g / 255) hh = (b - r) / 255 / d + 2; else hh = (r - g) / 255 / d + 4; }
      hh = (hh * 60 + 360 - 28) % 360;
      second = 'hsl(' + hh.toFixed(0) + ',' + (Math.max(s, .6) * 100).toFixed(0) + '%,' + (Math.min(Math.max(l, .45), .6) * 100).toFixed(0) + '%)';
    }
    return Object.assign(out, { '--accent': a1, '--accent2': second, '--ar': r + ',' + g + ',' + b, '--line': 'rgba(' + r + ',' + g + ',' + b + ',.4)', '--gridc': 'rgba(' + r + ',' + g + ',' + b + ',.06)' });
  }
  /* effective colours for one scene: scene override > global > game default */
  function sceneColors(state, game, scene) {
    const e = state.event, sc = (e.sceneTheme || {})[game + '.' + scene] || {};
    return {
      accent: sc.accent || e.themeAccent, accent2: sc.accent2 || e.themeAccent2,
      bg: sc.bg || e.themeBg, panel: sc.panel || e.themePanel, text: sc.text || e.themeText
    };
  }
  const THEME_KEYS = ['--accent', '--accent2', '--ar', '--line', '--gridc', '--bg', '--bg2', '--panel', '--panel2', '--text', '--muted'];
  const THEME_DEFAULTS = {
    cod: { accent: '#ffb21a', accent2: '#ff6a1a', bg: '#090b08', panel: '#0d100b', text: '#f4f2e9' },
    fc: { accent: '#00f08c', accent2: '#19b5ff', bg: '#040b19', panel: '#061126', text: '#f2f8ff' }
  };

  const teamTag = (t) => (t.tag || t.name || '?').slice(0, 4).toUpperCase();
  function winnerOf(g) {
    const need = Math.ceil((g.bo || 1) / 2);
    if (g.wins[0] !== g.wins[1] && (g.wins[0] >= need || g.wins[1] >= need)) return g.wins[0] > g.wins[1] ? 0 : 1;
    if (g.wins[0] !== g.wins[1]) return g.wins[0] > g.wins[1] ? 0 : 1;
    if (g.score[0] !== g.score[1]) return g.score[0] > g.score[1] ? 0 : 1;
    return -1;
  }

  /* ---------- Store (browser only) ---------- */
  const Store = {
    state: clone(DEFAULTS), mode: 'local', subs: [], id: Math.random().toString(36).slice(2),
    on(fn) { this.subs.push(fn); },
    emit(external) { this.subs.forEach((f) => { try { f(this.state, external); } catch (e) { console.error(e); } }); },
    apply(raw, external) { this.state = clean(merge(DEFAULTS, raw || {})); this.emit(external); },
    serverRev: -1,
    async init() {
      const KEY = 'tov_state_v1';
      let loaded = false;
      if (location.protocol.startsWith('http')) {
        try {
          let r = await fetch('/api/state', { cache: 'no-store' });
          if (r.status === 401) {   // another PC and the server has an access code (data/pin.txt)
            const pin = prompt('Access code for the overlay server:');
            if (pin !== null) { await fetch('/api/login?pin=' + encodeURIComponent(pin), { cache: 'no-store' }); r = await fetch('/api/state', { cache: 'no-store' }); }
            if (r.status === 401) { alert('Wrong access code. Reload the page to try again.'); throw new Error('pin'); }
          }
          if (r.ok) {
            const w = await r.json(); this.mode = 'server'; loaded = true;
            this.serverRev = w.rev;
            if (w.state && w.state.event) this.apply(w.state); else this.emit();
            const poll = async () => {
              try {
                const pr = await fetch('/api/poll?rev=' + this.serverRev, { cache: 'no-store' });
                const d = await pr.json();
                if (d.rev !== this.serverRev) {
                  this.serverRev = d.rev;
                  if (d.state && d.state._src !== this.id && !this._dirty) this.apply(d.state, true);
                }
                this.online = true;
              } catch (e) { this.online = false; }
              setTimeout(poll, 200);
            };
            poll();
          }
        } catch (e) { /* no server */ }
      }
      if (!loaded) {
        this.mode = 'local';
        try { const raw = localStorage.getItem(KEY); if (raw) this.state = clean(merge(DEFAULTS, JSON.parse(raw))); } catch (e) { /* ignore */ }
        try {
          this.bc = new BroadcastChannel('tov_bc');
          this.bc.onmessage = (ev) => { if (ev.data && ev.data._src !== this.id) this.apply(ev.data, true); };
        } catch (e) { /* ignore */ }
        window.addEventListener('storage', (ev) => {
          if (ev.key === KEY && ev.newValue) { try { this.apply(JSON.parse(ev.newValue), true); } catch (e) { /* ignore */ } }
        });
        this.emit();
      }
    },
    update(fn) {
      fn(this.state); this.state.rev = (this.state.rev || 0) + 1;
      this.emit(false); this.push();
    },
    push() {
      clearTimeout(this._t); this._dirty = true;
      this._t = setTimeout(() => {
        const payload = Object.assign({}, this.state, { _src: this.id });
        if (this.mode === 'server') {
          fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then((r) => r.json()).then((w) => { this.serverRev = w.rev; }).catch(() => {}).then(() => { this._dirty = false; });
        } else {
          this._dirty = false;
          try { localStorage.setItem('tov_state_v1', JSON.stringify(this.state)); } catch (e) { /* quota */ }
          try { this.bc && this.bc.postMessage(payload); } catch (e) { /* ignore */ }
        }
      }, 40);
    }
  };

  return {
    clone, esc, merge, getPath, setPath, fmt, timerLeft, timerAction, clockNow, clockAction, setLive, addScore, isLive, applyCommand, themeVars, stageRects, STAGE_PIP, SPOT_SCALE, ELEMENT_RECTS, elementRect, sceneColors, THEME_KEYS, THEME_DEFAULTS, camsFor,
    teamTag, winnerOf, GAME_RECT, CAMS, SCENES, DEFAULTS, Store, FULL_GROUP, OVER_GROUP
  };
});
