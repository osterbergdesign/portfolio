// Portfolio editor — forms on the left, the real site on the right.
// Every change saves to the content files after a short pause; Publish makes it live.

// ------------------------------------------------------------------ helpers
const $ = (sel, el = document) => el.querySelector(sel);
let uid = 0;
const nextId = () => `f${++uid}`;

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}
const str = (v) => typeof v === 'string' && v.trim().length > 0;
const basename = (p) => String(p || '').split('/').pop();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const api = {
  async req(method, url, body) {
    const res = await fetch(`/__editor/api/${url}`, {
      method,
      headers: { 'X-Editor': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      location.href = '/__editor/login';
      throw new Error('Logged out');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
    return data;
  },
  get: (u) => api.req('GET', u),
  put: (u, b) => api.req('PUT', u, b),
  post: (u, b) => api.req('POST', u, b || {}),
  del: (u) => api.req('DELETE', u),
  upload(params, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/__editor/api/upload?${new URLSearchParams({ ...params, name: file.name })}`);
      xhr.setRequestHeader('X-Editor', '1');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status === 401) location.href = '/__editor/login';
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || (xhr.status === 413 ? 'That file is too big.' : `Upload failed (${xhr.status})`)));
      };
      xhr.onerror = () => reject(new Error('Upload failed — check the connection.'));
      xhr.send(file);
    });
  },
};
const imgUrl = (slug, src, w = 600) => `/__editor/img?${new URLSearchParams({ slug: slug || '', name: basename(src), w })}`;

// ------------------------------------------------------------------ state
const S = {
  overview: null,
  cur: null, // { type, slug, data, body, dirty }
  saveTimer: null,
  saving: null,
  scrollMemo: null,
  lastLoad: 0,
  navAt: 0,
  openCards: new WeakSet(),
};
const PAGES = [
  { type: 'home', title: 'Home & footer', icon: 'circle' },
  { type: 'about', title: 'About & CV', icon: 'square' },
  { type: 'consulting', title: 'Consulting', icon: 'triangle' },
];
const urlFor = (it) => (it.type === 'project' ? `/projects/${it.slug}/` : { home: '/', about: '/about/', consulting: '/consulting/' }[it.type]);
const keyOf = (it) => (it.type === 'project' ? `project/${it.slug}` : it.type);
const projectBySlug = (slug) => S.overview?.projects.find((p) => p.slug === slug);

// ------------------------------------------------------------------ field specs
const ACCENTS = [
  ['rust', 'Rust', '#ad542d', '#faf8f3'],
  ['navy', 'Navy', '#243049', '#faf8f3'],
  ['olive', 'Olive', '#5b6837', '#faf8f3'],
  ['mustard', 'Mustard', '#d9a43a', '#1f2636'],
  ['sand', 'Sand', '#dccdb2', '#1f2636'],
];
const itemFields = (extra = []) => [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'text', label: 'Text', type: 'textarea', rows: 3 },
  ...extra,
];
const cvEntry = (label) => ({
  key: label.toLowerCase(),
  type: 'objects',
  add: `Add ${label === 'Education' ? 'an education' : 'a job'}`,
  summary: (o) => [o.period, o.title].filter((v) => v !== undefined && v !== '').join(' · '),
  newItem: () => ({ period: '', title: '', place: '' }),
  fields: [
    { key: 'period', label: 'When', type: 'text', placeholder: '2023– or 2019–2022' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'place', label: 'Where', type: 'text' },
    { key: 'note', label: 'Note', type: 'textarea', rows: 2, optional: true },
  ],
});

const SPECS = {
  project: [
    {
      group: 'Basics',
      fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'tagline', label: 'Tagline', type: 'textarea', rows: 2, hint: 'One line under the title — also on the project card.' },
        { key: 'summary', label: 'Summary', type: 'textarea', rows: 3, hint: 'On the big home-page card and in link previews.' },
        { key: 'category', label: 'Shown under', type: 'select', options: [['work', 'Design work'], ['hobby', 'Hobby projects']] },
        { type: 'position' },
        { key: 'accent', label: 'Colour', type: 'swatches' },
        { key: 'draft', label: 'Draft — only visible here in the editor, not on the live site', type: 'checkbox', omitFalse: true },
        { key: 'featured', label: 'Feature on the home page (the first three featured design work projects show there)', type: 'checkbox', omitFalse: true },
      ],
    },
    { group: 'Cover image', hint: 'Click the image to choose the part that cards keep when they crop it.', fields: [{ type: 'cover' }] },
    {
      group: 'Facts',
      hint: 'The fact sheet beside the story.',
      fields: [
        { key: 'year', label: 'Year', type: 'number', optional: true },
        { key: 'context', label: 'Context', type: 'text', optional: true, hint: 'Course code and name, client or employer.' },
        { key: 'team', label: 'Team', type: 'text', placeholder: 'Solo project' },
        { key: 'role', label: 'My role', type: 'textarea', rows: 2, optional: true, hint: 'Leave empty if the work was evenly shared.' },
        { key: 'disciplines', label: 'Disciplines', type: 'tags', suggest: 'disciplines', hint: 'Drives the filter on the Projects page — reuse the same words. Press Enter after each one.' },
        { key: 'tools', label: 'Tools and methods', type: 'tags' },
      ],
    },
    { group: 'At a glance', hint: 'Short bullets for people who skim.', fields: [{ key: 'highlights', type: 'strings', add: 'Add a highlight' }] },
    { group: 'Story', hint: 'The text of the project page. A line starting with ## is a heading.', fields: [{ type: 'markdown' }] },
    { group: 'Gallery', hint: 'Images under the story. Drag them to reorder.', fields: [{ type: 'gallery' }] },
    { group: 'Film', fields: [{ type: 'film' }] },
    {
      group: 'Links',
      hint: 'Buttons under the title, for example the code on GitHub.',
      fields: [
        {
          key: 'links',
          type: 'objects',
          add: 'Add a link',
          summary: (o) => o.label,
          newItem: () => ({ label: 'View on GitHub', url: 'https://' }),
          fields: [
            { key: 'label', label: 'Button text', type: 'text' },
            { key: 'url', label: 'Address', type: 'text', inputType: 'url' },
          ],
        },
      ],
    },
    { group: '', fields: [{ type: 'delete-project' }] },
  ],

  about: [
    {
      group: 'You',
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'headline', label: 'Headline', type: 'text' },
        { key: 'location', label: 'Based in', type: 'text' },
        { key: 'availability', label: 'Availability', type: 'textarea', rows: 2, optional: true, hint: 'The coloured box on the home and About pages. Leave empty to hide it.' },
      ],
    },
    {
      group: 'Contact',
      hint: 'Used on the About page, in the header and in the footer.',
      fields: [
        { key: 'email', label: 'Email', type: 'text', inputType: 'email' },
        { key: 'phone', label: 'Phone', type: 'text', optional: true },
        { key: 'website', label: 'Website', type: 'text', inputType: 'url', optional: true },
        { key: 'linkedin', label: 'LinkedIn', type: 'text', inputType: 'url', optional: true, placeholder: 'https://www.linkedin.com/in/…' },
        { key: 'github', label: 'GitHub', type: 'text', inputType: 'url', optional: true },
      ],
    },
    { group: 'CV download', fields: [{ type: 'cv' }] },
    { group: 'Bio', hint: 'The text at the top of the About page.', fields: [{ type: 'markdown', rows: 10 }] },
    { group: 'Education', fields: [cvEntry('Education')] },
    { group: 'Experience', fields: [cvEntry('Experience')] },
    {
      group: 'Skills',
      fields: [
        {
          key: 'skills',
          type: 'objects',
          add: 'Add a skill group',
          summary: (o) => o.group,
          newItem: () => ({ group: 'New group', items: [] }),
          fields: [
            { key: 'group', label: 'Group', type: 'text' },
            { key: 'items', label: 'Skills', type: 'tags' },
          ],
        },
      ],
    },
  ],

  consulting: [
    {
      group: 'Top of the page',
      fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'lede', label: 'Introduction', type: 'textarea', rows: 3 },
      ],
    },
    {
      group: 'Services',
      fields: [
        {
          key: 'services',
          type: 'objects',
          add: 'Add a service',
          summary: (o) => o.title,
          newItem: () => ({ title: 'New service', text: '', accent: 'rust' }),
          fields: itemFields([{ key: 'accent', label: 'Colour', type: 'swatches' }]),
        },
      ],
    },
    {
      group: 'How it works',
      fields: [{ key: 'steps', type: 'objects', add: 'Add a step', summary: (o) => o.title, newItem: () => ({ title: 'New step', text: '' }), fields: itemFields() }],
    },
    { group: 'Next to the form', fields: [{ type: 'markdown', rows: 6 }] },
    { group: 'Form', fields: [{ key: 'topics', label: 'Choices in “What is it about?”', type: 'strings', add: 'Add a choice' }] },
  ],

  home: [
    {
      group: 'Top of the page',
      fields: [
        { key: 'heroLabel', label: 'Small heading above PORTFOLIO.', type: 'text' },
        { key: 'heroCaption', label: 'Caption in the coloured panel', type: 'textarea', rows: 2, optional: true },
      ],
    },
    {
      group: 'Introduction',
      fields: [
        { key: 'intro', label: 'Big introduction', type: 'textarea', rows: 4 },
        { key: 'availabilityNote', label: 'Small text in the availability box', type: 'text', optional: true, hint: 'The box heading itself is “Availability” on the About & CV page.' },
      ],
    },
    {
      group: 'How I work',
      hint: 'The shapes follow the order: circle, square, triangle, quarter circle.',
      fields: [
        { key: 'stepsTitle', label: 'Heading', type: 'text' },
        { key: 'steps', type: 'objects', add: 'Add a step', summary: (o) => o.title, newItem: () => ({ title: 'New step', text: '' }), fields: itemFields() },
      ],
    },
    {
      group: 'Moving words',
      hint: 'The two rows of big words that slide as you scroll. Empty both to hide the band.',
      fields: [
        { key: 'marquee', label: 'Top row', type: 'tags' },
        { key: 'marqueeOutline', label: 'Outlined row', type: 'tags' },
      ],
    },
    { group: 'Selected work', hint: 'Projects marked “Feature on the home page” appear here.', fields: [{ key: 'selectedTitle', label: 'Heading', type: 'text' }] },
    {
      group: 'Consulting banner',
      fields: [
        {
          key: 'cta',
          type: 'object',
          newItem: () => ({ show: true, kicker: 'Consulting', title: '', text: '', button: 'What I can help with' }),
          fields: [
            { key: 'show', label: 'Show the banner', type: 'checkbox' },
            { key: 'kicker', label: 'Small heading', type: 'text' },
            { key: 'title', label: 'Big heading', type: 'textarea', rows: 2 },
            { key: 'text', label: 'Text', type: 'textarea', rows: 3 },
            { key: 'button', label: 'Button text', type: 'text' },
          ],
        },
      ],
    },
    {
      group: 'Projects page',
      fields: [
        { key: 'projectsLede', label: 'Introduction — Design work', type: 'textarea', rows: 3, hint: '{count} becomes the number of design work projects.' },
        { key: 'hobbyLede', label: 'Introduction — Hobby projects', type: 'textarea', rows: 3 },
      ],
    },
    { group: 'Footer', fields: [{ key: 'footerTitle', label: 'Big line in the footer', type: 'textarea', rows: 2 }] },
  ],
};

function validate(type, d) {
  const problems = [];
  const need = (ok, msg) => ok || problems.push(msg);
  if (type === 'project') {
    need(str(d.title), 'the project needs a title');
    need(str(d.team), 'fill in Team, for example “Solo project”');
    need(Array.isArray(d.disciplines) && d.disciplines.length > 0, 'add at least one discipline');
    need(str(d.cover), 'the project needs a cover image');
    for (const l of d.links || []) need(/^https?:\/\/[^\s.]+\.\S+/.test(l.url || ''), `the link “${l.label || ''}” needs a full address starting with https://`);
    if (d.film) need(str(d.film.src), 'the film has no video file');
  }
  if (type === 'about') {
    need(str(d.name), 'fill in your name');
    need(str(d.headline), 'fill in the headline');
    need(str(d.location), 'fill in where you are based');
    need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || ''), 'check the email address');
    for (const s of d.skills || []) need(str(s.group), 'every skill group needs a name');
  }
  if (type === 'consulting') {
    need(str(d.title), 'the page needs a title');
    need(str(d.lede), 'fill in the introduction');
    need((d.services || []).length > 0, 'add at least one service');
    need((d.topics || []).length > 0, 'add at least one choice for the form');
  }
  if (type === 'home') {
    need(str(d.heroLabel), 'fill in the small heading at the top');
    need(str(d.intro), 'fill in the introduction');
    need(str(d.projectsLede) && str(d.hobbyLede), 'fill in both Projects page introductions');
    need(str(d.footerTitle), 'fill in the footer line');
    if (d.cta) need(str(d.cta.title), 'the consulting banner needs a big heading');
  }
  return problems.length ? problems[0][0].toUpperCase() + problems[0].slice(1) + '.' : null;
}

// ------------------------------------------------------------------ status, toasts, dialog
function setStatus(text, kind = '') {
  const el = $('#save-status');
  el.textContent = text;
  el.className = `bar__status${kind ? ` is-${kind}` : ''}`;
}

function toast(text, kind = '', { sticky = false, sub = '', action } = {}) {
  const t = h(
    'div',
    { class: `toast${kind ? ` is-${kind}` : ''}` },
    kind === 'busy' ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : null,
    h('div', { class: 'toast__text' }, h('span', { class: 'toast__main', text }), h('small', { class: 'toast__sub', text: sub })),
    action ? h('button', { type: 'button', onclick: action.run, text: action.label }) : null,
    h('button', { type: 'button', 'aria-label': 'Close', onclick: () => t.remove(), text: '✕' }),
  );
  $('#toasts').append(t);
  if (!sticky) setTimeout(() => t.remove(), kind === 'error' ? 12000 : 6000);
  return t;
}

function dialog(title, body, buttons = [{ label: 'Close' }]) {
  const d = $('#dialog');
  return new Promise((resolve) => {
    d.replaceChildren(
      h('div', { class: 'dialog__body' }, h('h2', { text: title }), body),
      h(
        'div',
        { class: 'dialog__foot' },
        buttons.map((b) =>
          h('button', {
            type: 'button',
            class: `btn ${b.primary ? 'btn--primary' : ''} ${b.danger ? 'btn--danger' : ''}`,
            text: b.label,
            onclick: () => {
              d.close();
              resolve(b.value);
            },
          }),
        ),
      ),
    );
    // A close event from the previous dialog can arrive after this one has opened; ignore it then.
    d.onclose = () => {
      if (!d.open) resolve(undefined);
    };
    d.showModal();
  });
}

// ------------------------------------------------------------------ saving
function changed() {
  if (!S.cur) return;
  S.cur.dirty = true;
  setStatus('Unsaved changes…');
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(save, 700);
}

async function save() {
  clearTimeout(S.saveTimer);
  S.saveTimer = null;
  if (S.saving) {
    await S.saving;
    if (!S.cur?.dirty) return;
  }
  const cur = S.cur;
  if (!cur || !cur.dirty) return;
  const problem = validate(cur.type, cur.data);
  if (problem) {
    setStatus(`Not saved yet — ${problem}`, 'error');
    return;
  }
  cur.dirty = false;
  setStatus('Saving…');
  memoScroll();
  S.saving = api
    .put('entry', { type: cur.type, slug: cur.slug, data: JSON.parse(JSON.stringify(cur.data)), body: cur.body })
    .then(() => {
      setStatus('Saved — publish when you are ready', 'ok');
      reloadPreviewSoon();
      refreshOverview();
    })
    .catch((e) => {
      cur.dirty = true;
      setStatus(`Not saved — ${e.message}`, 'error');
    })
    .finally(() => {
      S.saving = null;
    });
  await S.saving;
  if (cur.dirty && cur === S.cur && !S.saveTimer) S.saveTimer = setTimeout(save, 700);
}

async function flush() {
  if (S.saveTimer || S.cur?.dirty) await save();
  if (S.saving) await S.saving;
  return !S.cur?.dirty;
}

window.addEventListener('beforeunload', (e) => {
  if (S.cur?.dirty || S.saving) {
    save();
    e.preventDefault();
    e.returnValue = '';
  }
});

// ------------------------------------------------------------------ preview
const frame = () => $('#preview');
function memoScroll() {
  try {
    const w = frame().contentWindow;
    S.scrollMemo = { path: w.location.pathname, y: w.scrollY, at: Date.now() };
  } catch {}
}
function reloadPreviewSoon() {
  const asked = Date.now();
  // The preview usually reloads by itself when a file changes; reload it ourselves if it didn't —
  // unless it has been sent to another page in the meantime.
  setTimeout(() => {
    if (S.lastLoad < asked && S.navAt < asked) {
      memoScroll();
      try {
        frame().contentWindow.location.reload();
      } catch {}
    }
  }, 1300);
}
function showInPreview(url) {
  try {
    if (frame().contentWindow.location.pathname === url) return;
  } catch {}
  S.navAt = Date.now();
  frame().src = url;
}
function onPreviewLoad() {
  S.lastLoad = Date.now();
  let path = '';
  try {
    path = frame().contentWindow.location.pathname;
  } catch {}
  $('#preview-path').textContent = path;
  const memo = S.scrollMemo;
  if (memo && memo.path === path && Date.now() - memo.at < 20000) {
    const restore = () => {
      try {
        frame().contentWindow.scrollTo({ top: memo.y, behavior: 'instant' });
      } catch {}
    };
    restore();
    setTimeout(restore, 250);
    setTimeout(restore, 900);
  }
  // Clicking around in the preview opens the matching page in the form.
  let target = null;
  const m = path.match(/^\/projects\/([a-z0-9-]+)\/?$/);
  if (m && m[1] !== 'hobby' && projectBySlug(m[1])) target = { type: 'project', slug: m[1] };
  else if (path === '/') target = { type: 'home' };
  else if (/^\/about\/?$/.test(path)) target = { type: 'about' };
  else if (/^\/consulting\/?$/.test(path)) target = { type: 'consulting' };
  // (Only when the preview went somewhere on its own — not while it is still catching up with the form.)
  const expected = S.cur ? urlFor(S.cur) : '';
  const settling = Date.now() - S.navAt < 4000 && path !== expected;
  if (target && !settling && (!S.cur || keyOf(target) !== keyOf(S.cur))) openItem(target, { navigate: false });
}

// ------------------------------------------------------------------ overview + sidebar
let overviewTimer = null;
function refreshOverview() {
  clearTimeout(overviewTimer);
  overviewTimer = setTimeout(loadOverview, 250);
}
async function loadOverview() {
  const ov = await api.get('overview');
  if (ov.starting) return ov;
  S.overview = ov;
  renderSidebar();
  renderChanges();
  $('#live-link').href = ov.siteUrl;
  return ov;
}

function renderChanges() {
  const n = S.overview.changes.length;
  const btn = $('#changes-btn');
  const pending = S.overview.unpushed;
  btn.textContent = n ? plural(n, 'unpublished change', 'unpublished changes') : pending ? 'Not on GitHub yet' : 'Everything is published';
  btn.classList.toggle('btn--has-changes', n > 0 || pending > 0);
}

function describeChange(c) {
  const f = c.file;
  const m = f.match(/^src\/content\/projects\/([^/]+)\/(.+)$/);
  if (m) {
    const t = projectBySlug(m[1])?.title || m[1];
    return m[2] === 'index.md' ? `${t} — text and settings` : `${t} — ${m[2]}`;
  }
  const pages = { 'src/content/about.md': 'About & CV', 'src/content/home.md': 'Home & footer', 'src/content/consulting.md': 'Consulting' };
  if (pages[f]) return pages[f];
  if (f.startsWith('public/videos/')) return `Film file — ${basename(f)}`;
  if (f.endsWith('.pdf')) return `CV file — ${basename(f)}`;
  return f;
}
const changeKind = (code) => (code.includes('?') || code.includes('A') ? 'New' : code.includes('D') ? 'Removed' : 'Changed');

function renderSidebar() {
  const nav = $('#sidebar');
  const cur = S.cur ? keyOf(S.cur) : '';
  const item = (it, extra = []) =>
    h(
      'button',
      {
        type: 'button',
        class: 'side-item',
        'aria-current': keyOf(it) === cur ? 'true' : 'false',
        onclick: () => {
          document.body.classList.remove('menu-open');
          openItem(it);
        },
      },
      ...extra,
    );
  const pages = h(
    'div',
    { class: 'side-group' },
    h('h2', { text: 'Pages' }),
    h(
      'ul',
      { class: 'side-list' },
      PAGES.map((p) =>
        h('li', {}, item(p, [h('span', { class: 'side-item__icon', 'aria-hidden': 'true' }, h('span', { class: `shape-${p.icon}`, style: shapeStyle(p.icon) })), h('span', { class: 'side-item__label', text: p.title })])),
      ),
    ),
  );
  const groups = [
    ['work', 'Design work'],
    ['hobby', 'Hobby projects'],
  ].map(([cat, label]) => {
    const list = h('ul', { class: 'side-list', dataset: undefined });
    list.dataset.category = cat;
    for (const p of S.overview.projects.filter((x) => x.category === cat)) {
      const li = h(
        'li',
        { draggable: 'true' },
        item({ type: 'project', slug: p.slug }, [
          p.cover ? h('img', { class: 'side-item__thumb', src: imgUrl(p.slug, p.cover, 96), alt: '', loading: 'lazy' }) : h('span', { class: 'side-item__thumb' }),
          h('span', { class: 'side-item__label', text: p.title }),
          p.draft ? h('span', { class: 'side-item__badge', text: 'Draft' }) : p.featured ? h('span', { class: 'side-item__badge', text: 'Home' }) : null,
        ]),
      );
      li.dataset.slug = p.slug;
      list.append(li);
    }
    enableSidebarDrag(list);
    return h('div', { class: 'side-group' }, h('h2', { text: label }), list);
  });
  nav.replaceChildren(
    pages,
    ...groups,
    h('button', { type: 'button', class: 'btn side-new', onclick: newProject, text: '+ New project' }),
    h('p', { class: 'side-hint', text: 'Drag projects to change their order.' }),
  );
}
function shapeStyle(shape) {
  return {
    circle: 'border-radius:50%',
    square: '',
    triangle: 'clip-path:polygon(50% 0,100% 100%,0 100%)',
  }[shape];
}

function enableSidebarDrag(list) {
  let dragged = null;
  list.addEventListener('dragstart', (e) => {
    dragged = e.target.closest('li');
    if (!dragged) return;
    dragged.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragged.dataset.slug);
  });
  list.addEventListener('dragend', () => {
    dragged?.classList.remove('dragging');
    list.querySelectorAll('li').forEach((li) => li.classList.remove('drop-before', 'drop-after'));
    dragged = null;
  });
  list.addEventListener('dragover', (e) => {
    const li = e.target.closest('li');
    if (!dragged || !li || li === dragged) return;
    e.preventDefault();
    const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    list.querySelectorAll('li').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
    li.classList.add(after ? 'drop-after' : 'drop-before');
  });
  list.addEventListener('drop', async (e) => {
    const li = e.target.closest('li');
    if (!dragged || !li || li === dragged) return;
    e.preventDefault();
    const after = li.classList.contains('drop-after');
    li[after ? 'after' : 'before'](dragged);
    const slugs = [...list.querySelectorAll('li')].map((x) => x.dataset.slug);
    await reorder(slugs);
  });
}

