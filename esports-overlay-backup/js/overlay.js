/* Overlay runtime.
   ?game=cod|fc & scene=<id>            one scene
   ?game=cod|fc & scene=all             EVERY scene in one page (one vMix browser input instead of ~15)
   ?game=cod|fc & scene=hud,desk,goal   any list of scenes
   [&force=1 always show]  [&lite=1 lighter effects]
   Only scenes that are on screen are built; the rest cost nothing (no DOM, no animations, no camera streams). */
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const game = q.get('game') === 'fc' ? 'fc' : 'cod';
  const elParam = q.get('el');                      // ?el=<id>: ONE overlay on a tight transparent canvas (see Core.elementRect)
  const sceneParam = elParam || q.get('scene') || 'hud';
  const force = q.get('force') === '1';
  const { Store, fmt, timerLeft, clockNow, isLive } = Core;
  const mount = document.getElementById('mount');
  const stage = document.getElementById('stage');
  document.body.classList.add('game-' + game);

  /* stacking order when several scenes are on at once (bottom -> top) */
  const Z = ['hud', 'ticker', 'camborders', 'cams_a', 'cams_b', 'scorebug', 'scorecenter', 'infostrip', 'deskpip', 'lowerthird', 'replay', 'starting', 'matchup', 'mapveto', 'tactical', 'technical', 'desk',
    'break', 'halftime', 'result', 'champions', 'podium', 'ending', 'goal', 'alert'];
  const rank = (id) => { const i = Z.indexOf(id); return i < 0 ? 50 : i; };
  const wanted = sceneParam === 'all' ? Core.SCENES[game].map((m) => m.id) : sceneParam.split(',').map((x) => x.trim()).filter(Boolean);
  wanted.sort((a, b) => rank(a) - rank(b));
  document.title = game.toUpperCase() + ' · ' + sceneParam;

  const views = wanted.map((id) => {
    const el = document.createElement('div');
    el.className = 'scene view sc-' + id; el.style.display = 'none';
    mount.appendChild(el);
    return { id, el, last: '', rev: -1, active: false, offAt: 0 };
  });

  const R0 = elParam ? Core.elementRect(game, elParam) : { x: 0, y: 0, w: 1920, h: 1080 };
  if (elParam) {   // crop the 1920x1080 layout down to this element: the page IS the element, top-left aligned
    stage.style.width = R0.w + 'px'; stage.style.height = R0.h + 'px'; stage.style.overflow = 'hidden';
    mount.style.cssText = 'position:absolute;width:1920px;height:1080px;left:' + (-R0.x) + 'px;top:' + (-R0.y) + 'px';
  }
  function fit() {
    const s = Math.min(innerWidth / R0.w, innerHeight / R0.h);
    stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }
  addEventListener('resize', fit); fit();

  function applyTheme(v, s) {
    const t = Core.themeVars(Core.sceneColors(s, game, v.id));
    Core.THEME_KEYS.forEach((k) => { if (t && t[k]) v.el.style.setProperty(k, t[k]); else v.el.style.removeProperty(k); });
  }

  function render(v, s) {
    const el = v.el;
    applyTheme(v, s);
    const html = Scenes.render(game, v.id, s);
    if (html === v.last) return;
    const old = {};
    el.querySelectorAll('[data-pop]').forEach((e) => { old[e.dataset.pop] = e.textContent; });
    /* face cams that move (spotlight) glide to their new place; new ones fade in, old ones fade out */
    const oldCams = new Map();
    el.querySelectorAll('[data-cam]').forEach((e) => oldCams.set(e.dataset.cam, { el: e, rect: e.getBoundingClientRect() }));
    // keep running NDI picture streams alive across re-renders (no reconnect / flicker)
    const keepImgs = new Map();
    el.querySelectorAll('img.stvideo').forEach((im) => keepImgs.set(im.dataset.src, im));
    el.innerHTML = html; v.last = html;
    el.querySelectorAll('img.stvideo').forEach((n) => {
      const o = keepImgs.get(n.dataset.src);
      if (o) { o.setAttribute('style', n.getAttribute('style') || ''); o.className = n.className; n.replaceWith(o); }
      else n.setAttribute('src', n.dataset.src);   // camera streams start only now, while the scene is on screen
    });
    const on = el.classList.contains('on');
    if (oldCams.size && on) {
      const k = Math.min(innerWidth / R0.w, innerHeight / R0.h), seen = new Set();
      el.querySelectorAll('[data-cam]').forEach((e) => {
        seen.add(e.dataset.cam); const o = oldCams.get(e.dataset.cam), r = e.getBoundingClientRect();
        if (o) {
          const dx = (o.rect.left - r.left) / k, dy = (o.rect.top - r.top) / k, sx = o.rect.width / r.width, sy = o.rect.height / r.height;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || Math.abs(sx - 1) > .01 || Math.abs(sy - 1) > .01) {
            e.style.transformOrigin = '0 0'; e.style.transition = 'none';
            e.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')'; void e.offsetWidth;
            requestAnimationFrame(() => { e.style.transition = 'transform .7s cubic-bezier(.22,.9,.25,1)'; e.style.transform = ''; setTimeout(() => { e.style.transition = ''; e.style.transform = ''; e.style.transformOrigin = ''; }, 800); });
          }
        } else { e.style.animation = 'camin .55s cubic-bezier(.22,.9,.25,1) both'; setTimeout(() => { e.style.animation = ''; }, 650); }
      });
      oldCams.forEach((o, key) => {
        if (seen.has(key)) return;
        const ghost = o.el; ghost.style.transition = 'opacity .3s ease, transform .3s ease'; el.appendChild(ghost); void ghost.offsetWidth;
        requestAnimationFrame(() => { ghost.style.opacity = '0'; ghost.style.transform = 'scale(.92)'; });
        setTimeout(() => ghost.remove(), 420);
      });
    }
    el.querySelectorAll('[data-pop]').forEach((e) => {
      const key = e.dataset.pop;
      if (key in old && old[key] !== e.textContent && on) { e.classList.add('bump'); setTimeout(() => e.classList.remove('bump'), 900); }
    });
  }

  /* live numbers inside an active scene (timers, clock, time of day) */
  function updateLive(v, s, now) {
    const el = v.el;
    el.querySelectorAll('[data-timer]').forEach((e) => {
      const t = s.timers[e.dataset.timer]; if (!t) return;
      const left = timerLeft(t, now), txt = fmt(left);
      if (e.textContent !== txt) e.textContent = txt;
      e.classList.toggle('warn', t.running && left <= 10);
    });
    el.querySelectorAll('[data-tbar]').forEach((e) => {
      const t = s.timers[e.dataset.tbar]; if (!t) return;
      e.style.width = (t.dur > 0 ? Math.max(0, Math.min(1, timerLeft(t, now) / t.dur)) * 100 : 0) + '%';
    });
    const c = s.fc && s.fc.clock;
    el.querySelectorAll('[data-clock]').forEach((e) => { const txt = fmt(clockNow(c, now)); if (e.textContent !== txt) e.textContent = txt; });
    el.querySelectorAll('[data-now]').forEach((e) => { const d = new Date(); e.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });
  }

  const typeOf = {}; Core.SCENES[game].forEach((m) => { typeOf[m.id] = m.type; });

  function update(v, s, now, topFull) {
    // scenes hidden underneath a live full-screen scene are not built at all (you cannot see them anyway)
    const covered = !force && rank(v.id) < topFull;
    const vis = !covered && (force || v.id === 'bg' || isLive(s, game, v.id, now));
    if (vis) {
      v.offAt = 0;
      if (!v.active) {            // just went on air: build it, then animate in
        v.active = true; v.last = ''; v.rev = -1; v.el.style.display = '';
        render(v, s); v.rev = s.rev;
        requestAnimationFrame(() => requestAnimationFrame(() => v.el.classList.add('on')));
      } else if (v.rev !== s.rev) { render(v, s); v.rev = s.rev; }
      updateLive(v, s, now);
    } else if (v.active) {        // off air: animate out, then throw everything away
      v.el.classList.remove('on');
      if (!v.offAt) v.offAt = now;
      if (now - v.offAt > 1600) { v.active = false; v.el.innerHTML = ''; v.last = ''; v.el.style.display = 'none'; }
    }
  }

  function tick() {
    const s = Store.state, now = Date.now();
    document.body.classList.toggle('lite', q.get('lite') === '1' || !!(s.ui && s.ui.lite));
    document.body.classList.toggle('nobg', !!elParam || q.get('nobg') === '1' || !!(s.ui && s.ui.noBg));   // transparent mode: no full-screen backgrounds
    let topFull = -1;
    views.forEach((v) => { if (typeOf[v.id] === 'full' && isLive(s, game, v.id, now)) topFull = Math.max(topFull, rank(v.id)); });
    views.forEach((v) => update(v, s, now, topFull));
  }

  Store.on(() => tick());
  Store.init().then(() => { tick(); setInterval(tick, 100); });
})();
