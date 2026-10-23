(function () {
  'use strict';
  const { Store, fmt, timerLeft, clockNow, getPath, setPath, SCENES, CAMS, isLive } = Core;
  const app = document.getElementById('app');
  let builtGame = null, tab = 'teams', binders = [], dyns = [];
  const S = () => Store.state;
  const gm = () => S().ui.game;
  const G = () => S()[gm()];

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v; else if (v !== false && v != null) e.setAttribute(k, v);
    });
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  const toast = (m) => { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 1600); };
  const upd = (fn) => Store.update(fn);
  const dyn = (el, fn) => { dyns.push({ el, fn }); return el; };
  const P = (p) => (p.startsWith('~') ? gm() + p.slice(1) : p); // "~.teams.0.name" -> "cod.teams.0.name"

  /* ----- bound inputs ----- */
  function bind(el, path, type) {
    binders.push({ el, path, type });
    const ev = type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const v = type === 'checkbox' ? el.checked : (type === 'number' || type === 'select-n' ? (parseInt(el.value, 10) || 0) : el.value);
      upd((s) => setPath(s, P(path), v));
    });
    return el;
  }
  const field = (label, path, type, opts) => {
    let el;
    if (type === 'select' || type === 'select-n') el = h('select', {}, (opts || []).map((o) => h('option', { value: o[0] }, o[1])));
    else el = h('input', { type: type === 'number' ? 'number' : type || 'text', list: opts && opts.list, placeholder: opts && opts.ph });
    bind(el, path, type);
    return h('label', { class: 'f' }, label, el);
  };
  function syncBinders() {
    binders.forEach(({ el, path, type }) => {
      const v = getPath(S(), P(path));
      if (document.activeElement === el) return;
      if (type === 'checkbox') el.checked = !!v; else if (el.value !== String(v == null ? '' : v)) el.value = v == null ? '' : v;
    });
  }

  /* ----- helpers ----- */
  const parseTime = (t) => { t = String(t).trim(); if (t.includes(':')) { const [m, s] = t.split(':'); return (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0); } return (parseFloat(t) || 0) * 60; };
  const btn = (label, fn, cls) => h('button', { class: 'btn ' + (cls || ''), onclick: fn }, label);
  const teamName = (i) => G().teams[i].name || ('TEAM ' + (i ? 'B' : 'A'));

  function setLive(id, val) { upd((s) => Core.setLive(s, gm(), id, val, s.ui.exclusive)); }
  function toggleScene(meta) {
    const on = isLive(S(), gm(), meta.id);
    setLive(meta.id, on ? false : (meta.type === 'auto' ? Date.now() + (meta.secs || 7) * 1000 : true));
  }

  /* ----- LIVE column ----- */
  function scenesCard() {
    const grid = h('div', { class: 'scenes' });
    SCENES[gm()].filter((m) => m.type !== 'base').forEach((m) => {
      const b = h('button', { class: 'sbtn ' + m.type, title: m.desc, onclick: () => toggleScene(m) },
        h('span', { class: 'tag' }, 'OFF'), h('b', {}, m.label), h('small', {}, m.desc));
      dyn(b, () => { const on = isLive(S(), gm(), m.id); b.classList.toggle('live', on); b.firstChild.textContent = on ? 'LIVE' : 'OFF'; });
      grid.append(b);
    });
    return h('div', { class: 'card' }, h('h3', {}, 'Scenes — click to show / hide',
      h('span', { class: 'row', style: 'text-transform:none;letter-spacing:0' },
        (() => { const b = btn('', () => upd((s) => { s[gm()].showStrip = s[gm()].showStrip === false; }), 'sm'); dyn(b, () => { const on = G().showStrip !== false; b.textContent = 'Info strip: ' + (on ? 'ON' : 'OFF'); b.classList.toggle('acc', on); }); b.title = 'The small bar under the scorebug (event name · stage)'; return b; })(),
        h('label', { class: 'row', title: 'ON: turning on a full-screen scene hides the HUD automatically. OFF: scenes are independent, any number can be live.' },
          bind(h('input', { type: 'checkbox' }), 'ui.exclusive', 'checkbox'), 'Smart switching'),
        btn('Show all', () => upd((s) => { SCENES[gm()].forEach((m) => { if (m.type !== 'base') s.live[gm()][m.id] = true; }); s.ui.exclusive = false; }), 'sm acc'),
        btn('Hide all', () => upd((s) => { SCENES[gm()].forEach((m) => { s.live[gm()][m.id] = false; }); }), 'sm red'))), grid);
  }

  function scoreCard() {
    const cod = gm() === 'cod';
    const box = (i) => {
      const t = () => G().teams[i];
      const num = (path, label, big) => {
        const v = dyn(h('div', { class: big ? 'big' : 'mini' }), () => { v.textContent = getPath(S(), P(path)); });
        return [v, h('div', { class: 'lbl' }, label)];
      };
      const adj = (field, d) => upd((s) => Core.addScore(s, gm(), i, d, field));
      const c = h('div', { class: 'sc' },
        dyn(h('div', { class: 'nm' }), function () { }),
        ...num('~.score.' + i, cod ? 'MAP SCORE' : 'GOALS', true),
        h('div', { class: 'ctl' }, btn('−', () => adj('score', -1)), btn('+', () => adj('score', 1), 'acc'), btn('+5', () => adj('score', 5)), btn('+10', () => adj('score', 10))),
        h('div', { class: 'row', style: 'justify-content:center;gap:10px' },
          h('div', {}, ...num('~.wins.' + i, 'SERIES WINS'), h('div', { class: 'ctl' }, btn('−', () => adj('wins', -1)), btn('+', () => adj('wins', 1)))),
          cod ? h('div', {}, ...num('~.teams.' + i + '.timeouts', 'TIMEOUTS LEFT'), h('div', { class: 'ctl' }, btn('−', () => upd((s) => { const x = s.cod.teams[i]; x.timeouts = Math.max(0, x.timeouts - 1); })), btn('+', () => upd((s) => { s.cod.teams[i].timeouts = Math.min(5, s.cod.teams[i].timeouts + 1); })))) : null));
      const nm = c.firstChild; dyn(nm, () => { nm.textContent = (t().name || '').toUpperCase(); c.style.setProperty('--c', t().color); });
      return c;
    };
    const extra = [];
    if (cod) {
      extra.push(h('div', { class: 'row', style: 'margin-top:12px' }, ...[0, 1].map((i) => {
        const b = btn('', () => {
          upd((s) => {
            const g = s.cod, m = g.maps[g.mapIndex]; m.winner = i; m.scores = [g.score[0], g.score[1]]; g.wins[i]++;
            g.alert = { team: i, title: 'MAP WIN', sub: (m.mode + ' · ' + m.map).toUpperCase() };
            g.mapIndex = Math.min(g.bo - 1, g.mapIndex + 1); g.score = [0, 0];
            Core.setLive(s, 'cod', 'alert', true, false);
          });
        }, 'acc');
        dyn(b, () => { b.textContent = 'MAP WIN → ' + (G().teams[i].tag || G().teams[i].name).toUpperCase(); });
        return b;
      }), btn('Reset map score', () => upd((s) => { s.cod.score = [0, 0]; }), 'ghost')));
    } else {
      const scorer = h('input', { placeholder: "Minute / note (optional), e.g. 23'", style: 'max-width:240px' });
      const goal = (i) => { upd((s) => { s.fc.score[i]++; s.fc.goal = { team: i, minute: scorer.value }; Core.setLive(s, 'fc', 'goal', Date.now() + 8000, false); }); };
      extra.push(h('div', { class: 'row', style: 'margin-top:12px' }, scorer, ...[0, 1].map((i) => { const b = btn('', () => goal(i), 'acc'); dyn(b, () => { b.textContent = '⚽ GOAL → ' + G().teams[i].name; }); return b; }), btn('Reset score', () => upd((s) => { s.fc.score = [0, 0]; }), 'ghost')));
      const per = ['1ST HALF', 'HALF TIME', '2ND HALF', 'FULL TIME', 'EXTRA TIME', 'PENALTIES'];
      extra.push(h('div', { class: 'row', style: 'margin-top:10px' }, h('small', { style: 'color:var(--muted)' }, 'PERIOD'), ...per.map((p) => btn(p, () => upd((s) => { s.fc.period = p; }), 'sm'))));
      const ck = h('input', { value: '00:00', style: 'width:80px' });
      const cv = dyn(h('span', { style: 'font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;min-width:90px' }), () => { cv.textContent = fmt(clockNow(G().clock)); });
      extra.push(h('div', { class: 'row', style: 'margin-top:10px' }, h('small', { style: 'color:var(--muted)' }, 'MATCH CLOCK'), cv,
        btn('Start', () => upd((s) => Core.clockAction(s, 'start')), 'sm acc'), btn('Pause', () => upd((s) => Core.clockAction(s, 'pause')), 'sm'),
        ck, btn('Set', () => upd((s) => Core.clockAction(s, 'set', parseTime(ck.value))), 'sm'),
        btn('Reset 0', () => upd((s) => Core.clockAction(s, 'set', 0)), 'sm')));
    }
    return h('div', { class: 'card' }, h('h3', {}, 'Score & Series'), h('div', { class: 'score' }, box(0), box(1)), ...extra);
  }

  function timersCard() {
    const rows = [['starting', 'Starting Soon'], ['break', 'Break / Map break'], ['tactical', 'Tactical timeout'], ['technical', 'Technical timeout']];
    const wrap = h('div', {});
    rows.forEach(([name, label]) => {
      const inp = h('input', { value: fmt(S().timers[name].dur), placeholder: 'mm:ss' });
      const tv = dyn(h('div', { class: 'tv' }), () => { const t = S().timers[name]; tv.textContent = fmt(timerLeft(t)); tv.classList.toggle('run', t.running); });
      wrap.append(h('div', { class: 'trow' }, h('div', { class: 'tn' }, label), tv,
        h('div', { class: 'row' }, inp, btn('Set', () => upd((s) => Core.timerAction(s, name, 'set', parseTime(inp.value))), 'sm'),
          btn('▶ Start', () => upd((s) => Core.timerAction(s, name, 'start')), 'sm acc'), btn('❚❚', () => upd((s) => Core.timerAction(s, name, 'pause')), 'sm'),
          btn('⟲', () => upd((s) => Core.timerAction(s, name, 'reset')), 'sm'), btn('+30s', () => upd((s) => Core.timerAction(s, name, 'add', 30)), 'sm'), btn('−30s', () => upd((s) => Core.timerAction(s, name, 'add', -30)), 'sm'))));
    });
    return h('div', { class: 'card' }, h('h3', {}, 'Timers'), wrap, h('p', { class: 'hint' }, 'Type minutes (e.g. 10) or mm:ss, press Set, then Start. Overlays count down on their own.'));
  }

  function callsCard() {
    const reason = h('input', { value: S().technical.reason, list: 'reasons' });
    const reasons = h('datalist', { id: 'reasons' }, ['TECHNICAL ISSUE', 'PLAYER DISCONNECT', 'SERVER ISSUE', 'GAME CRASH', 'LAG / CONNECTION', 'ADMIN REVIEW', 'EQUIPMENT PROBLEM'].map((r) => h('option', { value: r })));
    const callTo = (i) => upd((s) => {
      const t = s[gm()].teams[i]; if (t.timeouts > 0) t.timeouts--; s.tactical.team = i;
      Core.timerAction(s, 'tactical', 'reset'); Core.timerAction(s, 'tactical', 'start'); Core.setLive(s, gm(), 'tactical', true, s.ui.exclusive);
    });
    const tac = h('div', { class: 'row' }, ...[0, 1].map((i) => { const b = btn('', () => callTo(i), 'acc'); dyn(b, () => { b.textContent = 'Timeout: ' + teamName(i).toUpperCase(); }); return b; }),
      btn('End timeout', () => upd((s) => { Core.setLive(s, gm(), 'tactical', false); Core.timerAction(s, 'tactical', 'reset'); }), 'red'));
    const tech = h('div', { class: 'row' }, reason, reasons, btn('Start technical', () => upd((s) => {
      s.technical.reason = reason.value; Core.timerAction(s, 'technical', 'reset'); Core.timerAction(s, 'technical', 'start'); Core.setLive(s, gm(), 'technical', true, s.ui.exclusive);
    }), 'acc'), btn('End', () => upd((s) => { Core.setLive(s, gm(), 'technical', false); Core.timerAction(s, 'technical', 'reset'); }), 'red'));
    const bt = h('div', { class: 'grid2' }, field('Break title', 'breakInfo.title'), field('Up next text', 'breakInfo.next'));
    const titles = h('div', { class: 'row', style: 'margin-top:6px' }, ['BREAK', 'BE RIGHT BACK', 'MAP BREAK', 'HALF TIME', 'TECHNICAL BREAK', 'INTERVAL'].map((t) => btn(t, () => upd((s) => { s.breakInfo.title = t; }), 'sm')));
    const lt = h('div', { class: 'row' }, field('Lower third — name', 'lower.name'), field('Title', 'lower.title'), btn('Show', () => { upd((s) => Core.setLive(s, gm(), 'lowerthird', Date.now() + 8000, false)); }, 'acc'));
    const al = h('div', { class: 'row' }, field('Banner team', '~.alert.team', 'select-n', [[0, 'Team A'], [1, 'Team B']]), field('Title', '~.alert.title'), field('Sub text', '~.alert.sub'), btn('Show', () => upd((s) => Core.setLive(s, gm(), 'alert', true, false)), 'acc'), btn('Hide', () => upd((s) => Core.setLive(s, gm(), 'alert', false, false)), 'red'));
    const rp = h('div', { class: 'row' }, field('Replay tag text', 'replay.text'), btn('Show', () => upd((s) => Core.setLive(s, gm(), 'replay', Date.now() + 10000, false)), 'acc'));
    return h('div', { class: 'card' }, h('h3', {}, 'Timeouts, breaks & call-outs'), tac, h('div', { style: 'height:10px' }), tech, h('div', { style: 'height:12px' }), bt, titles,
      h('div', { style: 'height:12px' }), lt, h('div', { style: 'height:8px' }), al, h('div', { style: 'height:8px' }), rp);
  }

  /* ----- logo auto-crop (removes transparent / pure-white margins) ----- */
  function trimImage(img, always) {
    const w0 = img.width, h0 = img.height, src = document.createElement('canvas');
    src.width = w0; src.height = h0; const sx = src.getContext('2d', { willReadFrequently: true }); sx.drawImage(img, 0, 0);
    let x0 = w0, y0 = h0, x1 = 0, y1 = 0;
    try {
      const d = sx.getImageData(0, 0, w0, h0).data;
      for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) {
        const i = (y * w0 + x) * 4, a = d[i + 3];
        if (a > 16 && !(a > 240 && d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    } catch (e) { return always ? src.toDataURL('image/png') : null; }
    if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = w0 - 1; y1 = h0 - 1; }
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w0 - 1, x1 + pad); y1 = Math.min(h0 - 1, y1 + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    if (!always && cw > w0 * 0.9 && ch > h0 * 0.9) return null; // already tight
    const k = Math.min(1, 800 / Math.max(cw, ch)), c = document.createElement('canvas');
    c.width = Math.round(cw * k); c.height = Math.round(ch * k); c.getContext('2d').drawImage(img, x0, y0, cw, ch, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  /* crop logos that were uploaded before auto-crop existed (embedded images only) */
  function autoTrimLogos() {
    const paths = ['event.logo', 'cod.teams.0.logo', 'cod.teams.1.logo', 'fc.teams.0.logo', 'fc.teams.1.logo']
      .concat([0, 1, 2].map((i) => 'cod.podium.' + i + '.logo'), [0, 1, 2].map((i) => 'fc.podium.' + i + '.logo'));
    paths.forEach((p) => {
      const v = getPath(S(), p);
      if (!v || !v.startsWith('data:image')) return;
      const img = new Image();
      img.onload = () => { const out = trimImage(img, false); if (out) upd((s) => setPath(s, p, out)); };
      img.src = v;
    });
  }

  /* ----- SETUP column ----- */
  function logoPicker(path) {
    const prev = dyn(h('div', { class: 'lg' }), () => { const v = getPath(S(), P(path)); prev.style.backgroundImage = v ? 'url("' + v.replace(/"/g, '%22') + '")' : ''; });
    const url = h('input', { placeholder: 'Image URL / path (e.g. logos/team.png) or upload →' });
    binders.push({ el: url, path, type: 'text' });
    url.addEventListener('input', () => upd((s) => setPath(s, P(path), url.value)));
    const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    file.addEventListener('change', () => {
      const f = file.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          upd((s) => setPath(s, P(path), trimImage(img, true))); toast('Logo loaded & cropped');
        };
        img.src = r.result;
      };
      r.readAsDataURL(f);
    });
    return h('div', { class: 'row', style: 'flex-wrap:nowrap' }, prev, h('div', { style: 'flex:1' }, url), btn('Upload', () => file.click(), 'sm'), btn('Clear', () => upd((s) => setPath(s, P(path), '')), 'sm'), file);
  }

  /* ----- network cams: players and casters are separate lists, a source can only be used once ----- */
  const playerLabel = (ci) => {
    const c = Core.CAMS[gm()][ci], g = G(), nm = (g.teams[c.team].players[c.idx] || '').trim();
    return (gm() === 'cod' ? 'Team ' + (c.team ? 'B' : 'A') + ' player ' + (c.idx + 1) : 'Player ' + (c.team + 1)) + (nm ? ' (' + nm + ')' : '');
  };
  function ndiOwners() {   // source name -> who uses it now (this game's players + the casters)
    const o = {};
    Core.CAMS[gm()].forEach((c, ci) => { const n = ((G().camNdi || [])[ci] || '').trim(); if (n) o[n] = { kind: 'p', i: ci, label: playerLabel(ci) }; });
    S().stage.cams.forEach((c, i) => { if ((c.ndiName || '').trim()) o[c.ndiName] = { kind: 'c', i, label: 'Caster ' + (i + 1) + (c.name ? ' (' + c.name + ')' : '') }; });
    return o;
  }
  /* put `name` on a player cam (kind 'p') or a caster (kind 'c'); asks before taking it from somebody else */
  function assignNdi(kind, i, name, silent) {
    if (name) {
      const o = ndiOwners()[name];
      if (o && !(o.kind === kind && o.i === i) && !silent && !confirm('“' + name + '” is already used by ' + o.label + '.\nMove it here?')) return false;
    }
    upd((s) => {
      if (name) {   // free it from every other place first
        const g = s[gm()]; (g.camNdi || []).forEach((n, k) => { if (n === name) g.camNdi[k] = ''; });
        s.stage.cams.forEach((c) => { if (c.ndiName === name) c.ndiName = ''; });
      }
      if (kind === 'p') { const g = s[gm()]; if (!g.camNdi) g.camNdi = []; g.camNdi[i] = name; } else s.stage.cams[i].ndiName = name;
    });
    return true;
  }
  /* dropdown used for both: kind 'p' (player cam index) or 'c' (caster index) */
  function camDropdown(kind, i) {
    const cur = () => (kind === 'p' ? (G().camNdi || [])[i] : S().stage.cams[i].ndiName) || '', sel = h('select', {});
    const owners = ndiOwners(), list = ndiList.slice();
    if (cur() && !list.includes(cur())) list.push(cur());
    sel.append(h('option', { value: '' }, '— no cam —'));
    list.forEach((n) => { const o = owners[n]; sel.append(h('option', { value: n }, n + (o && !(o.kind === kind && o.i === i) ? '   · in use: ' + o.label : ''))); });
    sel.addEventListener('change', () => { if (!assignNdi(kind, i, sel.value)) sel.value = cur(); else build(); });
    dyn(sel, () => { if (document.activeElement !== sel) sel.value = cur(); });
    return sel;
  }
  const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const camSources = () => ndiList.filter((n) => !/vmix/i.test(n));   // hide vMix's own outputs

  /* PLAYER CAMS tab: one screen for every player cam, nothing about casters */
  function camsTab() {
    const g = gm(), wrap = h('div', {});
    const free = () => { const o = ndiOwners(); return camSources().filter((n) => !o[n] || o[n].kind === 'p').sort(naturalSort); };
    const setAll = (arr) => upd((s) => { s[g].camNdi = arr; });
    const blank = () => Core.CAMS[g].map(() => '');
    const autoColour = () => {   // names containing blue -> Team A, red -> Team B
      const used = new Set(S().stage.cams.map((c) => c.ndiName).filter(Boolean)), src = camSources().filter((n) => !used.has(n) && !/ptz/i.test(n)).sort(naturalSort);
      const per = g === 'cod' ? 4 : 1, a = src.filter((n) => /blue/i.test(n)), b = src.filter((n) => /red/i.test(n));
      if (!a.length && !b.length) { toast('No source names contain “blue” or “red” — use “Fill in order”'); return; }
      const out = blank(); a.slice(0, per).forEach((n, k) => { out[k] = n; }); b.slice(0, per).forEach((n, k) => { out[per + k] = n; });
      setAll(out); toast('Filled by name: ' + out.filter(Boolean).length + ' cam(s)');
    };
    const autoOrder = () => {
      const used = new Set(S().stage.cams.map((c) => c.ndiName).filter(Boolean)), src = camSources().filter((n) => !used.has(n) && !/ptz/i.test(n)).sort(naturalSort);
      const out = blank(); Core.CAMS[g].forEach((c, k) => { if (src[k]) out[k] = src[k]; }); setAll(out); toast('Filled in order: ' + out.filter(Boolean).length + ' cam(s)');
    };
    wrap.append(
      h('p', { class: 'hint' }, 'Face cams of the players only. Each source can be used once — if you pick one that a caster or another player already has, you are asked before it moves. Casters are set separately in the Casters tab.'),
      h('div', { class: 'row', style: 'margin-bottom:10px' }, btn('Scan network', () => scanNdi(false), 'sm acc'), btn('Fill by name (blue → A, red → B)', autoColour, 'sm'), btn('Fill in order', autoOrder, 'sm'),   // PTZ cams are left for the casters
        btn('Reset all player cams', () => { if (confirm('Clear every player cam assignment for this game?')) { setAll(blank()); toast('Player cams cleared'); } }, 'sm red')),
      h('small', { style: 'display:block;color:var(--muted);margin-bottom:8px' }, ndiStatus || (ndiList.length ? camSources().length + ' camera source(s) found on the network (vMix outputs are hidden).' : 'Click “Scan network” first. The NDI relay must be running (start-server.bat starts it).')));
    const tbl = h('table', {}, h('tr', {}, ['Cam', 'Who', 'Camera on the network', ''].map((x) => h('th', {}, x))));
    Core.CAMS[g].forEach((c, ci) => {
      const t = G().teams[c.team], tr = h('tr', {});
      dyn(tr, () => { tr.style.opacity = c.idx < G().cams ? 1 : .45; });
      tr.append(h('td', { style: 'font-weight:800' }, String(ci + 1)),
        h('td', {}, h('span', { style: 'display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:' + t.color }), playerLabel(ci)),
        h('td', {}, camDropdown('p', ci)), h('td', {}, btn('✕', () => { assignNdi('p', ci, '', true); build(); }, 'sm ghost')));
      tbl.append(tr);
    });
    wrap.append(tbl, h('p', { class: 'hint' }, 'Cam numbers are what the spectator keys 1–' + Core.CAMS[g].length + ' use. Dimmed rows are beyond “face cams per team” (top of the page) and are not shown.'));
    return wrap;
  }

  function teamsTab() {
    const cod = gm() === 'cod', wrap = h('div', {});
    [0, 1].forEach((i) => {
      const base = '~.teams.' + i;
      const card = h('div', { class: 'team' }, h('h4', {}, (cod ? 'TEAM ' : 'PLAYER ') + (i ? 'B (RIGHT)' : 'A (LEFT)')),
        h('div', { class: 'grid3' }, field(cod ? 'Team name' : 'Gamertag / name', base + '.name'), field('Tag (3-4 letters)', base + '.tag'), field('Color', base + '.color', 'color')),
        cod ? null : h('div', { style: 'margin-top:8px' }, field('Club / team (FC)', base + '.club')),
        h('div', { style: 'margin:10px 0 6px;font-size:11px;color:var(--muted);letter-spacing:1px' }, 'LOGO'), logoPicker(base + '.logo'),
        h('div', { style: 'margin:10px 0 6px;font-size:11px;color:var(--muted);letter-spacing:1px' }, cod ? 'PLAYERS (order = face cam slot 1-4)' : 'PLAYER NAME ON FACE CAM'),
        h('div', { class: cod ? 'grid2' : '' }, (cod ? [0, 1, 2, 3] : [0]).map((k) => field(cod ? 'Player ' + (k + 1) : 'Cam name', base + '.players.' + k))));
      dyn(card, () => card.style.setProperty('--c', G().teams[i].color));
      wrap.append(card);
    });
    return wrap;
  }

  function podiumTab() {
    const cod = gm() === 'cod', wrap = h('div', {});
    wrap.append(h('p', { class: 'hint' }, 'Used by the Champions and Podium overlays. Leave 1st / 2nd empty to use the match winner / runner-up automatically; fill 3rd (and anything else) by hand.'),
      h('div', { class: 'row', style: 'margin-bottom:10px' }, btn('Copy match winner → 1st, runner-up → 2nd', () => upd((s) => {
        const g = s[gm()], w = Core.winnerOf(g); if (w < 0) { return; }
        [[0, g.teams[w]], [1, g.teams[1 - w]]].forEach(([i, t]) => { Object.assign(g.podium[i], { name: t.name, tag: t.tag, club: t.club || '', color: t.color, logo: t.logo, players: t.players.slice() }); });
      }), 'sm acc'), btn('Clear podium', () => upd((s) => { s[gm()].podium.forEach((p) => Object.assign(p, { name: '', tag: '', club: '', logo: '', prize: '', players: p.players.map(() => '') })); }), 'sm')));
    ['1ST PLACE', '2ND PLACE', '3RD PLACE'].forEach((label, i) => {
      const base = '~.podium.' + i;
      const card = h('div', { class: 'team' }, h('h4', {}, label),
        h('div', { class: 'grid3' }, field(cod ? 'Team name' : 'Player name', base + '.name'), field('Tag', base + '.tag'), field('Color', base + '.color', 'color')),
        h('div', { class: 'grid2', style: 'margin-top:8px' }, cod ? null : field('Club', base + '.club'), field('Prize / note (e.g. $1,000)', base + '.prize')),
        h('div', { style: 'margin:10px 0 6px;font-size:11px;color:var(--muted);letter-spacing:1px' }, 'LOGO'), logoPicker(base + '.logo'),
        cod ? h('div', { class: 'grid2', style: 'margin-top:8px' }, [0, 1, 2, 3].map((k) => field('Player ' + (k + 1), base + '.players.' + k))) : null);
      dyn(card, () => card.style.setProperty('--c', G().podium[i].color));
      wrap.append(card);
    });
    return wrap;
  }

  function mapsTab() {
    if (gm() !== 'cod') return h('p', { class: 'hint' }, 'Maps apply to CoD only.');
    const modes = h('datalist', { id: 'modes' }, ['HARDPOINT', 'SEARCH & DESTROY', 'CONTROL', 'OVERLOAD', 'KILL CONFIRMED', 'DOMINATION'].map((m) => h('option', { value: m })));
    const wrap = h('div', {}, modes, h('div', { class: 'grid3' },
      field('Best of', 'cod.bo', 'select-n', [[1, 'BO1'], [3, 'BO3'], [5, 'BO5'], [7, 'BO7']]), field('Current map #', 'cod.mapIndex', 'select-n', [0, 1, 2, 3, 4, 5, 6].map((n) => [n, 'Map ' + (n + 1)]))));
    wrap.append(h('div', { style: 'margin-top:12px;font-size:11px;color:var(--muted);letter-spacing:1px' }, 'MODE · MAP NAME · PICKED BY · SCORES · WINNER'));
    for (let n = 0; n < 7; n++) {
      const b = 'cod.maps.' + n;
      const sel = (path, opts) => { const e = h('select', {}, opts.map((o) => h('option', { value: o[0] }, o[1]))); binders.push({ el: e, path, type: 'sel-n' }); e.addEventListener('change', () => upd((s) => setPath(s, path, e.value === '' ? null : parseInt(e.value, 10)))); return e; };
      const ni = (path) => { const e = h('input', { type: 'number' }); binders.push({ el: e, path, type: 'number' }); e.addEventListener('input', () => upd((s) => setPath(s, path, parseInt(e.value, 10) || 0))); return e; };
      const tx = (path, list) => { const e = h('input', { list }); bind(e, path, 'text'); return e; };
      const row = h('div', { class: 'maprow' }, h('b', {}, n + 1), tx(b + '.mode', 'modes'), tx(b + '.map'),
        sel(b + '.pick', [['', 'Decider'], [0, 'Team A'], [1, 'Team B']]), ni(b + '.scores.0'), ni(b + '.scores.1'), sel(b + '.winner', [['', '—'], [0, 'A won'], [1, 'B won']]));
      dyn(row, () => { row.style.display = n < G().bo ? '' : 'none'; row.style.opacity = n === G().mapIndex ? 1 : .75; });
      wrap.append(row);
    }
    wrap.append(h('p', { class: 'hint' }, 'Tip: the “MAP WIN” button in the live column fills winner/score for you and moves to the next map.'));
    return wrap;
  }

  function eventTab() {
    return h('div', {}, h('div', { class: 'grid2' }, field('Tournament name', 'event.name'), field('Season / edition', 'event.season'), field('Stage (GRAND FINAL, SEMI-FINAL…)', 'event.stage'), field('Sponsor text', 'event.sponsor')),
      h('div', { style: 'margin-top:10px' }, field('Ticker text (scrolls in bottom bar)', 'event.ticker')),
      h('div', { style: 'margin:10px 0 6px;font-size:11px;color:var(--muted);letter-spacing:1px' }, 'TOURNAMENT LOGO'), logoPicker('event.logo'),
      h('div', { class: 'row gap', style: 'margin-top:14px' },
        h('label', { class: 'row' }, bind(h('input', { type: 'checkbox' }), 'event.showCams', 'checkbox'), 'Show face-cam overlays (windows, frames, name plates) — off removes them everywhere'),
        h('label', { class: 'row' }, bind(h('input', { type: 'checkbox' }), 'ui.exclusive', 'checkbox'), 'Smart scene switching (full-screen scenes hide the HUD automatically)'),
        h('label', { class: 'row' }, bind(h('input', { type: 'checkbox' }), 'ui.noBg', 'checkbox'), 'Transparent mode — remove the full-screen backgrounds so only borders, frames, panels and text are drawn (use your own background / gameplay behind)'),
        h('label', { class: 'row' }, bind(h('input', { type: 'checkbox' }), 'ui.lite', 'checkbox'), 'Performance mode — lighter effects (no glows, beams or blur). Turn on if vMix or the PC struggles')),
      h('div', { style: 'margin-top:18px' }, btn('Reset EVERYTHING to defaults', () => { if (confirm('Reset all teams, scores and settings?')) { upd((s) => { const g = s.ui.game; Object.assign(s, Core.clone(Core.DEFAULTS)); s.ui.game = g; }); } }, 'red')));
  }

  function vmixTab() {
    const base = new URL('overlay.html', location.href).href;
    const baseInput = h('input', { value: base });
    const url = (id) => baseInput.value + '?game=' + gm() + '&scene=' + id;
    const allUrl = () => url('all');
    const elUrl = (id) => baseInput.value + '?game=' + gm() + '&el=' + id;
    const elementTable = () => {   // every overlay as its own link + the vMix input size to type in
      const t = h('table', {}, h('tr', {}, ['Overlay', 'Link (paste into the vMix browser input)', 'Input size', ''].map((x) => h('th', {}, x))));
      SCENES[gm()].forEach((m) => {
        const r = Core.elementRect(gm(), m.id), u = h('input', { readonly: true, value: elUrl(m.id) }); baseInput.addEventListener('input', () => { u.value = elUrl(m.id); });
        t.append(h('tr', {}, h('td', {}, h('b', {}, m.label)), h('td', {}, u), h('td', { style: 'white-space:nowrap;font-weight:700' }, r.w + ' × ' + r.h), h('td', {}, btn('Copy', () => copy(u.value), 'sm'))));
      });
      return t;
    };
    const copy = (txt) => { (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copied'), () => { prompt('Copy:', txt); }); };
    const tbl = h('table', {}, h('tr', {}, h('th', {}, 'vMix input'), h('th', {}, 'URL'), h('th', {})));
    SCENES[gm()].forEach((m) => {
      const u = h('input', { readonly: true, value: url(m.id) }); baseInput.addEventListener('input', () => { u.value = url(m.id); });
      tbl.append(h('tr', {}, h('td', {}, h('b', {}, m.label), h('div', { style: 'color:var(--muted);font-size:11px' }, m.type === 'base' ? 'BASE layer (opaque)' : 'Overlay / transparent')), h('td', {}, u), h('td', {}, btn('Copy', () => copy(u.value), 'sm'))));
    });
    const cams = Core.camsFor(gm(), Object.assign({}, G(), { spot: 0 }));
    const ct = h('table', {}, h('tr', {}, ['Layer', 'X', 'Y', 'W', 'H', 'Zoom', 'Pan X', 'Pan Y'].map((x) => h('th', {}, x))));
    const rows = [{ n: 'Gameplay (full screen)', x: 0, y: 0, w: 1920, h: 1080 }].concat(cams.map((c) => ({ n: (G().teams[c.team].name || 'Team') + ' · cam ' + (c.idx + 1), x: c.x, y: c.y, w: c.w, h: c.h })));
    rows.forEach((r) => {
      const z = r.w / 1920, px = ((r.x + r.w / 2) - 960) / 960, py = ((r.y + r.h / 2) - 540) / 540;
      ct.append(h('tr', {}, h('td', {}, r.n), [r.x, r.y, r.w, r.h].map((v) => h('td', {}, v)), h('td', {}, z.toFixed(4)), h('td', {}, px.toFixed(4)), h('td', {}, py.toFixed(4))));
    });
    const api = location.protocol.startsWith('http') ? location.origin : 'http://localhost:8080';
    return h('div', {},
      h('div', { class: 'card', style: 'background:var(--card2);border-color:var(--acc)' }, h('h3', {}, 'ONE input for everything (recommended — much lighter on vMix)'),
        h('p', { class: 'hint', style: 'margin-top:0' }, 'A single browser input that shows every scene, but only builds the ones that are on screen. Replace all the separate scene inputs with this one.'),
        h('div', { class: 'row', style: 'flex-wrap:nowrap' }, h('input', { readonly: true, value: allUrl() }), btn('Copy', () => copy(allUrl()), 'sm acc')),
        h('ol', {},
          h('li', {}, 'vMix → Add Input → Web Browser. Paste the URL above. Width ', h('b', {}, '1920'), ', height ', h('b', {}, '1080'), ', tick ', h('b', {}, 'Transparent Background'), ', frame rate ', h('b', {}, '30'), ' (60 only if your PC is strong).'),
          h('li', {}, 'Put this input on an ', h('b', {}, 'Overlay channel'), ' (e.g. Overlay 1) above your gameplay. Leave it ON for the whole show — scenes appear and disappear when you click them in this panel.'),
          h('li', {}, 'Close / delete the old per-scene browser inputs. Keep the cam layers and the gameplay as they are.'),
          h('li', {}, 'Still too heavy? Turn on ', h('b', {}, 'Performance mode'), ' in the Event tab (no glows, blur or beams), or add ', h('code', {}, '&lite=1'), ' to the URL. You can also split it in two: one input with ', h('code', {}, 'scene=hud'), ' and one with ', h('code', {}, 'scene=all'), '.'))),
      h('div', { class: 'card', style: 'background:var(--card2);border-color:var(--acc);margin-top:12px' }, h('h3', {}, 'SEPARATE OVERLAYS — one browser input each, move & resize them in vMix'),
        h('p', { class: 'hint', style: 'margin-top:0' }, 'Each overlay below is its own link on a tight, transparent canvas. In vMix: Add Input → Web Browser → paste the link → set Width × Height to the size shown → tick Transparent. Then it is a normal layer: drag it, scale it, crop it. It shows and hides when you click its button in the Scenes list (or add ', h('code', {}, '&force=1'), ' to keep it always on).'),
        elementTable(), h('small', { style: 'color:var(--muted)' }, 'Overlays marked 1920×1080 are full-screen designs with the background removed — shrink or move them with the layer in vMix. “Team A / B cams” already include the camera picture.')),
      h('div', { class: 'card', style: 'background:var(--card2);margin-top:12px' }, h('h3', {}, 'Only the borders / overlays — transparent, no full-screen background'),
        h('p', { class: 'hint', style: 'margin-top:0' }, 'Full-screen scenes normally bring their own animated background. For just the pieces (frames, plates, panels, text) on a transparent layer:'),
        h('div', { class: 'row', style: 'flex-wrap:nowrap;margin-bottom:6px' }, h('input', { readonly: true, value: allUrl() + '&nobg=1' }), btn('Copy', () => copy(allUrl() + '&nobg=1'), 'sm acc')),
        h('small', { style: 'color:var(--muted)' }, 'All scenes, transparent (add ', h('code', {}, '&nobg=1'), ' to any URL, or tick Transparent mode in the Event tab).'),
        h('div', { class: 'row', style: 'flex-wrap:nowrap;margin:10px 0 6px' }, h('input', { readonly: true, value: url('camborders') }), btn('Copy', () => copy(url('camborders')), 'sm acc')),
        h('small', { style: 'color:var(--muted)' }, 'Only the face-cam frames + name plates (a separate layer you can place above your cams).')),
      h('div', { class: 'card', style: 'background:var(--card2);margin-top:12px' }, h('h3', {}, 'Always'), h('ol', {},
        h('li', {}, 'Double-click ', h('code', {}, 'start-server.bat'), ' (nothing to install) and keep this panel tab open during the show.'),
        h('li', {}, h('b', {}, 'Gameplay is full screen:'), ' your game capture is the base input; add any cam layers on top of it (positions in the table at the bottom). Full-screen scenes leave transparent windows over the cams.'))),
      h('h3', { style: 'margin-top:14px;color:var(--muted);font-size:12px;letter-spacing:2px' }, 'BASE URL'), baseInput,
      h('h3', { style: 'margin-top:14px;color:var(--muted);font-size:12px;letter-spacing:2px' }, 'ADVANCED — ONE INPUT PER SCENE (heavier; only if you need a scene on its own layer)'), tbl,
      h('h3', { style: 'margin-top:14px;color:var(--muted);font-size:12px;letter-spacing:2px' }, 'GAMEPLAY + FACE-CAM POSITIONS (vMix Layers → Position)'), ct,
      h('p', { class: 'hint' }, 'Easiest way: in the layer’s Position tab choose the input and either type Zoom/Pan from this table, or drag-resize in the preview. All numbers assume a 1920×1080 canvas.'),
      h('h3', { style: 'margin-top:14px;color:var(--muted);font-size:12px;letter-spacing:2px' }, 'HTTP TRIGGERS (Stream Deck / vMix Shortcuts / Bitfocus Companion)'),
      h('div', { html: '<ul>' + [
        '/api/live?game=' + gm() + '&scene=hud&on=toggle', '/api/live?game=' + gm() + '&scene=break&on=1', '/api/score?game=' + gm() + '&team=0&delta=1',
        '/api/timer?name=break&action=start', '/api/timer?name=break&action=set&secs=600', '/api/hideall?game=' + gm()].map((p) => '<li><code>' + api + p + '</code></li>').join('') + '</ul>' }));
  }

  /* ----- Colors tab: global theme + per-overlay overrides ----- */
  const COLOR_FIELDS = [['accent', 'Accent', 'themeAccent'], ['accent2', 'Accent 2', 'themeAccent2'], ['bg', 'Background', 'themeBg'], ['panel', 'Panels', 'themePanel'], ['text', 'Text', 'themeText']];
  function colorsTab() {
    const def = () => Core.THEME_DEFAULTS[gm()];
    const grid = h('div', { class: 'colgrid' });
    COLOR_FIELDS.forEach(([k, label, ev]) => {
      const inp = h('input', { type: 'color' });
      dyn(inp, () => { inp.classList.toggle('ov', !!S().event[ev]); if (document.activeElement !== inp) inp.value = S().event[ev] || def()[k]; });
      inp.addEventListener('input', () => upd((s) => { s.event[ev] = inp.value; if (k === 'accent') s.event.themeAccent2 = s.event.themeAccent2 || ''; }));
      grid.append(h('label', { class: 'f' }, label, h('div', { class: 'row', style: 'flex-wrap:nowrap' }, inp, btn('✕', () => upd((s) => { s.event[ev] = ''; }), 'sm ghost'))));
    });
    const tbl = h('table', { class: 'coltbl' }, h('tr', {}, h('th', {}, 'Overlay'), COLOR_FIELDS.map(([, l]) => h('th', {}, l)), h('th', {})));
    SCENES[gm()].forEach((m) => {
      const key = gm() + '.' + m.id, tr = h('tr', {}, h('td', {}, m.label));
      COLOR_FIELDS.forEach(([k, , ev]) => {
        const inp = h('input', { type: 'color' });
        dyn(inp, () => {
          const o = (S().event.sceneTheme || {})[key] || {};
          inp.classList.toggle('ov', !!o[k]);
          if (document.activeElement !== inp) inp.value = o[k] || S().event[ev] || def()[k];
        });
        inp.addEventListener('input', () => upd((s) => { s.event.sceneTheme = s.event.sceneTheme || {}; (s.event.sceneTheme[key] = s.event.sceneTheme[key] || {})[k] = inp.value; }));
        tr.append(h('td', {}, inp));
      });
      tr.append(h('td', {}, btn('Reset', () => upd((s) => { if (s.event.sceneTheme) delete s.event.sceneTheme[key]; }), 'sm ghost')));
      tbl.append(tr);
    });
    return h('div', {},
      h('h3', { style: 'margin:0 0 8px;color:var(--muted);font-size:12px;letter-spacing:2px' }, 'ALL OVERLAYS (both games)'), grid,
      h('p', { class: 'hint' }, 'Dots in the header set the accent quickly. ✕ goes back to each game’s default. Team colours (logos, score boxes, name underlines) are set per team in the Teams tab.'),
      h('h3', { style: 'margin:16px 0 8px;color:var(--muted);font-size:12px;letter-spacing:2px' }, 'EACH OVERLAY — ' + (gm() === 'cod' ? 'CoD MW4' : 'FC 27')), tbl,
      h('p', { class: 'hint' }, 'A highlighted box is an override for that overlay only; the others follow the settings above.'),
      h('div', { style: 'margin-top:10px' }, btn('Reset ALL colors to default', () => { if (confirm('Reset every color setting?')) upd((s) => { Object.assign(s.event, { themeAccent: '', themeAccent2: '', themeBg: '', themePanel: '', themeText: '', sceneTheme: {} }); }); }, 'red')));
  }

  function setupCard() {
    const tabs = [['teams', gm() === 'cod' ? 'Teams' : 'Players'], ['maps', 'Maps'], ['podium', 'Podium'], ['cams', 'Player cams'], ['stage', 'Casters'], ['colors', 'Colors'], ['remote', 'Remote'], ['event', 'Event'], ['vmix', 'vMix setup']].filter((t) => !(t[0] === 'maps' && gm() !== 'cod'));
    const body = h('div', {});
    const bar = h('div', { class: 'tabs' }, tabs.map(([id, label]) => h('button', { class: id === tab ? 'on' : '', onclick: () => { tab = id; build(); } }, label)));
    const render = { teams: teamsTab, maps: mapsTab, podium: podiumTab, cams: camsTab, colors: colorsTab, stage: stageTab, remote: remoteTab, event: eventTab, vmix: vmixTab };
    if (!render[tab] || (tab === 'maps' && gm() !== 'cod')) tab = 'teams';
    body.append(render[tab]());
    return h('div', { class: 'card' }, bar, body);
  }

  /* ----- theme colour (applies to every overlay, both games) ----- */
  const PRESETS = [['#ffb21a', 'Amber'], ['#00f08c', 'Green'], ['#e4202f', 'Arena red'], ['#19b5ff', 'Blue'], ['#9b5cff', 'Purple'], ['#ff3d8b', 'Pink'], ['#f2f5fa', 'White']];
  const setTheme = (c) => upd((s) => { s.event.themeAccent = c; s.event.themeAccent2 = ''; });
  function buildTheme() {
    const box = document.getElementById('theme'); box.innerHTML = '';
    box.append(h('span', {}, 'THEME'));
    PRESETS.forEach(([c, name]) => {
      const b = h('button', { class: 'sw', title: name, style: '--c:' + c, onclick: () => setTheme(c) });
      dyn(b, () => b.classList.toggle('on', (S().event.themeAccent || '').toLowerCase() === c));
      box.append(b);
    });
    const pick = h('input', { type: 'color', title: 'Custom colour', value: '#ffb21a' });
    pick.addEventListener('input', () => setTheme(pick.value));
    dyn(pick, () => { if (document.activeElement !== pick && S().event.themeAccent) pick.value = S().event.themeAccent; });
    box.append(pick, btn('Default', () => setTheme(''), 'sm ghost'));
  }

  /* ----- spectate: focus one face cam ----- */
  const camName = (c) => (G().teams[c.team].players[c.idx] || ('P' + (c.idx + 1))).toUpperCase().slice(0, 9);
  function spotCard() {
    const row = h('div', { class: 'row', style: 'gap:6px' });
    const mk = (n, label) => {
      const b = h('button', { class: 'nb2', onclick: () => upd((s) => { s[gm()].spot = n; }) }, label);
      dyn(b, () => {
        b.classList.toggle('on', (G().spot || 0) === n);
        if (n > 0) { const c = Core.CAMS[gm()][n - 1]; b.textContent = n + ' · ' + camName(c); b.style.borderLeftColor = G().teams[c.team].color; b.style.opacity = c.idx < G().cams ? 1 : .4; }
      });
      return b;
    };
    row.append(mk(0, '0 · ALL CAMS'));
    Core.CAMS[gm()].forEach((c, i) => row.append(mk(i + 1, String(i + 1))));
    return h('div', { class: 'card' }, h('h3', {}, 'Spectate — face cam focus',
      h('span', { style: 'text-transform:none;letter-spacing:0;font-weight:400' }, 'keys 1-' + Core.CAMS[gm()].length + ' · 0 = all')), row,
      h('p', { class: 'hint' }, 'Shows only that player’s face cam and hides the rest. The picked cam grows and glides to the bottom centre; 0 brings them all back. Works with the keyboard when this panel is focused, or from the spectator PC with spectator-hotkeys.bat (see the Remote tab).'));
  }

  document.addEventListener('keydown', (e) => {
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.altKey || e.metaKey) return;
    if (/^[0-9]$/.test(e.key)) { const n = +e.key; if (n <= Core.CAMS[gm()].length) { upd((s) => { s[gm()].spot = n; }); e.preventDefault(); } }
  });

  /* NDI sources found on the network by ndi-relay (port 8089 on this PC) */
  let ndiList = [], ndiStatus = '';
  const relayUrl = () => location.protocol + '//' + location.hostname + ':' + (S().stage.relayPort || 8089);
  async function scanNdi(quiet) {
    try {
      const j = await (await fetch(relayUrl() + '/sources', { cache: 'no-store' })).json();
      ndiList = j.sources || []; ndiStatus = j.ok ? '' : j.status;
      if (!quiet) toast(j.ok ? ndiList.length + ' NDI source(s) found' : j.status);
    } catch (e) { ndiList = []; ndiStatus = 'NDI relay is not running — double-click start-ndi-relay.bat'; if (!quiet) toast(ndiStatus); }
    build();
  }
  function stageTab() {
    const wrap = h('div', {});
    const countBtns = h('div', { class: 'row', style: 'gap:6px' }, [1, 2, 3].map((n) => { const b = h('button', { class: 'nb2', onclick: () => upd((s) => { s.stage.count = n; }) }, n + (n === 1 ? ' caster' : ' casters')); dyn(b, () => b.classList.toggle('on', S().stage.count === n)); return b; }));
    wrap.append(
      h('p', { class: 'hint' }, 'Casters / desk cams only — the players’ cams are in the Player cams tab. Pick each caster’s camera from the network. Then turn on “Stage / Desk Cams” for a full-screen desk shot, or “Desk Cam (corner)” to show one caster over the game.'),
      h('div', { class: 'row', style: 'margin:6px 0' }, btn('Scan network', () => scanNdi(false), 'sm acc'),
        btn('Reset casters’ cams', () => { if (confirm('Clear the three casters’ camera assignments?')) { upd((s) => { s.stage.cams.forEach((c) => { c.ndiName = ''; }); }); build(); toast('Casters’ cams cleared'); } }, 'sm red'),
        h('small', { style: 'color:var(--muted)' }, ndiStatus || (ndiList.length ? camSources().length + ' camera source(s) found (vMix outputs hidden).' : 'Click “Scan network” first. The NDI relay must be running (start-server.bat starts it).'))),
      h('div', { style: 'font-size:11px;color:var(--muted);letter-spacing:1px;margin:6px 0' }, 'CASTERS IN THE DESK SHOT'), countBtns,
      h('div', { class: 'grid2', style: 'margin-top:10px' }, field('Caption under the desk shot', 'stage.title'), field('Caster shown in the corner window', 'stage.pipCam', 'select-n', [[0, 'Caster 1'], [1, 'Caster 2'], [2, 'Caster 3']])));
    [0, 1, 2].forEach((i) => {
      wrap.append(h('div', { class: 'team', style: '--c:var(--acc)' }, h('h4', {}, 'CASTER ' + (i + 1)),
        h('div', { class: 'grid3' }, field('Name on screen', 'stage.cams.' + i + '.name'), field('Role (e.g. PLAY-BY-PLAY)', 'stage.cams.' + i + '.role'),
          h('label', { class: 'f' }, 'Caster camera (NDI)', h('div', { class: 'row', style: 'flex-wrap:nowrap;gap:4px' }, h('div', { style: 'flex:1;min-width:0' }, camDropdown('c', i)), btn('✕', () => { assignNdi('c', i, '', true); build(); }, 'sm ghost'))))));
    });
    return wrap;
  }

  /* ----- Remote: run the show from another PC (even on another VLAN) ----- */
  function remoteTab() {
    const g = gm(), here = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const wrap = h('div', {});
    wrap.append(
      h('p', { class: 'hint' }, 'Everything is controlled through this web panel, so any PC that can reach the vMix PC can run it — including a PC on another VLAN. The cams, frames and animations stay on the vMix PC; the remote PC only sends clicks and key presses.'),
      h('div', { class: 'card', style: 'background:var(--card2)' }, h('h3', {}, 'Open the panel from another PC'), h('ol', {},
        h('li', {}, 'On the vMix PC: right-click ', h('code', {}, 'allow-network.bat'), ' → Run as administrator (once), then restart ', h('code', {}, 'start-server.bat'), '. The server window shows “Network access: ON” and this PC’s IP address.'),
        h('li', {}, 'On the other PC open ', h('code', {}, 'http://<vMix PC IP>:8080/control.html'), here ? '' : ' (you are using this now)', '. Everything works the same: scenes, scores, timers, cam focus, cam assignment.'),
        h('li', {}, 'Different VLAN: ask whoever manages the network to allow ', h('b', {}, 'TCP 8080 and 8089'), ' from that VLAN to the vMix PC (firewall / ACL / inter-VLAN routing). Nothing else is needed. Use the IP address, not the PC name.'),
        h('li', {}, 'Recommended on a shared network: set an access code — create the text file ', h('code', {}, 'data\\pin.txt'), ' next to ', h('code', {}, 'server.ps1'), ' containing a code, restart the server. Other PCs will be asked for it once; the vMix PC itself never is.'))),
      h('div', { class: 'card', style: 'background:var(--card2);margin-top:14px' }, h('h3', {}, 'Cam focus keys from the spectator PC'), h('ol', {},
        h('li', {}, 'On the spectator PC copy the ', h('code', {}, 'tournament-overlays'), ' folder and double-click ', h('code', {}, 'spectator-hotkeys.bat'), ' — enter the vMix PC address (example 10.20.0.15:8080), the game, and the access code if you set one.'),
        h('li', {}, 'Press ', h('b', {}, '1–' + Core.CAMS[g].length), ' (or numpad) to show only that player’s cam (it grows and slides to the bottom centre) and ', h('b', {}, '0'), ' to bring all cams back. The keys still reach the game.'),
        h('li', {}, 'Keep one control panel open (on any PC): it applies the key presses. Cams are numbered ', g === 'cod' ? 'Team A players 1-4, then Team B players 1-4.' : 'player 1, player 2.'))),
      h('p', { class: 'hint' }, 'The key helper only reads the number keys (it never blocks them). For strict anti-cheat games you can call ', h('code', {}, '/api/spot?game=' + g + '&n=1&pin=…'), ' from a Stream Deck or macro keyboard instead.'));
    return wrap;
  }

  /* ----- number of face cams (per team; CoD 0-4, FC 0-1) ----- */
  function buildCamSel() {
    const box = document.getElementById('camsel'); box.innerHTML = '';
    box.append(h('span', {}, gm() === 'cod' ? 'FACE CAMS / TEAM' : 'FACE CAMS'));
    const max = gm() === 'cod' ? 4 : 1;
    for (let n = 0; n <= max; n++) {
      const b = h('button', { class: 'nb', title: n === 0 ? 'No face cams' : n + ' face cam' + (n > 1 ? 's' : '') + (gm() === 'cod' ? ' per team' : ' per player'), onclick: () => upd((s) => { s[gm()].cams = n; }) }, String(n));
      dyn(b, () => b.classList.toggle('on', G().cams === n));
      box.append(b);
    }
  }

  /* ----- build / refresh ----- */
  function build() {
    binders = []; dyns = []; builtGame = gm();
    document.body.classList.toggle('fc', gm() === 'fc');
    const gsw = document.getElementById('gsw'); gsw.innerHTML = '';
    [['cod', 'CoD MW4 · 4v4'], ['fc', 'FC 27 · 1v1']].forEach(([id, label]) => gsw.append(h('button', { class: gm() === id ? 'on' : '', onclick: () => upd((s) => { s.ui.game = id; }) }, label)));
    document.getElementById('previewLink').href = 'preview.html?game=' + gm();
    buildTheme(); buildCamSel();
    app.innerHTML = '';
    app.append(h('div', { class: 'col' }, scenesCard(), spotCard(), scoreCard(), timersCard(), callsCard()), h('div', { class: 'col' }, setupCard()));
    refresh();
  }
  function refresh() {
    document.body.style.setProperty('--acc', S().event.themeAccent || (gm() === 'fc' ? '#00f08c' : '#ffb21a'));
    syncBinders(); dyns.forEach((d) => { try { d.fn(); } catch (e) { /* ignore */ } });
    const st = document.getElementById('status');
    st.textContent = Store.mode === 'server' ? '● Server connected' : '● Local mode (no server)'; st.className = 'pill' + (Store.mode === 'server' ? ' ok' : '');
    st.title = Store.mode === 'server' ? 'Overlays in vMix update instantly' : 'Run start-server.bat so separate vMix browser inputs stay in sync';
    if (Store.mode === 'server' && Store.online === false) { st.textContent = '● Server not responding'; st.className = 'pill'; }
  }

  /* HTTP trigger commands (Stream Deck etc.) are queued by the server and applied here */
  let cmdSeq = null;
  async function pollCommands() {
    if (Store.mode !== 'server') return;
    try {
      const list = await (await fetch('/api/cmds?after=' + (cmdSeq == null ? -1 : cmdSeq), { cache: 'no-store' })).json();
      const max = list.reduce((m, c) => Math.max(m, c.seq), cmdSeq == null ? 0 : cmdSeq);
      if (cmdSeq != null && list.length) upd((s) => list.forEach((c) => Core.applyCommand(s, c.name, c.q)));
      cmdSeq = max;
    } catch (e) { /* server busy */ }
  }

  Store.on((s, ext) => { if (builtGame !== s.ui.game) build(); else refresh(); });
  Store.init().then(() => {
    if (Store.mode === 'server') Store.push();
    build(); autoTrimLogos(); scanNdi(true);
    setInterval(() => { dyns.forEach((d) => { try { d.fn(); } catch (e) { /* ignore */ } }); }, 250);
    setInterval(pollCommands, 300);
  });
})();