async function reorder(slugs) {
  await flush();
  try {
    await api.post('order', { slugs });
    if (S.cur?.type === 'project' && slugs.includes(S.cur.slug)) {
      const fresh = await api.get(`entry?${new URLSearchParams({ type: 'project', slug: S.cur.slug })}`);
      S.cur.data.order = fresh.data.order;
    }
    setStatus('Order saved', 'ok');
    await loadOverview();
    reloadPreviewSoon();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ------------------------------------------------------------------ open an item
async function openItem(it, { navigate = true } = {}) {
  if (!(await flush())) {
    toast('Fix the problem shown at the top before switching pages — or your last change stays unsaved.', 'error');
    return;
  }
  try {
    const entry = await api.get(`entry?${new URLSearchParams({ type: it.type, slug: it.slug || '' })}`);
    S.cur = { type: it.type, slug: it.slug, data: entry.data, body: entry.body || '', dirty: false };
  } catch (e) {
    toast(e.message, 'error');
    return;
  }
  history.replaceState(null, '', `#${keyOf(it)}`);
  renderForm();
  renderSidebar();
  setStatus('');
  if (navigate) showInPreview(urlFor(it));
  if (innerWidth <= 980 && navigate) setPane('form');
}

function renderForm() {
  const cur = S.cur;
  const ctx = { changed, slug: cur.slug, cur };
  const title =
    cur.type === 'project' ? cur.data.title || cur.slug : PAGES.find((p) => p.type === cur.type)?.title || cur.type;
  const sub =
    cur.type === 'project'
      ? `Address: /projects/${cur.slug}/${cur.data.draft ? ' · Draft — not on the live site' : ''}`
      : `Address: ${urlFor(cur)}`;
  const form = $('#form');
  form.replaceChildren(
    h('div', { class: 'form-head' }, h('h1', { text: title })),
    h('p', { class: 'form-sub', text: sub }),
    ...SPECS[cur.type].map((g) =>
      h(
        'section',
        { class: g.group ? 'group' : '' },
        g.group ? h('h2', { text: g.group }) : null,
        g.hint ? h('p', { class: 'group-hint', text: g.hint }) : null,
        g.fields.map((f) => renderField(f, cur.data, ctx)),
      ),
    ),
  );
  $('#form-pane').scrollTop = 0;
  requestAnimationFrame(() => form.querySelectorAll('textarea').forEach(autosize));
}

// ------------------------------------------------------------------ field renderers
function setVal(obj, spec, v) {
  if (spec.optional && (v === '' || v === null || v === undefined || Number.isNaN(v))) delete obj[spec.key];
  else obj[spec.key] = v;
}
function autosize(t) {
  t.style.height = 'auto';
  t.style.height = `${Math.min(t.scrollHeight + 4, 600)}px`;
}
function wrap(spec, control, id, extra) {
  return h(
    'div',
    { class: 'field' },
    spec.label ? h('label', { for: id, text: spec.label }) : null,
    control,
    extra,
    spec.hint ? h('p', { class: 'hint', text: spec.hint }) : null,
  );
}

function renderField(spec, obj, ctx) {
  const id = nextId();
  const v = obj[spec.key];
  switch (spec.type) {
    case 'text': {
      const input = h('input', {
        id,
        type: spec.inputType || 'text',
        value: v === undefined || v === null ? '' : String(v),
        placeholder: spec.placeholder,
        oninput: () => {
          setVal(obj, spec, input.value);
          ctx.changed();
        },
      });
      return wrap(spec, input, id);
    }
    case 'number': {
      const input = h('input', {
        id,
        type: 'number',
        value: v ?? '',
        oninput: () => {
          setVal(obj, spec, input.value === '' ? '' : Math.round(Number(input.value)));
          ctx.changed();
        },
      });
      return wrap(spec, input, id);
    }
    case 'textarea': {
      const ta = h('textarea', {
        id,
        rows: spec.rows || 3,
        value: v ?? '',
        placeholder: spec.placeholder,
        oninput: () => {
          setVal(obj, spec, ta.value);
          autosize(ta);
          ctx.changed();
        },
      });
      return wrap(spec, ta, id);
    }
    case 'checkbox': {
      const box = h('input', {
        id,
        type: 'checkbox',
        checked: !!v,
        onchange: () => {
          if (!box.checked && spec.omitFalse) delete obj[spec.key];
          else obj[spec.key] = box.checked;
          ctx.changed();
          if (spec.key === 'draft' && S.cur && obj === S.cur.data) renderFormHeadOnly();
        },
      });
      return h('label', { class: 'check', for: id }, box, h('span', { text: spec.label }));
    }
    case 'select': {
      const sel = h(
        'select',
        {
          id,
          onchange: () => {
            obj[spec.key] = sel.value;
            ctx.changed();
            if (spec.key === 'category') setTimeout(refreshOverview, 900);
          },
        },
        spec.options.map(([value, label]) => h('option', { value, text: label })),
      );
      sel.value = v ?? spec.options[0][0];
      return wrap(spec, sel, id);
    }
    case 'swatches': {
      const name = nextId();
      const current = v || 'rust';
      return h(
        'div',
        { class: 'field' },
        h('span', { class: 'label', text: spec.label }),
        h(
          'div',
          { class: 'swatches', role: 'radiogroup', 'aria-label': spec.label },
          ACCENTS.map(([value, label, bg, fg]) =>
            h(
              'label',
              { class: 'swatch' },
              h('input', {
                type: 'radio',
                name,
                value,
                checked: current === value,
                onchange: () => {
                  obj[spec.key] = value;
                  ctx.changed();
                },
              }),
              h('span', { style: `background:${bg};color:${fg}`, text: label }),
            ),
          ),
        ),
      );
    }
    case 'tags':
      return renderTags(spec, obj, ctx, id);
    case 'strings':
      return renderStrings(spec, obj, ctx);
    case 'objects':
      return renderObjects(spec, obj, ctx);
    case 'object': {
      if (!obj[spec.key]) obj[spec.key] = spec.newItem();
      return h('div', {}, spec.fields.map((f) => renderField(f, obj[spec.key], ctx)));
    }
    case 'markdown':
      return renderMarkdown(spec, ctx);
    case 'cover':
      return renderCover(obj, ctx);
    case 'gallery':
      return renderGallery(obj, ctx);
    case 'film':
      return renderFilm(obj, ctx);
    case 'cv':
      return renderCv(obj, ctx);
    case 'position':
      return renderPosition(obj);
    case 'delete-project':
      return h(
        'div',
        { class: 'danger' },
        h('button', { type: 'button', class: 'btn btn--danger', onclick: deleteProject, text: 'Delete this project' }),
        h('p', { class: 'hint', style: 'margin-top:6px', text: 'Removes the project and its images. Until you publish, “Discard” brings it back.' }),
      );
    default:
      return h('p', { class: 'muted', text: `Unknown field ${spec.type}` });
  }
}

function renderFormHeadOnly() {
  const sub = $('.form-sub');
  if (sub && S.cur.type === 'project') sub.textContent = `Address: /projects/${S.cur.slug}/${S.cur.data.draft ? ' · Draft — not on the live site' : ''}`;
}

function rowTools(arr, i, redraw, ctx, { confirmDelete } = {}) {
  const move = (d) => {
    const [x] = arr.splice(i, 1);
    arr.splice(i + d, 0, x);
    redraw();
    ctx.changed();
  };
  return h(
    'span',
    { class: 'list-row__tools' },
    h('button', { type: 'button', class: 'icon-btn', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(-1), text: '↑' }),
    h('button', { type: 'button', class: 'icon-btn', title: 'Move down', 'aria-label': 'Move down', disabled: i === arr.length - 1, onclick: () => move(1), text: '↓' }),
    h('button', {
      type: 'button',
      class: 'icon-btn',
      title: 'Remove',
      'aria-label': 'Remove',
      onclick: () => {
        if (confirmDelete && !confirm(confirmDelete)) return;
        arr.splice(i, 1);
        redraw();
        ctx.changed();
      },
      text: '✕',
    }),
  );
}

function renderTags(spec, obj, ctx, id) {
  const box = h('div', { class: 'tags' });
  const listId = spec.suggest ? nextId() : null;
  const input = h('input', { id, type: 'text', placeholder: 'Type and press Enter', list: listId || undefined });
  const arr = () => (Array.isArray(obj[spec.key]) ? obj[spec.key] : []);
  const ensure = () => (Array.isArray(obj[spec.key]) ? obj[spec.key] : (obj[spec.key] = []));
  const add = () => {
    const parts = input.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    for (const p of parts) if (!arr().includes(p)) ensure().push(p);
    input.value = '';
    draw();
    ctx.changed();
  };
  function draw() {
    box.replaceChildren(
      ...arr().map((t, i) =>
        h(
          'span',
          { class: 'tag' },
          t,
          h('button', {
            type: 'button',
            'aria-label': `Remove ${t}`,
            text: '✕',
            onclick: () => {
              arr().splice(i, 1);
              draw();
              ctx.changed();
            },
          }),
        ),
      ),
      input,
    );
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !input.value && arr().length) {
      arr().pop();
      draw();
      ctx.changed();
      input.focus();
    }
  });
  input.addEventListener('blur', add);
  draw();
  const datalist =
    listId &&
    h(
      'datalist',
      { id: listId },
      [...new Set((S.overview?.projects || []).flatMap((p) => p.disciplines || []))].map((d) => h('option', { value: d })),
    );
  return wrap(spec, box, id, datalist);
}

