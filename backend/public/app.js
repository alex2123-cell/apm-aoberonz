/* Aoberonz web app — plain JavaScript, no build step. Served by the API at "/".
 * Pages: / (feed), /explore, /explore/:industry, /saved, /profile, /review, /company/:slug, /p/:id, /welcome
 */
(() => {
  'use strict';

  const INDUSTRY_ICONS = {
    manufacturing: '🏭', energy: '⚡', mining: '⛰️', agriculture: '🌾', construction: '🏗️', logistics: '🚚',
    finance: '🏦', telecoms: '📡', health: '🏥', retail: '🏪', utilities: '💧',
  };
  const PAGE_SIZE = 10;
  const PREFETCH = 3;
  const BREAK_MINUTES = 30;

  // ---------------------------------------------------------------- state
  const store = {
    get token() { return localStorage.getItem('aob_token'); },
    set token(v) { v ? localStorage.setItem('aob_token', v) : localStorage.removeItem('aob_token'); },
    get interests() { try { return JSON.parse(localStorage.getItem('aob_interests') || '[]'); } catch { return []; } },
    set interests(v) { localStorage.setItem('aob_interests', JSON.stringify(v)); },
    get onboarded() { return localStorage.getItem('aob_onboarded') === '1'; },
    set onboarded(v) { localStorage.setItem('aob_onboarded', v ? '1' : '0'); },
    get breakReminder() { return localStorage.getItem('aob_break') !== '0'; },
    set breakReminder(v) { localStorage.setItem('aob_break', v ? '1' : '0'); },
  };
  let me = null; // { id, name, email, role, companyId }
  let newCount = 0;
  const feeds = {}; // tab -> feed state, kept while switching tabs

  // ---------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $('#view');

  /** Safe element builder: text is always set as text, never as HTML. */
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const compact = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n));
  function age(iso) {
    if (!iso) return '';
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    if (m < 1440) return `${Math.floor(m / 60)} h ago`;
    return `${Math.floor(m / 1440)} d ago`;
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(store.token ? { authorization: `Bearer ${store.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return {};
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && store.token && !path.startsWith('/auth')) { store.token = null; me = null; }
      throw new Error(data.error || 'Something went wrong. Please try again.');
    }
    return data;
  }
  const needLogin = () => { if (me) return false; openAuth(); return true; };

  // ---------------------------------------------------------------- router
  function go(path, replace = false) {
    if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
    route();
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });
  window.addEventListener('popstate', route);

  function setNav(name) {
    document.querySelectorAll('#nav a[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  }

  function route() {
    tracker.pause();
    const p = location.pathname;
    let m;
    if (!store.onboarded && p !== '/welcome' && !p.startsWith('/p/')) return go('/welcome', true);
    if (p === '/' || p === '') { setNav('feed'); return renderFeedPage(); }
    if (p === '/welcome') { setNav(''); return renderWelcome(); }
    if (p === '/explore') { setNav('explore'); return renderExplore(); }
    if ((m = p.match(/^\/explore\/([a-z]+)$/))) { setNav('explore'); return renderIndustry(m[1]); }
    if (p === '/saved') { setNav('saved'); return renderSaved(); }
    if (p === '/profile') { setNav('profile'); return renderProfile(); }
    if (p === '/review') { setNav('profile'); return renderReview(); }
    if ((m = p.match(/^\/company\/([\w-]+)$/))) { setNav('explore'); return renderCompany(m[1]); }
    if ((m = p.match(/^\/p\/([\w-]+)$/))) { setNav('feed'); return renderPost(m[1]); }
    go('/', true);
  }

  // ---------------------------------------------------------------- dwell tracking
  // How long each card stays on screen trains the For You feed (quick skip = less, long read = more).
  const tracker = {
    current: null, since: 0, pending: [],
    show(id) { this.pause(); this.current = id; this.since = Date.now(); },
    pause() {
      if (this.current) this.pending.push({ postId: this.current, dwellMs: Date.now() - this.since });
      this.current = null;
      if (this.pending.length >= 10) this.flush();
    },
    async flush() {
      if (!this.pending.length) return;
      if (!me) { this.pending = []; return; }
      const events = this.pending.splice(0, 50);
      try { await api('/posts/interactions/batch', { method: 'POST', body: { events } }); }
      catch { this.pending.unshift(...events.slice(0, 40)); }
    },
  };
  setInterval(() => tracker.flush(), 10000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { tracker.pause(); tracker.flush(); } });

  // ---------------------------------------------------------------- feed engine
  function newFeed(tab, industry) {
    return { tab, industry, items: [], shown: new Set(), cursor: null, hasMore: true, loading: false, error: null };
  }

  async function loadFeed(f, reset) {
    if (f.loading || (!reset && !f.hasMore)) return;
    f.loading = true;
    if (reset) { f.items = []; f.shown = new Set(); f.cursor = null; f.hasMore = true; }
    try {
      const q = new URLSearchParams({ tab: f.tab, limit: PAGE_SIZE });
      if (f.industry) q.set('industry', f.industry);
      if (f.tab === 'foryou' && f.shown.size) q.set('exclude', [...f.shown].slice(-200).join(','));
      if (f.tab !== 'foryou' && f.cursor) q.set('cursor', f.cursor);
      const res = await api(`/feed?${q}`);
      const page = res.items.filter((p) => !f.shown.has(p.id));
      page.forEach((p) => f.shown.add(p.id));
      f.items.push(...page);
      f.cursor = res.nextCursor;
      f.hasMore = !!res.nextCursor && page.length > 0;
      f.error = null;
      return page;
    } catch (e) {
      f.error = e.message;
      return [];
    } finally {
      f.loading = false;
    }
  }

  /** Renders a vertical snap-scrolling feed into `host`. */
  function mountFeed(host, f, emptyText) {
    const scroller = h('div', { class: 'feed', tabindex: '0', 'aria-label': 'Feed' });
    const pull = h('div', { class: 'pull' }, 'Release to refresh');
    host.append(pull, scroller);

    const observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const idx = Number(en.target.dataset.idx);
        tracker.show(f.items[idx].id);
        if (idx >= f.items.length - PREFETCH) more();
      }
    }, { root: scroller, threshold: 0.6 });

    function paintAll() {
      scroller.replaceChildren();
      if (!f.items.length) {
        scroller.append(h('div', { class: 'empty' }, f.loading ? 'Loading…' : (f.error || emptyText)));
        return;
      }
      f.items.forEach((p, i) => { const c = postCard(p, f); c.dataset.idx = i; scroller.append(c); observer.observe(c); });
      if (f.hasMore) scroller.append(h('div', { class: 'loader' }, 'Loading more…'));
    }
    async function more() {
      const before = f.items.length;
      const page = await loadFeed(f, false);
      scroller.querySelector('.loader')?.remove();
      (page || []).forEach((p, j) => { const c = postCard(p, f); c.dataset.idx = before + j; scroller.append(c); observer.observe(c); });
      if (f.hasMore) scroller.append(h('div', { class: 'loader' }, 'Loading more…'));
    }
    async function refresh() {
      scroller.scrollTo({ top: 0 });
      await loadFeed(f, true);
      paintAll();
    }

    // pull to refresh: touch drag down at the top, or mouse wheel up at the top
    let startY = null;
    scroller.addEventListener('touchstart', (e) => { startY = scroller.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    scroller.addEventListener('touchmove', (e) => { if (startY !== null) pull.classList.toggle('show', e.touches[0].clientY - startY > 80); }, { passive: true });
    scroller.addEventListener('touchend', () => { if (pull.classList.contains('show')) { pull.classList.remove('show'); refresh(); } startY = null; });
    let wheelUp = 0;
    scroller.addEventListener('wheel', (e) => {
      if (scroller.scrollTop > 0 || e.deltaY >= 0) { wheelUp = 0; return; }
      wheelUp += -e.deltaY;
      pull.classList.add('show');
      if (wheelUp > 400) { wheelUp = 0; pull.classList.remove('show'); refresh(); }
      clearTimeout(scroller._t); scroller._t = setTimeout(() => { wheelUp = 0; pull.classList.remove('show'); }, 400);
    }, { passive: true });

    // keyboard: arrows / j k
    scroller.addEventListener('keydown', (e) => {
      const dir = ['ArrowDown', 'j', 'PageDown'].includes(e.key) ? 1 : ['ArrowUp', 'k', 'PageUp'].includes(e.key) ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      scroller.scrollBy({ top: dir * scroller.clientHeight, behavior: 'smooth' });
    });

    if (f.items.length) paintAll();
    else { paintAll(); loadFeed(f, true).then(paintAll); }
    setTimeout(() => scroller.focus({ preventScroll: true }), 0);
    return { refresh };
  }

  function postCard(p, f) {
    const likeBtn = h('button', { class: p.liked ? 'liked' : '', 'aria-label': 'Like' }, h('span', { class: 'i' }, p.liked ? '♥' : '♡'), h('span', {}, compact(p.likeCount)));
    const saveBtn = h('button', { class: p.saved ? 'saved' : '', 'aria-label': 'Save' }, h('span', { class: 'i' }, p.saved ? '★' : '☆'), h('span', {}, p.saved ? 'Saved' : 'Save'));
    const shareBtn = h('button', { 'aria-label': 'Share' }, h('span', { class: 'i' }, '↗'), h('span', {}, compact(p.shareCount)));
    const moreBtn = h('button', { 'aria-label': 'Report' }, h('span', { class: 'i' }, '⋯'));
    const followBtn = h('button', { class: 'follow' }, 'Follow');
    const burst = h('div', { class: 'burst' }, '♥');
    const summary = h('p', { class: 'summary' }, p.summary);

    const paintLike = () => {
      likeBtn.className = p.liked ? 'liked' : '';
      likeBtn.firstChild.textContent = p.liked ? '♥' : '♡';
      likeBtn.lastChild.textContent = compact(p.likeCount);
    };
    const paintSave = () => {
      saveBtn.className = p.saved ? 'saved' : '';
      saveBtn.firstChild.textContent = p.saved ? '★' : '☆';
      saveBtn.lastChild.textContent = p.saved ? 'Saved' : 'Save';
    };
    async function toggleLike() {
      if (needLogin()) return;
      p.liked = !p.liked; p.likeCount += p.liked ? 1 : -1; paintLike();
      try { p.liked = (await api(`/posts/${p.id}/like`, { method: 'POST' })).liked; }
      catch (e) { p.liked = !p.liked; p.likeCount += p.liked ? 1 : -1; toast(e.message); }
      paintLike();
    }

    likeBtn.onclick = toggleLike;
    saveBtn.onclick = async () => {
      if (needLogin()) return;
      p.saved = !p.saved; paintSave();
      try { p.saved = (await api(`/posts/${p.id}/save`, { method: 'POST' })).saved; }
      catch (e) { p.saved = !p.saved; toast(e.message); }
      paintSave();
    };
    shareBtn.onclick = async () => {
      try {
        const { url } = await api(`/posts/${p.id}/share`, { method: 'POST' });
        p.shareCount++; shareBtn.lastChild.textContent = compact(p.shareCount);
        const link = `${location.origin}/p/${p.id}`;
        if (navigator.share) await navigator.share({ title: p.headline, url: link }).catch(() => {});
        else { await navigator.clipboard?.writeText(link || url); toast('Link copied'); }
      } catch (e) { toast(e.message); }
    };
    moreBtn.onclick = () => openReport(p, f);
    followBtn.onclick = async () => {
      if (needLogin()) return;
      try {
        const r = await api(`/companies/${p.company.id}/follow`, { method: 'POST' });
        followBtn.textContent = r.following ? 'Following' : 'Follow';
        followBtn.classList.toggle('on', r.following);
        toast(r.following ? `Following ${p.company.name}` : `Unfollowed ${p.company.name}`);
      } catch (e) { toast(e.message); }
    };
    summary.onclick = () => summary.classList.toggle('open');

    const media = p.mediaUrl && p.mediaType !== 'audio'
      ? h('img', { class: 'bg', src: p.mediaUrl, alt: '', loading: 'lazy', onerror: (e) => e.target.replaceWith(fallback(p)) })
      : fallback(p);

    const card = h('article', { class: 'card' },
      media,
      h('div', { class: 'shade' }),
      h('div', { class: 'body' },
        h('div', { class: 'co' },
          h('div', { class: 'avatar' }, p.company.name[0]),
          h('a', { href: `/company/${p.company.slug}`, 'data-link': true }, p.company.name),
          p.company.verified ? h('span', { class: 'verified', title: 'Verified company' }, '✔') : null,
          followBtn),
        h('div', { class: 'headline' }, p.headline),
        summary,
        h('div', { class: 'chips' },
          h('span', { class: 'chip' }, `${INDUSTRY_ICONS[p.industry] || '🏢'} ${titleCase(p.industry)}`),
          p.county ? h('span', { class: 'chip' }, `📍 ${p.county}`) : null,
          h('span', { class: 'chip' }, `🕒 ${age(p.publishedAt)}`),
          p.aiGenerated ? h('span', { class: 'chip' }, '✨ AI-assisted') : null)),
      h('div', { class: 'rail' }, likeBtn, saveBtn, shareBtn, moreBtn),
      burst);

    card.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, a')) return;
      if (!p.liked) toggleLike();
      burst.classList.remove('go'); void burst.offsetWidth; burst.classList.add('go');
    });
    return card;
  }
  const fallback = (p) => h('div', { class: 'fallback' }, INDUSTRY_ICONS[p.industry] || '🏢');

  // ---------------------------------------------------------------- pages
  let breakTimer;
  function renderFeedPage(tab = sessionStorage.getItem('aob_tab') || 'foryou') {
    const wrap = h('div', { class: 'feed-wrap phone' });
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const pill = h('button', { class: 'pill' });
    const host = h('div', { style: 'height:100%' });
    const labels = { foryou: 'For You', following: 'Following', latest: 'Latest' };
    for (const [key, label] of Object.entries(labels)) {
      tabs.append(h('button', { class: key === tab ? 'on' : '', role: 'tab', onclick: () => { sessionStorage.setItem('aob_tab', key); renderFeedPage(key); } }, label));
    }
    wrap.append(tabs, pill, host);
    view.replaceChildren(wrap);

    feeds[tab] ??= newFeed(tab);
    const empty = tab === 'following' ? (me ? 'Follow companies to fill this tab.' : 'Log in and follow companies to fill this tab.') : 'Nothing here yet. Pull down to refresh.';
    const ctl = mountFeed(host, feeds[tab], empty);

    paintPill = () => {
      pill.textContent = `↑ ${newCount} new ${newCount === 1 ? 'update' : 'updates'}`;
      pill.classList.toggle('show', newCount > 0);
    };
    pill.onclick = () => {
      newCount = 0; paintPill();
      if (tab !== 'foryou') { sessionStorage.setItem('aob_tab', 'foryou'); feeds.foryou = newFeed('foryou'); return renderFeedPage('foryou'); }
      ctl.refresh();
    };
    paintPill();

    clearInterval(breakTimer);
    breakTimer = setInterval(() => {
      if (store.breakReminder && location.pathname === '/') toast(`You've been catching up for ${BREAK_MINUTES} minutes. Fresh updates will be waiting.`);
    }, BREAK_MINUTES * 60000);
  }
  let paintPill = () => {};

  function renderWelcome() {
    const picked = new Set(store.interests);
    const btn = h('button', { class: 'btn', style: 'width:100%;margin-top:28px' });
    const paint = () => {
      btn.disabled = picked.size < 3;
      btn.textContent = picked.size >= 3 ? 'Start swiping' : `Pick ${3 - picked.size} more`;
    };
    const pickers = h('div', { class: 'pickers' }, Object.entries(INDUSTRY_ICONS).map(([k, ico]) => {
      const b = h('button', { class: `pick ${picked.has(k) ? 'on' : ''}` }, `${ico} ${titleCase(k)}`);
      b.onclick = () => { picked.has(k) ? picked.delete(k) : picked.add(k); b.classList.toggle('on'); paint(); };
      return b;
    }));
    btn.onclick = async () => {
      store.interests = [...picked]; store.onboarded = true;
      if (me) await api('/me/interests', { method: 'PUT', body: { industries: [...picked] } }).catch(() => {});
      subscribeRooms();
      Object.keys(feeds).forEach((k) => delete feeds[k]);
      go('/');
    };
    paint();
    view.replaceChildren(h('div', { class: 'page phone' },
      h('h1', {}, 'What do you want to follow?'),
      h('p', { class: 'muted' }, 'Pick 3 or more. Your feed learns from every swipe after that.'),
      pickers, btn));
  }

  async function renderExplore() {
    const list = h('div', { class: 'list' });
    const search = h('input', { type: 'search', placeholder: 'Search companies', 'aria-label': 'Search companies' });
    let companies = [];
    const paint = () => {
      const q = search.value.toLowerCase();
      list.replaceChildren(...companies.filter((c) => c.name.toLowerCase().includes(q)).map((c) =>
        h('a', { href: `/company/${c.slug}`, 'data-link': true },
          h('span', { style: 'font-size:24px' }, INDUSTRY_ICONS[c.industry] || '🏢'),
          h('div', {}, h('b', {}, c.name, c.verified ? ' ✔' : ''), h('small', {}, `${titleCase(c.industry)} · ${c.county || 'Kenya'}`)))));
    };
    search.oninput = paint;
    view.replaceChildren(h('div', { class: 'page' },
      h('h1', {}, 'Explore'),
      h('div', { class: 'grid' }, Object.entries(INDUSTRY_ICONS).map(([k, ico]) =>
        h('button', { class: 'tile', onclick: () => go(`/explore/${k}`) }, h('span', { class: 'ico' }, ico), h('b', {}, titleCase(k))))),
      h('h2', {}, 'Companies'), search, list));
    try { companies = (await api('/companies')).items; paint(); } catch (e) { toast(e.message); }
  }

  function renderIndustry(industry) {
    const key = `industry:${industry}`;
    feeds[key] ??= newFeed('foryou', industry);
    const host = h('div', { style: 'height:100%' });
    view.replaceChildren(h('div', { class: 'feed-wrap phone' },
      h('div', { class: 'tabs' }, h('button', { class: 'on', onclick: () => go('/explore') }, `← ${titleCase(industry)}`)), host));
    mountFeed(host, feeds[key], `No ${industry} updates yet.`);
  }

  async function renderSaved() {
    const page = h('div', { class: 'page' }, h('h1', {}, 'Saved'));
    view.replaceChildren(page);
    if (!me) { page.append(h('button', { class: 'btn', onclick: openAuth }, 'Log in to see saved posts')); return; }
    try {
      const { items } = await api('/me/saved');
      if (!items.length) { page.append(h('p', { class: 'muted' }, 'Tap ☆ on any update to keep it here.')); return; }
      page.append(h('div', { class: 'saved-grid' }, items.map((p) =>
        h('a', { href: `/p/${p.id}`, 'data-link': true },
          p.mediaUrl ? h('img', { src: p.mediaUrl, alt: '', loading: 'lazy' }) : h('div', { class: 'fallback', style: 'font-size:60px' }, INDUSTRY_ICONS[p.industry] || '🏢'),
          h('span', {}, p.headline)))));
    } catch (e) { toast(e.message); }
  }

  function renderProfile() {
    const page = h('div', { class: 'page phone' }, h('h1', {}, 'Profile'));
    if (!me) {
      page.append(h('div', { class: 'card-box' },
        h('b', {}, 'Log in to like, save and follow'),
        h('p', { class: 'muted' }, 'Your For You feed gets smarter when you do.'),
        h('button', { class: 'btn', onclick: openAuth }, 'Log in or sign up')));
    } else {
      page.append(h('div', { class: 'list' }, h('div', { class: 'row' },
        h('div', { class: 'avatar' }, me.name[0]), h('div', {}, h('b', {}, me.name), h('small', {}, me.email)))));
    }
    page.append(h('h2', {}, 'Your interests'),
      h('div', { class: 'pickers' },
        store.interests.map((i) => h('span', { class: 'pick on' }, `${INDUSTRY_ICONS[i] || ''} ${titleCase(i)}`)),
        h('button', { class: 'pick', onclick: () => go('/welcome') }, '✎ Edit')));

    const toggle = h('input', { type: 'checkbox', checked: store.breakReminder, 'aria-label': 'Break reminders' });
    toggle.onchange = () => { store.breakReminder = toggle.checked; };
    page.append(h('h2', {}, 'Settings'),
      h('label', { class: 'switch' }, h('div', {}, h('b', {}, 'Break reminders'), h('small', { class: 'muted', style: 'display:block' }, 'A gentle nudge after 30 minutes of scrolling')), toggle));

    if (me && ['EDITOR', 'ADMIN', 'COMPANY_ADMIN'].includes(me.role)) {
      page.append(h('a', { class: 'btn ghost', href: '/review', 'data-link': true, style: 'display:block;text-align:center;text-decoration:none;margin-top:16px' }, '✅ Review queue'));
    }
    if (me) {
      page.append(h('div', { class: 'stack', style: 'margin-top:16px' },
        h('button', { class: 'btn ghost', onclick: () => { store.token = null; me = null; Object.keys(feeds).forEach((k) => delete feeds[k]); renderProfile(); toast('Logged out'); } }, 'Log out'),
        h('button', { class: 'btn danger', onclick: deleteAccount }, 'Delete my account and data')));
    }
    page.append(h('p', { class: 'muted', style: 'text-align:center;margin-top:28px;font-size:12px' }, 'Aoberonz 1.0 · We never identify people in footage.'));
    view.replaceChildren(page);
  }

  async function deleteAccount() {
    if (!confirm('Delete your account, likes, saves and history? This cannot be undone.')) return;
    try { await api('/me', { method: 'DELETE' }); store.token = null; me = null; toast('Account deleted'); renderProfile(); }
    catch (e) { toast(e.message); }
  }

  async function renderReview() {
    const page = h('div', { class: 'page' }, h('h1', {}, 'Review queue'));
    view.replaceChildren(page);
    let items;
    try { items = (await api('/review/queue')).items; } catch (e) { page.append(h('p', { class: 'muted' }, e.message)); return; }
    if (!items.length) { page.append(h('p', { class: 'muted' }, 'Nothing waiting. Nice.')); return; }
    for (const d of items) {
      const headline = h('input', { type: 'text', value: d.headline, 'aria-label': 'Headline' });
      const summary = h('textarea', { 'aria-label': 'Summary' }, d.summary);
      const box = h('div', { class: 'card-box' },
        h('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:8px' },
          h('span', { class: `risk ${d.risk}` }, d.risk), h('b', {}, d.company.name),
          d.event ? h('span', { class: 'muted', style: 'margin-left:auto' }, `${Math.round(d.event.confidence * 100)}% sure`) : null),
        h('div', { class: 'stack' }, headline, summary),
        d.event ? h('p', { class: 'muted', style: 'font-size:12px' }, `Source event: ${d.event.kind} · ${d.event.labels.join(', ')}`) : null,
        h('div', { class: 'row-end' },
          h('button', { class: 'btn ghost', onclick: async () => {
            try { await api(`/review/${d.id}/reject`, { method: 'POST', body: { note: 'Rejected on web' } }); box.remove(); toast('Rejected'); } catch (e) { toast(e.message); }
          } }, 'Reject'),
          h('button', { class: 'btn', onclick: async () => {
            try { await api(`/review/${d.id}/approve`, { method: 'POST', body: { headline: headline.value, summary: summary.value } }); box.remove(); toast('Published'); } catch (e) { toast(e.message); }
          } }, 'Publish')));
      page.append(box);
    }
  }

  async function renderCompany(slug) {
    const page = h('div', { class: 'page phone' }, h('p', { class: 'muted' }, 'Loading…'));
    view.replaceChildren(page);
    try {
      const c = await api(`/companies/${slug}`);
      const follow = h('button', { class: `btn ${c.following ? 'ghost' : ''}` }, c.following ? 'Following' : 'Follow');
      follow.onclick = async () => {
        if (needLogin()) return;
        const r = await api(`/companies/${c.id}/follow`, { method: 'POST' });
        follow.textContent = r.following ? 'Following' : 'Follow';
        follow.className = `btn ${r.following ? 'ghost' : ''}`;
      };
      page.replaceChildren(
        h('a', { href: '/explore', 'data-link': true, class: 'muted' }, '← Explore'),
        h('h1', {}, `${INDUSTRY_ICONS[c.industry] || '🏢'} ${c.name} ${c.verified ? '✔' : ''}`),
        h('p', { class: 'muted' }, `${titleCase(c.industry)} · ${c.county || 'Kenya'} · ${c._count.followers} followers · ${c._count.posts} updates`),
        follow);
    } catch (e) { page.replaceChildren(h('p', {}, e.message)); }
  }

  async function renderPost(id) {
    const host = h('div', { style: 'height:100%' });
    view.replaceChildren(h('div', { class: 'feed-wrap phone' },
      h('div', { class: 'tabs' }, h('button', { class: 'on', onclick: () => go('/') }, 'Open the feed →')), host));
    try {
      const p = await api(`/posts/${id}`);
      const f = newFeed('latest');
      f.items = [p]; f.hasMore = false;
      const scroller = h('div', { class: 'feed' }, postCard(p, f));
      host.append(scroller);
      document.title = `${p.headline} — Aoberonz`;
    } catch (e) { host.append(h('div', { class: 'empty' }, e.message)); }
  }

  // ---------------------------------------------------------------- dialogs
  function openAuth() {
    const dlg = $('#modal');
    let register = true;
    const draw = () => {
      const name = h('input', { type: 'text', placeholder: 'Name', autocomplete: 'name' });
      const email = h('input', { type: 'email', placeholder: 'Email', autocomplete: 'email', required: true });
      const password = h('input', { type: 'password', placeholder: 'Password (8+ characters)', autocomplete: register ? 'new-password' : 'current-password', minlength: '8', required: true });
      const submit = h('button', { class: 'btn', type: 'submit' }, register ? 'Create account' : 'Log in');
      const form = h('form', { class: 'stack' },
        h('h2', {}, register ? 'Create account' : 'Log in'),
        register ? name : null, email, password, submit,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { register = !register; draw(); } },
          register ? 'I already have an account' : 'New here? Create an account'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Not now'),
        h('small', { class: 'muted' }, 'By continuing you agree to the Terms and Privacy Policy.'));
      form.onsubmit = async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          const res = register
            ? await api('/auth/register', { method: 'POST', body: { name: name.value.trim(), email: email.value.trim(), password: password.value, interests: store.interests } })
            : await api('/auth/login', { method: 'POST', body: { email: email.value.trim(), password: password.value } });
          store.token = res.token;
          await loadMe();
          Object.keys(feeds).forEach((k) => delete feeds[k]);
          dlg.close();
          toast(`Welcome, ${me.name}`);
          route();
        } catch (err) { toast(err.message); submit.disabled = false; }
      };
      dlg.replaceChildren(form);
    };
    draw();
    dlg.showModal();
  }

  function openReport(p, f) {
    const dlg = $('#modal');
    const reasons = ['Wrong or misleading', 'Shows a person who could be identified', 'Harmful or unsafe', 'Spam'];
    dlg.replaceChildren(h('div', { class: 'stack' },
      h('h2', {}, 'Report this update'),
      reasons.map((r) => h('button', { class: 'btn ghost', onclick: async () => {
        dlg.close();
        if (needLogin()) return;
        try {
          await api(`/posts/${p.id}/report`, { method: 'POST', body: { reason: r } });
          toast('Thanks. Our editors will check it.');
        } catch (e) { toast(e.message); }
      } }, r)),
      h('button', { class: 'btn', onclick: () => dlg.close() }, 'Cancel')));
    dlg.showModal();
  }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') e.target.close(); });

  // ---------------------------------------------------------------- live updates
  let socket;
  function subscribeRooms() { socket?.emit('subscribe', store.interests.map((i) => `industry:${i}`)); }
  function connectLive() {
    if (typeof io !== 'function') return;
    socket = io({ transports: ['websocket'] });
    socket.on('connect', subscribeRooms);
    socket.on('post:new', () => { newCount++; paintPill(); });
  }

  // ---------------------------------------------------------------- start
  async function loadMe() {
    if (!store.token) { me = null; return; }
    try {
      const u = await api('/me');
      me = u;
      if (u.interests?.length) { store.interests = u.interests.map((i) => i.industry); store.onboarded = true; }
    } catch { store.token = null; me = null; }
  }

  loadMe().then(() => { connectLive(); route(); });
})();
