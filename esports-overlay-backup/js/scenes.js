/* Scene renderers: each returns an HTML string for (state, game). Animations are pure CSS driven by the .on class. */
(function (root) {
  'use strict';
  const { esc, CAMS, GAME_RECT, teamTag, winnerOf, camsFor, stageRects, STAGE_PIP, SPOT_SCALE } = root.Core;

  const A = (i, c) => `class="a ${c || ''}" style="--i:${i}"`;
  const up = (s) => esc(String(s || '').toUpperCase());

  function logo(t, cls) {
    const inner = t.logo ? `<img src="${esc(t.logo)}" alt="">` : `<span>${esc(teamTag(t))}</span>`;
    return `<div class="logo ${cls || ''} ${t.logo ? 'has-img' : 'mono'}" style="--c:${esc(t.color)}">${inner}</div>`;
  }
  const pips = (g, i) => {
    const need = Math.ceil((g.bo || 1) / 2); let h = '';
    for (let k = 0; k < need; k++) h += `<i class="pip${k < g.wins[i] ? ' on' : ''}"></i>`;
    return `<span class="pips">${h}</span>`;
  };
  const dots = (n) => { let h = ''; for (let k = 0; k < Math.max(0, Math.min(5, n | 0)); k++) h += '<i class="dot"></i>'; return h; };
  const mapLine = (g) => (g.maps ? g.maps[g.mapIndex] || g.maps[0] : null);

  /* Full screen background with transparent cam windows */
  function holePath(game, s) {
    if (!s.event.showCams) return '';
    const r = camsFor(game, s[game]).map((c) => `M${c.x} ${c.y}H${c.x + c.w}V${c.y + c.h}H${c.x}Z`).join('');
    return `clip-path:path(evenodd,'M0 0H1920V1080H0Z ${r}')`;
  }
  const bgfx = (g) => `<div class="bgfx"><i class="glow ga" style="--c:${esc(g.teams[0].color)}"></i><i class="glow gb" style="--c:${esc(g.teams[1].color)}"></i><i class="grid"></i><i class="beam b1"></i><i class="beam b2"></i><i class="beam b3"></i><i class="vig"></i></div>`;
  const fsbg = (game, s, g, cams) => `<div class="fsbg" style="${cams ? holePath(game, s) : ''}">${bgfx(g)}</div>`;

  /* Cam name plates + frames (+ FC player cards) */
  function camLayer(game, s, g, cards, override) {
    let h = '';
    (s.event.showCams ? (override || camsFor(game, g)) : []).forEach((c, n) => {
      const t = g.teams[c.team]; const name = t.players[c.idx] || '';
      const side = c.team === 0 ? 'l' : 'r';
      // a network NDI cam assigned to this player: its picture is drawn inside the frame
      const ci = CAMS[game].findIndex((x) => x.team === c.team && x.idx === c.idx), ndi = ((g.camNdi || [])[ci] || '').trim();
      if (ndi && location.protocol.startsWith('http')) {
        h += `<img class="stvideo a z" data-cam="${c.team}-${c.idx}-v" data-src="${esc(location.protocol + '//' + location.hostname + ':' + (((s.stage || {}).relayPort || 8089) + (ci % 4)))}/stream?name=${encodeURIComponent(ndi)}&w=640&fps=20" alt="" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;--i:${n % 4 + 1}">`;
      }
      h += `<div class="camframe a z" data-cam="${c.team}-${c.idx}-f" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;--c:${esc(t.color)};--i:${n % 4 + 1}"><i></i><i></i><i></i><i></i></div>`;
      h += `<div class="camplate a ${side}" data-cam="${c.team}-${c.idx}-p" style="left:${c.x}px;top:${c.y + c.h - 28}px;width:${c.w}px;--c:${esc(t.color)};--i:${n % 4 + 2}"><em>${game === 'cod' ? c.idx + 1 : 'P' + (c.team + 1)}</em><b>${up(name)}</b>${game === 'cod' ? `<span>${esc(teamTag(t))}</span>` : ''}</div>`;
    });
    if (cards && game === 'fc') {
      [0, 1].forEach((i) => {
        const t = g.teams[i]; const x = i === 0 ? 0 : 1600;
        h += `<div class="fccard a ${i === 0 ? 'l' : 'r'}" style="left:${x}px;top:366px;--c:${esc(t.color)};--i:3">
          ${logo(t, 'xl')}<div class="fcn">${up(t.name)}</div><div class="fcc">${up(t.club)}</div>
          <div class="fcs" data-pop="fcs${i}">${g.score[i]}</div><div class="fcl">GOALS</div>${pips(g, i)}</div>`;
      });
    }
    return h;
  }

  function gamebox() {
    const r = GAME_RECT;
    return `<div class="gamebox a z" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--i:1"><i></i><i></i><i></i><i></i><b></b></div>`;
  }

  /* Scorebug shared by hud + scorebug */
  function scorebug(game, s, g) {
    const [a, b] = g.teams; const m = mapLine(g);
    const side = (t, i) => `<div class="sb-side ${i ? 'sb-b' : 'sb-a'}" style="--c:${esc(t.color)}">
        <div class="sb-logo">${logo(t, 'sm')}</div>
        <div class="sb-nm"><b>${up(t.name)}</b><small>${game === 'cod' ? `<span class="tos">${dots(t.timeouts)}</span> ${pips(g, i)}` : `${up(t.club)} ${pips(g, i)}`}</small></div>
        <div class="sb-sc" data-pop="sc${i}">${g.score[i]}</div></div>`;
    return `<div class="sb a u" style="--i:1">${side(a, 0)}${sbMid(game, g)}${side(b, 1)}</div>
      ${g.showStrip === false ? '' : sbStrip(game, s, g)}`;
  }
  /* the centre block (map / match clock) and the info strip, reused by the stand-alone overlays */
  function sbMid(game, g) {
    const m = mapLine(g);
    return game === 'cod'
      ? `<div class="sb-mid"><div class="sb-mode">${up(m.mode)}</div><div class="sb-map">${up(m.map)}</div><div class="sb-meta">MAP ${g.mapIndex + 1} <u></u> BO${g.bo}</div></div>`
      : `<div class="sb-mid"><div class="sb-clock" data-clock>00:00</div><div class="sb-per">${up(g.period)}</div><div class="sb-meta">BEST OF ${g.bo}</div></div>`;
  }
  function sbStrip(game, s, g) {
    const m = mapLine(g);
    return `<div class="sb-strip a u" style="--i:3"><span>${up(s.event.name)}</span><u></u><span>${up(s.event.stage)}</span>${game === 'cod' ? `<u></u><span>${up(m.mode)} · ${up(m.map)}</span>` : ''}</div>`;
  }

  function bottombar(s) {
    const t = up(s.event.ticker);
    return `<div class="hb"><div class="hb-line a w" style="--i:2"></div>
      <div class="hb-brand a l" style="--i:3">${s.event.logo ? `<img src="${esc(s.event.logo)}" alt="">` : `<i class="evmark"></i><div><b>${up(s.event.name)}</b><small>${up(s.event.season)}</small></div>`}</div>
      <div class="hb-ticker a" style="--i:4"><div class="tk"><span>${t}</span><span>${t}</span></div></div>
      <div class="hb-side a r" style="--i:3"><b>${up(s.event.sponsor)}</b><small data-now>--:--</small></div></div>`;
  }

  const eventHead = (s) => s.event.logo
    ? `<div class="evhead logo-only"><img src="${esc(s.event.logo)}" alt=""><small>${up(s.event.season)} · ${up(s.event.stage)}</small></div>`
    : `<div class="evhead"><i class="evmark"></i><div><b>${up(s.event.name)}</b><small>${up(s.event.season)} · ${up(s.event.stage)}</small></div></div>`;
  /* one fixed spot for the event logo on every full-screen overlay: top centre, same size */
  const evTop = (s) => `<div class="evtop a u" style="--i:1">${eventHead(s)}</div>`;
  const vsRow =(g, big) => `<div class="vs ${big ? 'big' : ''}">
      <div class="vt" style="--c:${esc(g.teams[0].color)}">${logo(g.teams[0], big ? 'xxl' : 'lg')}<b>${up(g.teams[0].name)}</b></div>
      <div class="vsm"><span>VS</span></div>
      <div class="vt" style="--c:${esc(g.teams[1].color)}">${logo(g.teams[1], big ? 'xxl' : 'lg')}<b>${up(g.teams[1].name)}</b></div></div>`;
  const timerBlock = (name, cls) => `<div class="tm ${cls || ''}"><div class="tmv" data-timer="${name}">00:00</div><div class="tbar"><i data-tbar="${name}"></i></div></div>`;

  function mapRows(g, game) {
    return g.maps.slice(0, g.bo).map((m, i) => {
      const w = m.winner; const live = i === g.mapIndex && w == null;
      const wt = w != null ? g.teams[w] : null;
      return `<div class="mr a ${live ? 'live' : ''}" style="--i:${i + 3};--c:${wt ? esc(wt.color) : 'var(--accent)'}">
        <em>${i + 1}</em><div class="mrm"><b>${up(m.mode)}</b><small>${up(m.map)}</small></div>
        <div class="mrs"><span>${m.scores[0]}</span><u>-</u><span>${m.scores[1]}</span></div>
        <div class="mrw">${wt ? logo(wt, 'xs') + '<small>' + up(wt.tag || wt.name) + '</small>' : (live ? '<small class="lv">LIVE</small>' : '<small>—</small>')}</div></div>`;
    }).join('');
  }

  /* ---------- Celebration FX: spotlights, fireworks, sparkles, confetti ---------- */
  const rnd = (n, k) => { const x = Math.sin(n * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  function celebrate(on, color) {
    if (!on) return '';
    const bursts = [[340, 300, '--fc:#ffd24a', 0], [1580, 260, '--fc:var(--accent)', .9], [960, 200, '--fc:#fff', 1.7], [520, 640, '--fc:var(--accent2)', 2.3], [1400, 660, '--fc:#ffd24a', 3.0]];
    const fw = bursts.map(([x, y, c, d]) => `<div class="fw" style="left:${x}px;top:${y}px;${c};--d:${d}s">${Array.from({ length: 16 }, (_, k) => `<i style="--r:${k * 22.5}deg"></i>`).join('')}<b></b></div>`).join('');
    const spk = Array.from({ length: 26 }, (_, i) => `<i class="spk" style="left:${Math.round(rnd(i, 1) * 1880 + 20)}px;top:${Math.round(rnd(i, 2) * 1040 + 20)}px;--s:${Math.round(14 + rnd(i, 3) * 26)}px;--d:${(rnd(i, 4) * 3).toFixed(2)}s"></i>`).join('');
    const conf = Array.from({ length: 70 }, (_, i) => {
      const shape = ['rect', 'dot', 'rib'][i % 3], pal = ['#ffd24a', '#ffffff', 'var(--accent)', 'var(--accent2)', color || '#ffd24a'][i % 5];
      return `<i class="cf ${shape}" style="left:${Math.round(rnd(i, 5) * 1900)}px;--dx:${Math.round(rnd(i, 6) * 240 - 120)}px;--cc:${pal};--dur:${(4.5 + rnd(i, 7) * 4).toFixed(2)}s;--dl:${(-rnd(i, 8) * 9).toFixed(2)}s;--w:${Math.round(9 + rnd(i, 9) * 12)}px"></i>`;
    }).join('');
    return `<div class="celeb"><i class="spot s1"></i><i class="spot s2"></i>${fw}${spk}</div><div class="confetti">${conf}</div>`;
  }
  const TROPHY = `<svg class="trophy" viewBox="0 0 200 240"><defs><linearGradient id="gld" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffc83d"/><stop offset="1" stop-color="#b9791a"/></linearGradient></defs>
    <path d="M52 22h96v58c0 34-22 56-48 62-26-6-48-28-48-62z" fill="url(#gld)"/>
    <path d="M52 40H24c0 38 14 56 38 62M148 40h28c0 38-14 56-38 62" fill="none" stroke="url(#gld)" stroke-width="12" stroke-linecap="round"/>
    <rect x="88" y="140" width="24" height="42" fill="url(#gld)"/><path d="M62 182h76l10 20H52z" fill="url(#gld)"/><rect x="44" y="202" width="112" height="28" rx="5" fill="#8a5a12"/><rect x="60" y="210" width="80" height="6" rx="3" fill="#ffd978" opacity=".7"/>
    <path d="M72 38c0 30 8 50 28 58" stroke="#fff" opacity=".55" stroke-width="9" fill="none" stroke-linecap="round"/></svg>`;

  /* ---------- Stage / desk (PTZ) cams ---------- */
  const rectsHole = (rects) => `clip-path:path(evenodd,'M0 0H1920V1080H0Z ${rects.map((c) => `M${c.x} ${c.y}H${c.x + c.w}V${c.y + c.h}H${c.x}Z`).join('')}')`;
  function stFrame(r, cam, i, big, key) {
    const side = i % 2 ? 'r' : 'l', ph = big ? 66 : 34;
    // camera picked in the browser (a webcam / NDI virtual webcam): the picture is drawn here, inside the overlay
    // casters spread over the relay's 4 ports too (browsers allow only 6 open streams per port)
    const relay = location.protocol.startsWith('http') ? location.protocol + '//' + location.hostname + ':' + (((root.Core.Store.state.stage || {}).relayPort || 8089) + (i % 4)) : '';
    const ndiVid = cam.ndiName && relay
      ? `<img class="stvideo a z" data-src="${esc(relay)}/stream?name=${encodeURIComponent(cam.ndiName)}&w=${Math.min(1280, Math.max(320, Math.round(r.w / 160) * 160))}&fps=25" alt="" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--i:${i + 1}">` : '';
    const vid = ndiVid || '';
    return `${vid}<div class="stframe a z" data-cam="${key}-f" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--i:${i + 2}"><i></i><i></i><i></i><i></i><b class="stsweep"></b></div>
      <div class="stplate ${big ? 'big' : 'small'} a ${side}" data-cam="${key}-p" style="left:${r.x}px;top:${r.y + r.h - ph}px;width:${r.w}px;height:${ph}px;--i:${i + 3}"><em>${i + 1}</em><div><b>${up(cam.name)}</b>${big ? `<small>${up(cam.role)}</small>` : ''}</div><span class="stlive"><i></i>LIVE</span></div>`;
  }

  const R = {};

  R.desk = (game, s, g) => {
    const st = s.stage, rects = stageRects(st);
    return `<div class="fsbg" style="${rectsHole(rects)}">${bgfx(g)}</div>
      <div class="layer ctr">${evTop(s)}</div>
      ${rects.map((r, i) => stFrame(r, st.cams[i], i, true, 'st-' + i)).join('')}
      <div class="stagetitle a u" style="--i:7">${up(st.title)}</div>`;
  };

  R.deskpip = (game, s) => {
    const st = s.stage, cam = st.cams[st.pipCam] || st.cams[0];
    return `<div class="layer">${stFrame(STAGE_PIP, cam, 0, false, 'stp')}</div>`;
  };

  R.bg = (game, s, g) => `<div class="fsbg full">${bgfx(g)}<div class="bgframe"></div></div>`;

  R.hud = (game, s, g) => `<div class="layer">${scorebug(game, s, g)}${camLayer(game, s, g, false)}${bottombar(s)}</div>`;

  R.camborders = (game, s, g) => `<div class="layer">${camLayer(game, s, g, false)}</div>`;

  /* ---- stand-alone elements: each one can be its own vMix browser input ---- */
  // one team's cams in a tight column starting at the top-left corner (6px padding for the frame glow)
  function teamCams(game, s, g, team) {
    const n = Math.min(g.cams != null ? g.cams : 4, 4), pad = 6; let list;
    if (g.spot > 0) {                                  // a cam is focused: only that one shows (larger), if it is this team's
      const f = CAMS[game][g.spot - 1];
      list = f && f.team === team && f.idx < n ? [Object.assign({}, f, { w: Math.round(f.w * SPOT_SCALE), h: Math.round(f.h * SPOT_SCALE), x: pad, y: pad })] : [];
    } else {
      list = CAMS[game].filter((c) => c.team === team && c.idx < n).map((c, k) => Object.assign({}, c, { x: pad, y: pad + k * c.h }));
    }
    return `<div class="layer">${camLayer(game, s, g, false, list)}</div>`;
  }
  R.cams_a = (game, s, g) => teamCams(game, s, g, 0);
  R.cams_b = (game, s, g) => teamCams(game, s, g, 1);
  R.scorecenter = (game, s, g) => `<div class="layer"><div class="sb a u" style="--i:1;left:825px;width:270px">${sbMid(game, g)}</div></div>`;
  R.infostrip = (game, s, g) => `<div class="layer">${sbStrip(game, s, g)}</div>`;
  R.ticker = (game, s) => `<div class="layer">${bottombar(s)}</div>`;

  R.scorebug =(game, s, g) => `<div class="layer compact">${scorebug(game, s, g)}</div>`;

  R.starting = (game, s, g) => `${fsbg(game, s, g, false)}<div class="layer ctr">
      ${evTop(s)}
      <h1 class="a z huge" style="--i:2"><span>STARTING</span> SOON</h1>
      <div ${A(4)}>${timerBlock('starting', 'xl')}</div>
      <div ${A(5)}>${vsRow(g, false)}</div>
      <div class="a chip" style="--i:6">${up(s.event.stage)} · BEST OF ${g.bo}</div></div>`;

  R.matchup = (game, s, g) => {
    const cod = game === 'cod';
    const sub = cod
      ? `<div class="chips">${g.maps.slice(0, g.bo).map((m, i) => `<div ${A(i + 6, 'u')}><small>MAP ${i + 1}</small><b>${up(m.mode)}</b><span>${up(m.map)}</span></div>`).join('')}</div>`
      : `<div class="clubs"><div ${A(6, 'l')}><small>CLUB</small><b>${up(g.teams[0].club)}</b></div><div ${A(6, 'r')}><small>CLUB</small><b>${up(g.teams[1].club)}</b></div></div>`;
    return `${fsbg(game, s, g, true)}<div class="layer col">
      ${evTop(s)}
      <div class="a chip" style="--i:2">${cod ? '4 VS 4' : '1 VS 1'} · ${up(s.event.stage)}</div>
      <div ${A(3, 'z')}>${vsRow(g, true)}</div>
      <div class="a fmt" style="--i:5">BEST OF ${g.bo}</div>${sub}</div>${camLayer(game, s, g, false)}`;
  };

  R.mapveto = (game, s, g) => `${fsbg(game, s, g, true)}<div class="layer col">
      ${evTop(s)}
      <h2 ${A(2, 'z')} class="a z title" style="--i:2">MAPS <span>&amp;</span> MODES</h2>
      <div class="vcards">${g.maps.slice(0, g.bo).map((m, i) => {
        const pk = m.pick == null ? null : g.teams[m.pick]; const w = m.winner; const live = i === g.mapIndex && w == null;
        return `<div class="vc a ${live ? 'live' : ''} ${w != null ? 'done' : ''}" style="--i:${i + 3};--c:${pk ? esc(pk.color) : 'var(--accent)'}">
          <em>${i + 1}</em><b>${up(m.mode)}</b><strong>${up(m.map)}</strong>
          <i class="vdiv"></i>
          <div class="vpk">${pk ? logo(pk, 'md') + '<small>PICKED BY</small><span>' + up(pk.name) + '</span>' : '<div class="logo md ph"><span>?</span></div><small>DECIDER</small><span>LEFTOVER MAP</span>'}</div>
          <div class="vst">${w != null ? `<b style="color:${esc(g.teams[w].color)}">${up(g.teams[w].tag || g.teams[w].name)}</b> ${m.scores[0]} - ${m.scores[1]}` : (live ? '<b class="lv">NOW PLAYING</b>' : 'UPCOMING')}</div></div>`;
      }).join('')}</div></div>${camLayer(game, s, g, false)}`;

  R.break = (game, s, g) => `${fsbg(game, s, g, true)}<div class="layer col">
      ${evTop(s)}
      <h1 class="a z huge" style="--i:2"><span>${up(s.breakInfo.title)}</span></h1>
      <div ${A(4)}>${timerBlock('break', 'xl')}</div>
      <div class="next a u" style="--i:5"><small>UP NEXT</small><b>${up(s.breakInfo.next)}</b></div>
      <div ${A(6)}>${vsRow(g, false)}</div></div>${camLayer(game, s, g, false)}`;

  R.halftime = (game, s, g) => {
    const cod = game === 'cod';
    const score = cod ? g.wins : g.score;
    return `${fsbg(game, s, g, true)}<div class="layer col">
      ${evTop(s)}
      <h2 class="a z title" style="--i:2">${cod ? 'MAP <span>BREAK</span>' : 'HALF <span>TIME</span>'}</h2>
      <div class="scoreline a z" style="--i:3">
        <div class="slt" style="--c:${esc(g.teams[0].color)}">${logo(g.teams[0], 'lg')}<b>${up(g.teams[0].name)}</b></div>
        <div class="sln"><span data-pop="hs0">${score[0]}</span><u>:</u><span data-pop="hs1">${score[1]}</span></div>
        <div class="slt" style="--c:${esc(g.teams[1].color)}">${logo(g.teams[1], 'lg')}<b>${up(g.teams[1].name)}</b></div></div>
      ${cod ? `<div class="mrows">${mapRows(g, game)}</div>` : `<div class="a chip" style="--i:5">${up(g.period)} · <span data-clock>00:00</span></div>`}
      <div class="mini a u" style="--i:8"><small>RESUMING IN</small>${timerBlock('break', 'sm')}</div></div>${camLayer(game, s, g, false)}`;
  };

  R.result = (game, s, g) => {
    const w = winnerOf(g); const cod = game === 'cod'; const wt = w >= 0 ? g.teams[w] : null;
    const score = cod ? g.wins : g.score;
    const final = /final/i.test(s.event.stage);
    return `${fsbg(game, s, g, true)}${celebrate(wt ? !!wt : false, wt && wt.color)}<div class="layer col">
      ${evTop(s)}
      <div class="a chip" style="--i:2">FINAL RESULT</div>
      ${wt ? `<div class="winner a z" style="--i:3;--c:${esc(wt.color)}"><div class="ring"></div><div class="ring r2"></div>${logo(wt, 'lg')}<small class="gold">${final ? 'CHAMPIONS' : 'WINNER'}</small><h2>${up(wt.name)}</h2></div>` : '<h2 class="a z title" style="--i:3">MATCH COMPLETE</h2>'}
      <div class="scoreline compactline a u" style="--i:5">
        <div class="slt" style="--c:${esc(g.teams[0].color)}"><b>${up(g.teams[0].tag || g.teams[0].name)}</b></div>
        <div class="sln"><span>${score[0]}</span><u>:</u><span>${score[1]}</span></div>
        <div class="slt" style="--c:${esc(g.teams[1].color)}"><b>${up(g.teams[1].tag || g.teams[1].name)}</b></div></div>
      ${cod ? `<div class="mrows tight">${mapRows(g, game)}</div>` : ''}</div>${camLayer(game, s, g, false)}`;
  };

  /* champion / podium team: manual podium entry, falling back to the match result */
  function placeTeam(g, i) {
    const p = g.podium[i], w = winnerOf(g);
    if (p.name) return Object.assign({ tag: '', club: '' }, p);
    const src = i === 0 && w >= 0 ? g.teams[w] : (i === 1 && w >= 0 ? g.teams[1 - w] : null);
    return src ? Object.assign({}, src, { prize: p.prize, players: src.players }) : Object.assign({}, p, { name: '—', empty: true });
  }
  const playersLine = (t, game) => game === 'cod'
    ? t.players.filter(Boolean).map((n, k) => `<span>${up(n)}</span>`).join('')
    : (t.club ? `<span>${up(t.club)}</span>` : '');

  R.champions = (game, s, g) => {
    const t = placeTeam(g, 0); const ps = playersLine(t, game);
    return `${fsbg(game, s, g, false)}${celebrate(true, t.color)}<div class="layer ctr champ" style="--c:${esc(t.color)}">
      ${evTop(s)}
      <h1 class="a z huge gold" style="--i:2">CHAMPIONS</h1>
      <div class="champrow">
        <div class="a l" style="--i:3">${TROPHY}</div>
        <div class="winner a z" style="--i:4;--c:${esc(t.color)}"><div class="ring"></div><div class="ring r2"></div>${logo(t, 'xxl')}</div>
        <div class="a r" style="--i:3">${TROPHY}</div></div>
      <h2 class="champname a z" style="--i:5">${up(t.name)}</h2>
      ${ps ? `<div class="champpl a u" style="--i:6">${ps}</div>` : ''}
      ${t.prize ? `<div class="a chip gold-chip" style="--i:7">${up(t.prize)}</div>` : ''}</div>`;
  };

  R.podium = (game, s, g) => {
    const col = (i, cls, order) => {
      const t = placeTeam(g, i), ps = playersLine(t, game);
      return `<div class="pcol ${cls}" style="--c:${esc(t.color)}">
        <div class="a z" style="--i:${order + 1}">${i === 0 ? '<i class="crown"></i>' : ''}${logo(t, i === 0 ? 'xl' : 'lg')}</div>
        <div class="pname a" style="--i:${order + 1}">${up(t.name)}</div>
        ${ps ? `<div class="pplayers a" style="--i:${order + 1}">${ps}</div>` : ''}
        ${t.prize ? `<div class="pprize a" style="--i:${order + 1}">${up(t.prize)}</div>` : ''}
        <div class="pstep a g" style="--i:${order}"><b>${i + 1}</b><small>${['1ST', '2ND', '3RD'][i]} PLACE</small></div></div>`;
    };
    return `${fsbg(game, s, g, false)}${celebrate(true, '#ffc83d')}<div class="layer ctr podl">
      ${evTop(s)}
      <h2 class="a z title gold" style="--i:2">FINAL STANDINGS</h2>
      <div class="pod">${col(1, 'p2', 4)}${col(0, 'p1', 6)}${col(2, 'p3', 2)}</div></div>`;
  };

  R.ending = (game, s, g) => `${fsbg(game, s, g, false)}<div class="layer ctr">
      ${evTop(s)}
      <h1 class="a z huge" style="--i:2">THANKS <span>FOR WATCHING</span></h1>
      <div class="a chip" style="--i:4">${up(s.event.name)} · ${up(s.event.season)}</div>
      <div class="a u endsp" style="--i:5">${up(s.event.sponsor)}</div></div>`;

  R.tactical = (game, s, g) => {
    const i = s.tactical.team | 0; const t = g.teams[i];
    return `${fsbg(game, s, g, true)}<div class="layer col" style="--c:${esc(t.color)}">
      ${evTop(s)}
      <h1 class="a z huge" style="--i:2"><span>TACTICAL</span> TIMEOUT</h1>
      <div class="winner a z" style="--i:3;--c:${esc(t.color)}"><div class="ring"></div>${logo(t, 'xl')}<small>CALLED BY</small><h2>${up(t.name)}</h2></div>
      <div ${A(5)}>${timerBlock('tactical', 'xl')}</div>
      <div class="a chip" style="--i:6">TIMEOUTS LEFT <span class="tos">${dots(t.timeouts)}</span></div></div>${camLayer(game, s, g, false)}`;
  };

  R.technical = (game, s, g) => `${fsbg(game, s, g, true)}<div class="layer col">
      ${evTop(s)}
      <div class="tech-ic a z" style="--i:2"><i></i></div>
      <h1 class="a z huge" style="--i:3"><span>TECHNICAL</span> TIMEOUT</h1>
      <div class="reason a" style="--i:4">${up(s.technical.reason)}</div>
      <div ${A(5)}>${timerBlock('technical', 'xl')}</div>
      <div class="stand a" style="--i:6">MATCH PAUSED · PLEASE STAND BY</div></div>${camLayer(game, s, g, false)}`;

  R.alert = (game, s, g) => {
    const t = g.teams[g.alert.team | 0];
    return `<div class="layer pop"><div class="banner" style="--c:${esc(t.color)}">
      <div class="bn-bg a w" style="--i:0">${bgfx(g)}<i class="bn-wedge"></i></div><div class="bn-logo a z" style="--i:2">${logo(t, 'lg')}</div>
      <div class="bn-txt a l" style="--i:2"><small>${up(t.name)}</small><b>${up(g.alert.title)}</b></div>
      <div class="bn-sub a r" style="--i:3">${up(g.alert.sub)}</div><i class="shine"></i></div></div>`;
  };

  /* small goal celebration shown on the live layout, under the scorebug */
  function miniFx(color) {
    const bursts = [[10, 70, '--fc:#ffd24a', 0], [850, 60, '--fc:var(--accent)', .7], [430, -10, '--fc:#fff', 1.4]];
    const fw = bursts.map(([x, y, c, d]) => `<div class="fw" style="left:${x}px;top:${y}px;${c};--d:${d}s">${Array.from({ length: 12 }, (_, k) => `<i style="--r:${k * 30}deg"></i>`).join('')}<b></b></div>`).join('');
    const conf = Array.from({ length: 56 }, (_, i) => {
      const shape = ['rect', 'dot', 'rib'][i % 3], pal = ['#ffd24a', '#ffffff', 'var(--accent)', 'var(--accent2)', color][i % 5];
      return `<i class="cf ${shape}" style="left:${Math.round(rnd(i, 5) * 880)}px;--dx:${Math.round(rnd(i, 6) * 120 - 60)}px;--cc:${pal};--dur:${(1.8 + rnd(i, 7) * 1.6).toFixed(2)}s;--dl:${(-rnd(i, 8) * 3).toFixed(2)}s;--w:${Math.round(9 + rnd(i, 9) * 9)}px"></i>`;
    }).join('');
    const spk = Array.from({ length: 10 }, (_, i) => `<i class="spk" style="left:${Math.round(rnd(i, 1) * 860 + 10)}px;top:${Math.round(rnd(i, 2) * 170)}px;--s:${Math.round(12 + rnd(i, 3) * 16)}px;--d:${(rnd(i, 4) * 2).toFixed(2)}s"></i>`).join('');
    return `<div class="gs-fx celeb">${fw}${spk}</div><div class="gs-conf confetti">${conf}</div>`;
  }
  R.goal = (game, s, g) => {
    const t = g.teams[g.goal.team | 0];
    return `<div class="layer"><div class="gsmall" style="--c:${esc(t.color)}">
      <div class="gs-box a z" style="--i:1"><i class="gs-wedge"></i><i class="shine"></i>
        <div class="gs-logo">${logo(t, 'md')}</div>
        <div class="gs-txt"><b class="gs-word gold">GOAL!</b><span class="gs-name">${up(t.name)}</span></div>
        ${g.goal.minute ? `<div class="gs-min">${up(g.goal.minute)}</div>` : ''}</div>
      ${miniFx(t.color)}</div></div>`;
  };

  R.lowerthird = (game, s) => `<div class="layer"><div class="lt a l" style="--i:1">
      <i class="lt-bar"></i><div class="lt-t"><b>${up(s.lower.name)}</b><small>${up(s.lower.title)}</small></div><i class="shine"></i></div></div>`;

  R.replay = (game, s) => `<div class="layer"><div class="rp a r" style="--i:1"><i class="rp-ic"></i><b>${up(s.replay.text)}</b><i class="shine"></i></div></div>`;

  root.Scenes = {
    render(game, id, s) { const f = R[id]; return f ? f(game, s, s[game]) : ''; },
    has: (id) => !!R[id]
  };
})(window);