function renderStrings(spec, obj, ctx) {
  const list = h('div', { class: 'list' });
  const arr = () => (Array.isArray(obj[spec.key]) ? obj[spec.key] : []);
  const ensure = () => (Array.isArray(obj[spec.key]) ? obj[spec.key] : (obj[spec.key] = []));
  function draw() {
    list.replaceChildren(
      ...arr().map((s, i) => {
        const ta = h('textarea', {
          rows: 1,
          value: s,
          'aria-label': `${spec.label || 'Item'} ${i + 1}`,
          oninput: () => {
            arr()[i] = ta.value;
            autosize(ta);
            ctx.changed();
          },
        });
        requestAnimationFrame(() => autosize(ta));
        return h('div', { class: 'list-row' }, ta, rowTools(arr(), i, draw, ctx));
      }),
      h('button', {
        type: 'button',
        class: 'btn btn--small add-btn',
        text: `+ ${spec.add || 'Add'}`,
        onclick: () => {
          ensure().push('');
          draw();
          list.querySelectorAll('textarea')[arr().length - 1]?.focus();
        },
      }),
    );
  }
  draw();
  return h('div', { class: 'field' }, spec.label ? h('span', { class: 'label', text: spec.label }) : null, list);
}

function renderObjects(spec, obj, ctx) {
  const list = h('div', { class: 'list' });
  const arr = () => (Array.isArray(obj[spec.key]) ? obj[spec.key] : []);
  const ensure = () => (Array.isArray(obj[spec.key]) ? obj[spec.key] : (obj[spec.key] = []));
  function draw() {
    list.replaceChildren(
      ...arr().map((item, i) => {
        const title = h('span', { class: 'card__title' });
        const setTitle = () => {
          const t = spec.summary?.(item);
          title.textContent = t || 'Untitled';
          title.classList.toggle('is-empty', !t);
        };
        setTitle();
        const itemCtx = {
          ...ctx,
          changed: () => {
            setTitle();
            ctx.changed();
          },
        };
        const card = h(
          'div',
          { class: `card${S.openCards.has(item) ? '' : ' is-collapsed'}` },
          h(
            'div',
            {
              class: 'card__head',
              onclick: (e) => {
                if (e.target.closest('button')) return;
                card.classList.toggle('is-collapsed');
                if (card.classList.contains('is-collapsed')) S.openCards.delete(item);
                else {
                  S.openCards.add(item);
                  card.querySelectorAll('textarea').forEach(autosize);
                }
              },
            },
            title,
            rowTools(arr(), i, draw, ctx, { confirmDelete: `Remove “${spec.summary?.(item) || 'this item'}”?` }),
          ),
          h('div', { class: 'card__body' }, spec.fields.map((f) => renderField(f, item, itemCtx))),
        );
        return card;
      }),
      h('button', {
        type: 'button',
        class: 'btn btn--small add-btn',
        text: `+ ${spec.add || 'Add'}`,
        onclick: () => {
          const item = spec.newItem();
          S.openCards.add(item);
          ensure().push(item);
          draw();
          ctx.changed();
        },
      }),
    );
    requestAnimationFrame(() => list.querySelectorAll('.card:not(.is-collapsed) textarea').forEach(autosize));
  }
  draw();
  return h('div', { class: 'field' }, spec.label ? h('span', { class: 'label', text: spec.label }) : null, list);
}

function renderMarkdown(spec, ctx) {
  const ta = h('textarea', {
    rows: spec.rows || 14,
    value: S.cur.body,
    'aria-label': 'Text',
    oninput: () => {
      S.cur.body = ta.value;
      autosize(ta);
      ctx.changed();
    },
  });
  const apply = (fn) => {
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const [text, selA, selB] = fn(value.slice(a, b), value, a, b);
    ta.setRangeText(text, a, b, 'end');
    if (selA !== undefined) ta.setSelectionRange(a + selA, a + selB);
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  };
  const lineStart = (prefix) => () => {
    const a = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    ta.setSelectionRange(a, ta.selectionEnd);
    apply((sel) => [sel.split('\n').map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l)).join('\n')]);
  };
  const wrapSel = (mark, placeholder) => () =>
    apply((sel) => {
      const t = sel || placeholder;
      return [`${mark}${t}${mark}`, mark.length, mark.length + t.length];
    });
  const tools = h(
    'div',
    { class: 'md-tools' },
    h('button', { type: 'button', title: 'Heading', onclick: lineStart('## '), text: 'H' }),
    h('button', { type: 'button', title: 'Bold', onclick: wrapSel('**', 'bold text'), text: 'B' }),
    h('button', { type: 'button', title: 'Italic', onclick: wrapSel('_', 'italic text'), style: 'font-style:italic', text: 'I' }),
    h('button', { type: 'button', title: 'Bullet list', onclick: lineStart('- '), text: '•' }),
    h('button', {
      type: 'button',
      title: 'Link',
      text: 'Link',
      onclick: () =>
        apply((sel) => {
          const t = sel || 'link text';
          return [`[${t}](https://)`, t.length + 3, t.length + 11];
        }),
    }),
  );
  requestAnimationFrame(() => autosize(ta));
  return h('div', { class: 'field md' }, tools, ta);
}

function dropZone(label, small, accept, multiple, onFiles) {
  const input = h('input', { type: 'file', accept, multiple: multiple || undefined });
  const zone = h('label', { class: 'drop' }, h('span', { text: label }), small ? h('small', { text: small }) : null, input);
  input.addEventListener('change', () => {
    if (input.files.length) onFiles([...input.files]);
    input.value = '';
  });
  zone.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    zone.classList.remove('is-over');
    onFiles([...e.dataTransfer.files]);
  });
  return zone;
}

/** Deletes an image file once the saved text no longer refers to it. */
async function forgetFile(slug, src) {
  await flush();
  if (src) api.del(`file?${new URLSearchParams({ slug, name: basename(src) })}`).catch(() => {});
}

function parsePosition(s) {
  const kw = { left: 0, center: 50, right: 100, top: 0, bottom: 100 };
  const val = (t) => (t in kw ? kw[t] : parseFloat(t));
  const parts = String(s || '50% 50%').trim().split(/\s+/);
  if (parts.length === 1) return parts[0] === 'top' || parts[0] === 'bottom' ? { x: 50, y: val(parts[0]) } : { x: val(parts[0]) || 50, y: 50 };
  let [a, b] = parts;
  if (a === 'top' || a === 'bottom' || b === 'left' || b === 'right') [a, b] = [b, a];
  const x = val(a);
  const y = val(b);
  return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 50 };
}

function renderCover(obj, ctx) {
  const box = h('div', { class: 'cover' });
  function draw() {
    const src = obj.cover;
    const url = src ? imgUrl(ctx.slug, src, 900) : '';
    const pos = parsePosition(obj.coverPosition);
    const marker = h('span', { class: 'cover__marker', style: `left:${pos.x}%;top:${pos.y}%` });
    const img = h('img', { src: url, alt: '' });
    const stage = h('div', { class: 'cover__stage', title: 'Click the part of the image that cards should keep' }, img, marker);
    const cropCard = h('div', { class: 'cover__crop cover__crop--card' });
    const cropHero = h('div', { class: 'cover__crop cover__crop--hero' });
    const paintCrops = () => {
      for (const c of [cropCard, cropHero]) {
        c.style.backgroundImage = `url("${url}")`;
        c.style.backgroundPosition = obj.coverPosition || '50% 50%';
      }
    };
    paintCrops();
    stage.addEventListener('click', (e) => {
      const r = img.getBoundingClientRect();
      const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
      const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
      obj.coverPosition = `${x}% ${y}%`;
      marker.style.left = `${x}%`;
      marker.style.top = `${y}%`;
      paintCrops();
      ctx.changed();
    });
    const altId = nextId();
    const alt = h('textarea', {
      id: altId,
      rows: 2,
      value: obj.coverAlt || '',
      placeholder: 'What the image shows, for people who can’t see it',
      oninput: () => {
        obj.coverAlt = alt.value;
        autosize(alt);
        ctx.changed();
      },
    });
    const status = h('p', { class: 'uploading' });
    box.replaceChildren(
      h('div', { class: 'cover__box' }, src ? stage : h('p', { class: 'muted', text: 'No cover yet' })),
      h(
        'div',
        { class: 'cover__crops' },
        h('figure', {}, cropCard, h('figcaption', { text: 'On project cards' })),
        h('figure', {}, cropHero, h('figcaption', { text: 'On wide cards' })),
      ),
      dropZone('Replace the cover — drop an image here or click', 'JPEG or PNG. Big photos are resized and their location data removed.', 'image/*', false, async ([file]) => {
        status.textContent = 'Uploading…';
        try {
          const old = obj.cover;
          const res = await api.upload({ kind: 'image', slug: ctx.slug }, file);
          obj.cover = res.value;
          obj.coverPosition = '50% 50%';
          ctx.changed();
          draw();
          if (old && old !== res.value) forgetFile(ctx.slug, old);
        } catch (e) {
          status.textContent = e.message;
        }
      }),
      status,
      h('div', { class: 'field' }, h('label', { for: altId, text: 'Image description' }), alt),
    );
  }
  draw();
  return box;
}

function renderGallery(obj, ctx) {
  const wrapEl = h('div', { class: 'field' });
  const arr = () => (Array.isArray(obj.gallery) ? obj.gallery : []);
  const ensure = () => (Array.isArray(obj.gallery) ? obj.gallery : (obj.gallery = []));
  let dragFrom = null;
  function draw() {
    const grid = h('div', { class: 'gallery-grid' });
    arr().forEach((item, i) => {
      const alt = h('textarea', {
        rows: 2,
        value: item.alt || '',
        placeholder: 'Describe the image (required for screen readers)',
        'aria-label': `Image ${i + 1} description`,
        oninput: () => {
          item.alt = alt.value;
          ctx.changed();
        },
      });
      const caption = h('input', {
        type: 'text',
        value: item.caption || '',
        placeholder: 'Caption (optional)',
        'aria-label': `Image ${i + 1} caption`,
        oninput: () => {
          if (caption.value) item.caption = caption.value;
          else delete item.caption;
          ctx.changed();
        },
      });
      const wideId = nextId();
      const card = h(
        'div',
        { class: `g-item${item.wide ? ' is-wide' : ''}` },
        h('img', {
          src: imgUrl(ctx.slug, item.src, 600),
          alt: '',
          loading: 'lazy',
          draggable: 'false',
          title: 'Drag to reorder',
          style: 'cursor:grab',
          // Only the picture is a drag handle, so text in the fields can still be selected.
          onpointerdown: () => (card.draggable = true),
        }),
        alt,
        caption,
        h(
          'div',
          { class: 'g-item__tools' },
          h(
            'label',
            { class: 'check', for: wideId },
            h('input', {
              id: wideId,
              type: 'checkbox',
              checked: !!item.wide,
              onchange: (e) => {
                item.wide = e.target.checked;
                draw();
                ctx.changed();
              },
            }),
            h('span', { text: 'Full width' }),
          ),
          h(
            'span',
            {},
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move earlier', disabled: i === 0, text: '←', onclick: () => move(i, i - 1) }),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move later', disabled: i === arr().length - 1, text: '→', onclick: () => move(i, i + 1) }),
            h('button', {
              type: 'button',
              class: 'icon-btn',
              'aria-label': 'Remove image',
              text: '✕',
              onclick: () => {
                if (!confirm('Remove this image from the gallery?')) return;
                const [gone] = arr().splice(i, 1);
                draw();
                ctx.changed();
                forgetFile(ctx.slug, gone.src);
              },
            }),
          ),
        ),
      );
      card.addEventListener('dragstart', (e) => {
        dragFrom = i;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        card.draggable = false;
      });
      card.addEventListener('pointerup', () => (card.draggable = false));
      card.addEventListener('dragover', (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        card.classList.add('drop-target');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
      card.addEventListener('drop', (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        move(dragFrom, i);
        dragFrom = null;
      });
      grid.append(card);
    });
    const status = h('p', { class: 'uploading' });
    wrapEl.replaceChildren(
      grid,
      dropZone('Add images — drop them here or click', 'You can pick several at once.', 'image/*', true, async (files) => {
        for (const [n, file] of files.entries()) {
          status.textContent = `Uploading ${n + 1} of ${files.length}…`;
          try {
            const res = await api.upload({ kind: 'image', slug: ctx.slug }, file);
            ensure().push({ src: res.value, alt: '', wide: false });
          } catch (e) {
            toast(`${file.name}: ${e.message}`, 'error');
          }
        }
        status.textContent = '';
        draw();
        ctx.changed();
      }),
      status,
    );
    requestAnimationFrame(() => wrapEl.querySelectorAll('textarea').forEach(autosize));
  }
  function move(from, to) {
    if (to < 0 || to >= arr().length || from === to) return draw();
    const [x] = arr().splice(from, 1);
    arr().splice(to, 0, x);
    draw();
    ctx.changed();
  }
  draw();
  return wrapEl;
}

function renderFilm(obj, ctx) {
  const box = h('div', { class: 'field film' });
  function draw() {
    const status = h('p', { class: 'uploading' });
    if (!obj.film) {
      box.replaceChildren(
        dropZone('Add a film — drop a video here or click', 'MP4 (H.264) works everywhere. Keep it under 100 MB.', 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v', false, async ([file]) => {
          try {
            const res = await api.upload({ kind: 'video', slug: ctx.slug }, file, (p) => (status.textContent = `Uploading… ${Math.round(p * 100)} %`));
            obj.film = { src: res.value };
            ctx.changed();
            draw();
          } catch (e) {
            status.textContent = e.message;
          }
        }),
        status,
      );
      return;
    }
    const f = obj.film;
    const capId = nextId();
    const caption = h('input', {
      id: capId,
      type: 'text',
      value: f.caption || '',
      oninput: () => {
        if (caption.value) f.caption = caption.value;
        else delete f.caption;
        ctx.changed();
      },
    });
    box.replaceChildren(
      h('video', { src: f.src, poster: f.poster || undefined, controls: true, preload: 'metadata' }),
      h(
        'div',
        { class: 'poster-row' },
        f.poster ? h('img', { src: imgUrl('', f.poster, 300), alt: '' }) : h('p', { class: 'hint', text: 'No poster: the first frame shows until you press play.' }),
        dropZone(f.poster ? 'Replace the poster' : 'Add a poster image', 'The still shown before the film plays.', 'image/*', false, async ([file]) => {
          try {
            const res = await api.upload({ kind: 'poster', slug: ctx.slug }, file);
            f.poster = res.value;
            ctx.changed();
            draw();
          } catch (e) {
            status.textContent = e.message;
          }
        }),
      ),
      status,
      h('div', { class: 'field' }, h('label', { for: capId, text: 'Caption' }), caption),
      h('button', {
        type: 'button',
        class: 'btn btn--small btn--danger',
        text: 'Remove the film',
        onclick: () => {
          if (!confirm('Remove the film from this project?')) return;
          delete obj.film;
          ctx.changed();
          draw();
        },
      }),
    );
  }
  draw();
  return box;
}

function renderCv(obj, ctx) {
  const box = h('div', { class: 'field' });
  function draw() {
    const status = h('p', { class: 'uploading' });
    box.replaceChildren(
      obj.cv
        ? h('p', {}, 'Visitors can download ', h('a', { href: obj.cv, target: '_blank', rel: 'noopener', text: basename(obj.cv) }), ' from the About page.')
        : h('p', { class: 'hint', text: 'No CV to download yet.' }),
      h('p', { class: 'warn', text: 'Anyone can download this file — leave out your home address and other private details.' }),
      dropZone(obj.cv ? 'Replace the CV (PDF)' : 'Add a CV (PDF)', '', 'application/pdf,.pdf', false, async ([file]) => {
        try {
          const res = await api.upload({ kind: 'cv' }, file);
          obj.cv = res.value;
          ctx.changed();
          draw();
        } catch (e) {
          status.textContent = e.message;
        }
      }),
      status,
      obj.cv
        ? h('button', {
            type: 'button',
            class: 'btn btn--small',
            text: 'Stop offering the CV',
            onclick: () => {
              delete obj.cv;
              ctx.changed();
              draw();
            },
          })
        : null,
    );
  }
  draw();
  return box;
}

function renderPosition(obj) {
  const cat = obj.category || 'work';
  const list = (S.overview?.projects || []).filter((p) => p.category === cat);
  const i = list.findIndex((p) => p.slug === S.cur.slug);
  if (i < 0) return h('span');
  const slugs = list.map((p) => p.slug);
  const move = (d) => {
    const [x] = slugs.splice(i, 1);
    slugs.splice(i + d, 0, x);
    reorder(slugs).then(() => renderForm());
  };
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'label', text: 'Position' }),
    h(
      'div',
      { style: 'display:flex;align-items:center;gap:8px' },
      h('span', { text: `${i + 1} of ${list.length}` }),
      h('button', { type: 'button', class: 'btn btn--small', disabled: i === 0, onclick: () => move(-1), text: '↑ Earlier' }),
      h('button', { type: 'button', class: 'btn btn--small', disabled: i === list.length - 1, onclick: () => move(1), text: '↓ Later' }),
    ),
  );
}

// ------------------------------------------------------------------ projects: new / delete
async function newProject() {
  const title = h('input', { id: 'np-title', type: 'text', placeholder: 'Desk lamp' });
  const cat = h('select', { id: 'np-cat' }, h('option', { value: 'work', text: 'Design work' }), h('option', { value: 'hobby', text: 'Hobby projects' }));
  const ok = await dialog(
    'New project',
    h(
      'div',
      {},
      h('div', { class: 'field' }, h('label', { for: 'np-title', text: 'Title' }), title),
      h('div', { class: 'field' }, h('label', { for: 'np-cat', text: 'Shown under' }), cat),
      h('p', { class: 'hint', text: 'It starts as a draft with a placeholder cover, so nothing shows on the live site until you untick Draft and publish.' }),
    ),
    [{ label: 'Cancel' }, { label: 'Create project', primary: true, value: true }],
  );
  if (!ok) return;
  try {
    await flush();
    const { slug } = await api.post('projects', { title: title.value, category: cat.value });
    await loadOverview();
    await openItem({ type: 'project', slug });
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteProject() {
  const title = S.cur.data.title || S.cur.slug;
  const ok = await dialog(
    'Delete this project?',
    h('p', { text: `“${title}” and its images will be removed. Until you publish, “Discard all changes” can bring it back.` }),
    [{ label: 'Cancel' }, { label: 'Delete', danger: true, value: true }],
  );
  if (!ok) return;
  try {
    const slug = S.cur.slug;
    S.cur.dirty = false;
    clearTimeout(S.saveTimer);
    await api.del(`projects?${new URLSearchParams({ slug })}`);
    S.cur = null;
    await loadOverview();
    await openItem({ type: 'home' });
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ------------------------------------------------------------------ publish, discard, updates
async function showChanges() {
  await flush();
  await loadOverview();
  const { changes, unpushed, github } = S.overview;
  const body = h(
    'div',
    {},
    changes.length
      ? [
          h('p', { text: 'These are saved here but not yet on the live site:' }),
          h(
            'ul',
            { class: 'change-list' },
            changes.map((c) => h('li', {}, h('b', { text: changeKind(c.code) }), h('span', { text: describeChange(c) }))),
          ),
        ]
      : h('p', { text: 'Everything you have changed is on the live site.' }),
    unpushed && github ? h('p', { class: 'warn', text: 'Some published changes haven’t reached GitHub yet. Publishing again retries.' }) : null,
  );
  const choice = await dialog(
    'Unpublished changes',
    body,
    changes.length
      ? [{ label: 'Discard all changes', danger: true, value: 'discard' }, { label: 'Close' }, { label: 'Publish', primary: true, value: 'publish' }]
      : [{ label: 'Close' }],
  );
  if (choice === 'publish') publish();
  if (choice === 'discard') discard();
}

async function discard() {
  const ok = await dialog(
    'Discard all changes?',
    h('p', { text: 'Everything you have changed since the last publish goes back to how it is on the live site. New uploads are deleted. This can’t be undone.' }),
    [{ label: 'Cancel' }, { label: 'Discard', danger: true, value: true }],
  );
  if (!ok) return;
  clearTimeout(S.saveTimer);
  if (S.cur) S.cur.dirty = false;
  try {
    await api.post('discard');
    await loadOverview();
    const cur = S.cur;
    S.cur = null;
    const stillThere = !cur || cur.type !== 'project' || projectBySlug(cur.slug);
    await openItem(stillThere && cur ? cur : { type: 'home' }, { navigate: true });
    reloadPreviewSoon();
    toast('Changes discarded.', 'ok');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function publish() {
  if (!(await flush())) {
    toast('Fix the problem shown at the top first — that change isn’t saved yet.', 'error');
    return;
  }
  try {
    const { job } = await api.post('publish');
    trackJob(job);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function getUpdates() {
  $('.more').open = false;
  if (!(await flush())) return;
  try {
    const { job } = await api.post('update');
    trackJob(job, { restartAware: true });
  } catch (e) {
    toast(e.message, 'error');
  }
}

let tracking = null;
function trackJob(job, { restartAware = false, quiet = false } = {}) {
  if (tracking === job.id) return;
  tracking = job.id;
  $('#publish-btn').disabled = true;
  const t = toast(job.name, 'busy', { sticky: true, sub: job.step });
  const poll = async () => {
    let j;
    try {
      j = (await api.get('job')).job;
    } catch {
      if (restartAware) return setTimeout(poll, 2000); // the editor is restarting
      j = null;
    }
    if (!j || j.id !== job.id) {
      if (restartAware) {
        t.remove();
        toast('The editor restarted with the update — reloading…', 'ok');
        setTimeout(() => location.reload(), 1500);
        return;
      }
    }
    if (j && !j.done) {
      $('.toast__sub', t).textContent = j.step;
      return setTimeout(poll, 1000);
    }
    t.remove();
    tracking = null;
    $('#publish-btn').disabled = false;
    if (j?.ok) {
      if (!quiet || /fail|not/i.test(j.message)) toast(j.message, /not saved|clash/i.test(j.message) ? 'error' : 'ok');
      if (/restarting/i.test(j.message)) setTimeout(() => location.reload(), 6000);
      if (j.name === 'Getting updates' && S.cur) {
        const cur = S.cur;
        S.cur = null;
        await loadOverview();
        await openItem(projectBySlug(cur.slug) || cur.type !== 'project' ? cur : { type: 'home' });
        reloadPreviewSoon();
      }
    } else if (j) {
      toast(j.error || 'Something went wrong.', 'error', {
        sticky: true,
        action: j.detail
          ? {
              label: 'Details',
              run: () => dialog('What went wrong', h('div', {}, h('p', { text: 'The live site was left as it was. The message from the build:' }), h('pre', { text: j.detail }))),
            }
          : undefined,
      });
    }
    loadOverview();
  };
  setTimeout(poll, 800);
}

async function showDevLog() {
  $('.more').open = false;
  const { log, running } = await api.get('devlog');
  dialog(
    'Preview log',
    h(
      'div',
      {},
      h('p', { text: running ? 'Messages from the preview server. Errors about content show up here and in the preview itself.' : 'The preview server is not running right now — it restarts by itself.' }),
      h('pre', { text: log || '(empty)' }),
    ),
  );
}

// ------------------------------------------------------------------ chrome: panes, sizes, menu
function setPane(which) {
  document.body.classList.toggle('show-preview', which === 'preview');
  document.querySelectorAll('.pane-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pane === which)));
}

function wireChrome() {
  $('#publish-btn').addEventListener('click', publish);
  $('#changes-btn').addEventListener('click', showChanges);
  $('#update-btn').addEventListener('click', getUpdates);
  $('#devlog-btn').addEventListener('click', showDevLog);
  $('#reload-btn').addEventListener('click', () => {
    memoScroll();
    frame().contentWindow.location.reload();
  });
  frame().addEventListener('load', onPreviewLoad);
  document.querySelectorAll('.segmented button').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.segmented button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#preview-frame').classList.toggle('is-phone', b.dataset.size === 'phone');
    }),
  );
  document.querySelectorAll('.pane-switch button').forEach((b) => b.addEventListener('click', () => setPane(b.dataset.pane)));
  $('#menu-toggle').addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    $('#menu-toggle').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    const more = $('.more');
    if (more.open && !more.contains(e.target)) more.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });
}

// ------------------------------------------------------------------ start
async function start() {
  wireChrome();
  const overlay = $('#starting');
  for (;;) {
    let ov;
    try {
      ov = await api.get('overview');
    } catch (e) {
      ov = { starting: true, phase: e.message };
    }
    if (!ov.starting) break;
    overlay.hidden = false;
    $('#starting-phase').textContent = ov.error ? `${ov.phase}: ${ov.error}` : ov.phase;
    await new Promise((r) => setTimeout(r, 2500));
  }
  overlay.hidden = true;
  await loadOverview();
  const hash = location.hash.slice(1);
  const m = hash.match(/^project\/([a-z0-9-]+)$/);
  const first = m && projectBySlug(m[1]) ? { type: 'project', slug: m[1] } : ['about', 'consulting', 'home'].includes(hash) ? { type: hash } : { type: 'home' };
  await openItem(first);
  const job = S.overview.job;
  if (job && !job.done) trackJob(job, { quiet: true });
  setInterval(() => {
    if (!document.hidden) loadOverview().catch(() => {});
  }, 30000);
}

start();
