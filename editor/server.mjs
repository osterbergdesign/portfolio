/**
 * Portfolio editor — the private site at edit.osterbergdesign.site.
 *
 * One small Node server that:
 *   - builds the public site from the last published commit into /srv/site (nginx serves it),
 *   - runs `astro dev` on the working copy as a live preview, behind a password,
 *   - reads and writes the Markdown content files for the editor's forms,
 *   - publishes: commit -> build -> swap the live site -> push to GitHub.
 *
 * Drafts are simply uncommitted changes in the working copy; "published" is the last commit.
 * Only Node built-ins here, plus `yaml` and `sharp` from the site's own node_modules.
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- settings
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(process.env.REPO_DIR || path.join(HERE, '..'));
const SITE_DIR = path.resolve(process.env.SITE_DIR || '/srv/site');
const PORT = Number(process.env.EDITOR_PORT || 8081);
const DEV_PORT = Number(process.env.PREVIEW_PORT || 4321);
const PASSWORD = process.env.EDITOR_PASSWORD || '';
const TOKEN = (process.env.GITHUB_TOKEN || '').trim();
const BRANCH = process.env.GIT_BRANCH || 'main';
const GIT_NAME = process.env.GIT_AUTHOR_NAME || 'Portfolio editor';
const GIT_EMAIL = process.env.GIT_AUTHOR_EMAIL || 'editor@localhost';
const SITE_URL = process.env.SITE_URL || 'https://www.osterbergdesign.site';
const CONTENT = path.join(REPO, 'src/content');
const PROJECTS = path.join(CONTENT, 'projects');
const PUBLIC = path.join(REPO, 'public');
const UI = path.join(HERE, 'ui');
const BUILD_DIR = path.join(REPO, '.build');
const SESSION_MS = 14 * 24 * 3600 * 1000;
const SINGLES = { about: 'about.md', home: 'home.md', consulting: 'consulting.md' };
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);
const scrub = (s) => (TOKEN ? String(s).split(TOKEN).join('***') : String(s));
const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const tail = (s, n = 6000) => (s.length > n ? '…' + s.slice(-n) : s);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------- processes
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || REPO,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (d) => {
      const s = stripAnsi(d);
      out += s;
      if (out.length > 400_000) out = out.slice(-200_000);
      opts.onOutput?.(s);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => resolve({ code: -1, out: out + String(e) }));
    child.on('close', (code) => resolve({ code, out }));
  });
}
const git = (args, opts) =>
  run('git', ['-c', `user.name=${GIT_NAME}`, '-c', `user.email=${GIT_EMAIL}`, ...args], opts);
const head = async () => (await git(['rev-parse', 'HEAD'])).out.trim();

// ---------------------------------------------------------------- startup state
const state = { phase: 'Starting', ready: false, error: '' };
let YAML = null;
let sharp = null;

function depsHash() {
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  return crypto
    .createHash('sha1')
    .update(read(path.join(REPO, 'package.json')) + read(path.join(REPO, 'package-lock.json')))
    .digest('hex');
}

async function ensureDeps() {
  if (process.env.EDITOR_SKIP_INSTALL) return;
  const marker = path.join(REPO, 'node_modules/.editor-deps');
  const hash = depsHash();
  const have = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '';
  if (have === hash && fs.existsSync(path.join(REPO, 'node_modules/astro'))) return;
  state.phase = 'Installing packages — the first start takes a few minutes';
  log(state.phase);
  const lock = fs.existsSync(path.join(REPO, 'package-lock.json'));
  const r = await run('npm', lock ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund', '--no-package-lock'], {
    onOutput: (s) => process.stdout.write(s),
  });
  if (r.code !== 0) throw new Error('Installing packages failed:\n' + tail(r.out));
  fs.writeFileSync(marker, depsHash());
}

function loadLibs() {
  const req = createRequire(path.join(REPO, 'package.json'));
  YAML = req('yaml');
  try {
    sharp = req('sharp');
  } catch {
    log('sharp is not available — images are saved exactly as uploaded');
  }
}

// ---------------------------------------------------------------- content files
function splitFrontMatter(raw) {
  raw = raw.replace(/^﻿/, '');
  const m = raw.match(/^---\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  return m ? { fm: m[1] || '', body: m[2] } : { fm: '', body: raw };
}

async function readEntry(file) {
  const raw = await fsp.readFile(file, 'utf8');
  const { fm, body } = splitFrontMatter(raw);
  return { data: YAML.parse(fm) ?? {}, body: body.replace(/^\s*\n/, '') };
}

/** Writes front matter + body, keeping comments and formatting of everything that didn't change. */
async function writeEntry(file, data, body = '') {
  let fm = '';
  try {
    fm = splitFrontMatter(await fsp.readFile(file, 'utf8')).fm;
  } catch {}
  const doc = YAML.parseDocument(fm);
  if (!YAML.isMap(doc.contents)) doc.contents = doc.createNode({});
  const before = doc.toJS() || {};
  for (const pair of [...doc.contents.items]) {
    const key = YAML.isScalar(pair.key) ? pair.key.value : pair.key;
    if (data[key] === undefined || data[key] === null) doc.delete(key);
  }
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (JSON.stringify(before[key]) === JSON.stringify(value)) continue;
    const node = doc.get(key, true);
    if (YAML.isScalar(node) && (typeof value !== 'object' || value === null)) {
      node.value = value;
    } else {
      const created = doc.createNode(value);
      // Short lists of words stay on one line, like the hand-written files: [Blender, KeyShot]
      if (Array.isArray(value) && value.every((v) => typeof v === 'string') && JSON.stringify(value).length < 90) {
        created.flow = true;
      }
      doc.set(key, created);
    }
  }
  const text = `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false })}---\n${body.trim() ? `\n${body.trim()}\n` : ''}`;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, text);
  await fsp.rename(tmp, file);
}

function entryFile(type, slug) {
  if (SINGLES[type]) return path.join(CONTENT, SINGLES[type]);
  if (type === 'project' && SLUG.test(slug || '')) return path.join(PROJECTS, slug, 'index.md');
  throw new HttpError(400, 'Unknown page');
}

async function listProjects() {
  const dirs = await fsp.readdir(PROJECTS, { withFileTypes: true });
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory() || !SLUG.test(d.name)) continue;
    const file = path.join(PROJECTS, d.name, 'index.md');
    if (!fs.existsSync(file)) continue;
    try {
      const { data } = await readEntry(file);
      out.push({
        slug: d.name,
        title: data.title || d.name,
        category: data.category || 'work',
        order: typeof data.order === 'number' ? data.order : 100,
        year: data.year,
        draft: !!data.draft,
        featured: !!data.featured,
        accent: data.accent || 'rust',
        disciplines: Array.isArray(data.disciplines) ? data.disciplines : [],
        cover: typeof data.cover === 'string' ? path.basename(data.cover) : null,
      });
    } catch (e) {
      out.push({ slug: d.name, title: d.name, category: 'work', order: 999, error: e.message });
    }
  }
  return out.sort((a, b) => a.order - b.order || (b.year ?? 0) - (a.year ?? 0));
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

function uniquePath(dir, base, ext) {
  let name = `${base}${ext}`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base}-${i}${ext}`;
  return name;
}

// ---------------------------------------------------------------- images and files
async function saveImage(buf, dir, base) {
  await fsp.mkdir(dir, { recursive: true });
  if (!sharp) {
    const ext = buf[0] === 0x89 ? '.png' : buf[0] === 0xff ? '.jpg' : null;
    if (!ext) throw new HttpError(415, 'Please upload a JPEG or PNG image.');
    const name = uniquePath(dir, base, ext);
    await fsp.writeFile(path.join(dir, name), buf);
    return { name };
  }
  let img;
  let meta;
  try {
    img = sharp(buf, { failOn: 'none' }).rotate(); // turn phone photos the right way up
    meta = await img.metadata();
  } catch {
    throw new HttpError(415, "This image format can't be read — export it as JPEG or PNG and try again.");
  }
  // Screenshots and graphics stay PNG; photos become JPEG. Metadata (camera, GPS location) is dropped.
  const keepPng = meta.format === 'png' && (meta.hasAlpha || meta.width * meta.height <= 4_000_000);
  img = img.resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true });
  img = keepPng ? img.png({ compressionLevel: 9 }) : img.flatten({ background: '#ffffff' }).jpeg({ quality: 86, mozjpeg: true });
  const name = uniquePath(dir, base, keepPng ? '.png' : '.jpg');
  const info = await img.toFile(path.join(dir, name));
  return { name, width: info.width, height: info.height };
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, `That file is too big (limit ${Math.round(limit / 1e6)} MB).`));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function streamToFile(req, file, limit) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.upload`;
  const out = fs.createWriteStream(tmp);
  let size = 0;
  await new Promise((resolve, reject) => {
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, `That file is too big (limit ${Math.round(limit / 1e6)} MB).`));
        req.destroy();
        out.destroy();
      }
    });
    req.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    req.on('error', reject);
  }).catch(async (e) => {
    await fsp.rm(tmp, { force: true });
    throw e;
  });
  await fsp.rename(tmp, file);
  return size;
}

const thumbs = new Map();
async function sendImage(res, file, width) {
  const stat = await fsp.stat(file).catch(() => null);
  if (!stat) throw new HttpError(404, 'Not found');
  const key = `${file}|${stat.mtimeMs}|${width}`;
  let buf = thumbs.get(key);
  if (!buf) {
    buf = sharp && width ? await sharp(file).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer() : await fsp.readFile(file);
    if (thumbs.size > 400) thumbs.delete(thumbs.keys().next().value);
    thumbs.set(key, buf);
  }
  const type = sharp && width ? 'image/webp' : file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=60' });
  res.end(buf);
}

// ---------------------------------------------------------------- git, build, publish
async function changes() {
  const r = await git(['status', '--porcelain=v1', '-uall', '--', 'src/content', 'public']);
  return r.out
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ code: line.slice(0, 2).trim(), file: line.slice(3).replace(/^"|"$/g, '') }));
}

async function unpushed() {
  const r = await git(['rev-list', '--count', `refs/remotes/origin/${BRANCH}..HEAD`]);
  return r.code === 0 ? Number(r.out.trim()) || 0 : 0;
}

async function authUrl() {
  const url = (await git(['remote', 'get-url', 'origin'])).out.trim();
  const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/);
  if (TOKEN && m) return `https://x-access-token:${TOKEN}@github.com/${m[1]}/${m[2]}.git`;
  return 'origin';
}

function describe(files) {
  const names = new Set();
  for (const f of files) {
    const m = f.match(/^src\/content\/projects\/([^/]+)\//);
    if (m) names.add(m[1]);
    else if (f.startsWith('src/content/')) names.add(path.basename(f, '.md'));
    else if (f.startsWith('public/')) names.add('files');
  }
  return [...names].slice(0, 6).join(', ') || 'content';
}

let builtCommit = '';
const readBuilt = () => {
  try {
    return fs.readFileSync(path.join(SITE_DIR, 'built-commit'), 'utf8').trim();
  } catch {
    return '';
  }
};

/** Builds the last commit (never drafts) into a new release folder and switches the live site over to it. */
async function buildLive(j) {
  const commit = await head();
  const src = path.join(BUILD_DIR, 'src');
  await fsp.rm(src, { recursive: true, force: true });
  await fsp.mkdir(src, { recursive: true });
  let r = await run('sh', ['-c', 'git archive --format=tar HEAD | tar -x -C "$0"', src]);
  if (r.code !== 0) throw new Error('Could not export the site files:\n' + tail(r.out));

  const releases = path.join(SITE_DIR, 'releases');
  await fsp.mkdir(releases, { recursive: true });
  const out = path.join(releases, new Date().toISOString().replace(/[:.]/g, '-'));
  const cmd = process.env.EDITOR_BUILD_CMD || `"${path.join(REPO, 'node_modules/.bin/astro')}" build --outDir "$OUT"`;
  if (j) j.step = 'Building the site';
  r = await run('sh', ['-c', cmd], {
    cwd: src,
    env: { SITE_URL, OUT: out, SRC: src, ASTRO_CACHE_DIR: path.join(BUILD_DIR, 'cache'), ASTRO_TELEMETRY_DISABLED: '1', CI: '1' },
    onOutput: (s) => {
      if (j) j.log = tail(j.log + s, 20000);
    },
  });
  if (r.code !== 0 || !fs.existsSync(path.join(out, 'index.html'))) {
    await fsp.rm(out, { recursive: true, force: true });
    const e = new Error('The site could not be built.');
    e.detail = tail(r.out, 8000);
    throw e;
  }

  const current = path.join(SITE_DIR, 'current');
  const tmp = path.join(SITE_DIR, `current-${process.pid}.tmp`);
  await fsp.rm(tmp, { force: true });
  await fsp.symlink(out, tmp);
  const st = await fsp.lstat(current).catch(() => null);
  if (st && !st.isSymbolicLink()) await fsp.rm(current, { recursive: true, force: true });
  await fsp.rename(tmp, current);
  await fsp.writeFile(path.join(SITE_DIR, 'built-commit'), commit);
  builtCommit = commit;

  const all = (await fsp.readdir(releases)).sort();
  for (const old of all.slice(0, -3)) await fsp.rm(path.join(releases, old), { recursive: true, force: true });
  await fsp.rm(src, { recursive: true, force: true });
  log('live site built from', commit.slice(0, 8));
  return commit;
}

async function pushToGitHub(j) {
  if (!TOKEN) return { ok: false, skipped: true };
  j.step = 'Saving to GitHub';
  const url = await authUrl();
  let r = await git(['push', url, `HEAD:${BRANCH}`]);
  if (r.code !== 0 && /rejected|fetch first|non-fast-forward/i.test(r.out)) {
    // GitHub has newer commits (for example changes from Claude): take them in first, then push.
    j.step = 'Merging newer changes from GitHub';
    const p = await git(['pull', '--rebase', '--autostash', url, BRANCH]);
    if (p.code !== 0) {
      await git(['rebase', '--abort']);
      return { ok: false, message: 'GitHub has newer changes that clash with yours. Ask Claude to merge them.' };
    }
    if ((await head()) !== builtCommit) await buildLive(j);
    r = await git(['push', url, `HEAD:${BRANCH}`]);
  }
  if (r.code !== 0) return { ok: false, message: scrub(tail(r.out, 800)) };
  await git(['update-ref', `refs/remotes/origin/${BRANCH}`, 'HEAD']);
  return { ok: true };
}

async function publish(j) {
  j.step = 'Saving your changes';
  await git(['add', '-A', '--', 'src/content', 'public']);
  const staged = (await git(['diff', '--cached', '--name-only'])).out.split('\n').filter(Boolean);
  let committed = false;
  if (staged.length) {
    const r = await git(['commit', '-q', '-m', `Edit ${describe(staged)} in the editor`, '-m', staged.map((f) => `- ${f}`).join('\n')]);
    if (r.code !== 0) throw new Error('Could not save the changes:\n' + tail(r.out));
    committed = true;
  }
  const commit = await head();
  if (commit !== builtCommit || !fs.existsSync(path.join(SITE_DIR, 'current'))) {
    try {
      await buildLive(j);
    } catch (e) {
      if (committed) {
        // Put the changes back as drafts, so nothing is lost and the live site stays as it was.
        await git(['reset', '-q', '--soft', 'HEAD~1']);
        await git(['reset', '-q']);
      }
      throw e;
    }
  }
  const pending = await unpushed();
  if (TOKEN && pending > 0) {
    const p = await pushToGitHub(j);
    if (!p.ok) return `Published on your site, but not saved to GitHub: ${p.message}`;
  }
  if (!committed) return 'Nothing new to publish — the live site is up to date.';
  return TOKEN ? 'Published and saved to GitHub.' : 'Published. (Add a GitHub token to also save changes to GitHub.)';
}

async function getUpdates(j) {
  j.step = 'Fetching updates from GitHub';
  const before = await head();
  const deps = depsHash();
  const stashes = (await git(['stash', 'list'])).out.split('\n').filter(Boolean).length;
  const url = await authUrl();
  const r = await git(['pull', '--rebase', '--autostash', url, BRANCH]);
  if (r.code !== 0) {
    await git(['rebase', '--abort']);
    throw Object.assign(new Error("The updates couldn't be merged with your unpublished changes."), { detail: scrub(tail(r.out, 3000)) });
  }
  await git(['update-ref', `refs/remotes/origin/${BRANCH}`, 'FETCH_HEAD']);
  const after = await head();
  const stashesAfter = (await git(['stash', 'list'])).out.split('\n').filter(Boolean).length;
  const warning =
    stashesAfter > stashes ? ' Some unpublished changes clashed with the update and were set aside (git stash) — ask Claude to bring them back.' : '';
  if (after === before && after === builtCommit) return 'Already up to date.' + warning;
  if (depsHash() !== deps) {
    j.step = 'Installing new packages';
    await ensureDeps();
    restartDev();
  }
  if (after !== builtCommit) await buildLive(j);
  if (TOKEN && (await unpushed()) > 0) await pushToGitHub(j);
  const editorChanged = (await git(['diff', '--name-only', before, after, '--', 'editor'])).out.trim();
  if (editorChanged) {
    setTimeout(() => process.exit(0), 1500); // Docker starts the container again with the new editor
    return 'Updated. The editor is restarting itself — this page reloads in a few seconds.' + warning;
  }
  return 'Updated — the live site now has the latest changes.' + warning;
}

// One job at a time: building, publishing and updating all touch the same files.
let job = null;
function startJob(name, fn) {
  if (job && !job.done) throw new HttpError(409, `Please wait — ${job.name.toLowerCase()} is still running.`);
  job = { id: Date.now(), name, step: 'Starting', log: '', done: false, ok: null, message: '', error: '', detail: '' };
  const j = job;
  (async () => {
    try {
      j.message = (await fn(j)) || 'Done';
      j.ok = true;
    } catch (e) {
      j.ok = false;
      j.error = scrub(e.message);
      j.detail = scrub(e.detail || j.log || '');
      log(`${j.name} failed:`, j.error);
    } finally {
      j.done = true;
    }
  })();
  return j;
}

// ---------------------------------------------------------------- live preview (astro dev)
let dev = null;
let devLog = '';
let devStopping = false;
function startDev() {
  const cmd = process.env.EDITOR_DEV_CMD || `"${path.join(REPO, 'node_modules/.bin/astro')}" dev --host 127.0.0.1 --port ${DEV_PORT}`;
  devStopping = false;
  dev = spawn('sh', ['-c', `exec ${cmd}`], {
    cwd: REPO,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onData = (d) => {
    devLog = tail(devLog + stripAnsi(d), 12000);
  };
  dev.stdout.on('data', onData);
  dev.stderr.on('data', onData);
  dev.on('exit', (code) => {
    devLog += `\n[preview stopped with code ${code}]\n`;
    dev = null;
    if (!devStopping) setTimeout(startDev, 3000);
  });
}
function restartDev() {
  if (dev) {
    dev.once('exit', () => setTimeout(startDev, 500));
    devStopping = true;
    dev.kill('SIGTERM');
  } else startDev();
}

// ---------------------------------------------------------------- sessions
function loadSecret() {
  const file = path.join(SITE_DIR, '.editor-secret');
  try {
    return fs.readFileSync(file);
  } catch {
    const s = crypto.randomBytes(32);
    fs.mkdirSync(SITE_DIR, { recursive: true });
    fs.writeFileSync(file, s, { mode: 0o600 });
    return s;
  }
}
const KEY = crypto.createHash('sha256').update(loadSecret()).update(PASSWORD).digest();
const sign = (exp) => crypto.createHmac('sha256', KEY).update(String(exp)).digest('base64url');
const cookies = (req) =>
  Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2));
function loggedIn(req) {
  const [exp, sig] = (cookies(req).editor_session || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
const clientIp = (req) =>
  req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https' || /https/.test(String(req.headers['cf-visitor'] || ''));
const failures = new Map();
function tooManyFailures(ip) {
  const now = Date.now();
  const list = (failures.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  failures.set(ip, list);
  return list.length >= 8;
}
function passwordMatches(given) {
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return PASSWORD.length > 0 && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- HTTP helpers
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff' };
function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...extra });
  res.end(buf);
}
const redirect = (res, to, extra = {}) => {
  res.writeHead(303, { Location: to, 'Cache-Control': 'no-store', ...extra });
  res.end();
};
async function sendFile(res, file) {
  try {
    const buf = await fsp.readFile(file);
    send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}
const page = (title, text, refresh) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh ? `<meta http-equiv="refresh" content="${refresh}">` : ''}<title>${title}</title><body style="font:17px/1.5 system-ui,sans-serif;background:#faf8f3;color:#1f2636;display:grid;place-items:center;min-height:90vh;margin:0;padding:20px"><div style="max-width:30em"><h1 style="font-size:26px;margin:0 0 8px">${title}</h1><p style="margin:0;color:#4b5264">${text}</p></div></body>`;

// ---------------------------------------------------------------- API
async function api(req, res, url) {
  const route = url.pathname.replace('/__editor/api/', '');
  const q = Object.fromEntries(url.searchParams);
  const method = req.method;
  if (method !== 'GET' && req.headers['x-editor'] !== '1') throw new HttpError(403, 'Missing editor header');
  if (!state.ready && route !== 'overview') throw new HttpError(503, state.phase);
  const json = async () => {
    try {
      return JSON.parse((await readBody(req, 2_000_000)).toString('utf8') || '{}');
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, 'Bad request');
    }
  };

  if (route === 'overview' && method === 'GET') {
    if (!state.ready) return send(res, 200, { starting: true, phase: state.phase, error: state.error });
    return send(res, 200, {
      projects: await listProjects(),
      changes: await changes(),
      unpushed: TOKEN ? await unpushed() : 0,
      github: !!TOKEN,
      siteUrl: SITE_URL,
      live: { commit: builtCommit.slice(0, 8), exists: fs.existsSync(path.join(SITE_DIR, 'current')) },
      job,
    });
  }
  if (route === 'job' && method === 'GET') return send(res, 200, { job });
  if (route === 'devlog' && method === 'GET') return send(res, 200, { log: devLog, running: !!dev });

  if (route === 'entry' && method === 'GET') {
    const file = entryFile(q.type, q.slug);
    if (!fs.existsSync(file)) throw new HttpError(404, 'That page no longer exists.');
    return send(res, 200, await readEntry(file));
  }
  if (route === 'entry' && method === 'PUT') {
    const { type, slug, data, body } = await json();
    const file = entryFile(type, slug);
    if (type === 'project' && !fs.existsSync(path.dirname(file))) throw new HttpError(404, 'That project no longer exists.');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Bad data');
    await writeEntry(file, data, typeof body === 'string' ? body : '');
    return send(res, 200, { ok: true });
  }

  if (route === 'projects' && method === 'POST') {
    const { title, category } = await json();
    if (!String(title || '').trim()) throw new HttpError(400, 'Give the project a title.');
    const base = slugify(title) || 'project';
    let slug = base;
    for (let i = 2; fs.existsSync(path.join(PROJECTS, slug)); i++) slug = `${base}-${i}`;
    const cat = category === 'hobby' ? 'hobby' : 'work';
    const orders = (await listProjects()).filter((p) => p.category === cat).map((p) => p.order);
    await fsp.mkdir(path.join(PROJECTS, slug), { recursive: true });
    await fsp.copyFile(path.join(HERE, 'placeholder-cover.jpg'), path.join(PROJECTS, slug, 'cover.jpg'));
    await writeEntry(path.join(PROJECTS, slug, 'index.md'), {
      title: String(title).trim(),
      tagline: 'One line that says what it is and why it matters.',
      summary: 'One or two sentences for the project card and link previews.',
      team: 'Solo project',
      disciplines: ['Product design'],
      tools: [],
      highlights: [],
      cover: './cover.jpg',
      coverAlt: '',
      accent: 'rust',
      category: cat,
      order: (orders.length ? Math.max(...orders) : 0) + 1,
      draft: true,
    }, '## The brief\n\nWhat the project was about.\n');
    return send(res, 200, { slug });
  }
  if (route === 'projects' && method === 'DELETE') {
    if (!SLUG.test(q.slug || '') || !fs.existsSync(path.join(PROJECTS, q.slug))) throw new HttpError(404, 'Not found');
    await fsp.rm(path.join(PROJECTS, q.slug), { recursive: true, force: true });
    return send(res, 200, { ok: true });
  }
  if (route === 'order' && method === 'POST') {
    const { slugs } = await json();
    if (!Array.isArray(slugs)) throw new HttpError(400, 'Bad order');
    for (const [i, slug] of slugs.entries()) {
      const file = entryFile('project', slug);
      if (!fs.existsSync(file)) continue;
      const { data, body } = await readEntry(file);
      if (data.order !== i + 1) await writeEntry(file, { ...data, order: i + 1 }, body);
    }
    return send(res, 200, { ok: true });
  }

  if (route === 'upload' && method === 'PUT') {
    const kind = q.kind;
    const slug = q.slug || '';
    const original = path.basename(String(q.name || 'file')).replace(/\.[^.]+$/, '');
    if (kind === 'image') {
      if (!SLUG.test(slug) || !fs.existsSync(path.join(PROJECTS, slug))) throw new HttpError(404, 'Unknown project');
      const buf = await readBody(req, 60_000_000);
      const saved = await saveImage(buf, path.join(PROJECTS, slug), slugify(original) || 'image');
      return send(res, 200, { ...saved, value: `./${saved.name}` });
    }
    if (kind === 'poster') {
      const buf = await readBody(req, 60_000_000);
      const saved = await saveImage(buf, path.join(PUBLIC, 'videos'), `${slugify(slug) || 'film'}-poster`);
      return send(res, 200, { ...saved, value: `/videos/${saved.name}` });
    }
    if (kind === 'video') {
      const ext = (String(q.name).match(/\.(mp4|webm|mov|m4v)$/i)?.[1] || 'mp4').toLowerCase();
      const name = uniquePath(path.join(PUBLIC, 'videos'), slugify(slug) || 'film', `.${ext}`);
      // Cloudflare and GitHub both stop at 100 MB per file.
      const size = await streamToFile(req, path.join(PUBLIC, 'videos', name), 99_000_000);
      return send(res, 200, { name, size, value: `/videos/${name}` });
    }
    if (kind === 'cv') {
      const buf = await readBody(req, 25_000_000);
      if (buf.subarray(0, 4).toString() !== '%PDF') throw new HttpError(415, 'Please upload a PDF.');
      const name = uniquePath(PUBLIC, slugify(original) || 'cv', '.pdf');
      await fsp.writeFile(path.join(PUBLIC, name), buf);
      return send(res, 200, { name, value: `/${name}` });
    }
    throw new HttpError(400, 'Unknown upload');
  }
  if (route === 'file' && method === 'DELETE') {
    // Removes an image from a project folder once nothing refers to it any more.
    const name = path.basename(q.name || '');
    if (!SLUG.test(q.slug || '') || !/^[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp|gif|avif)$/i.test(name)) throw new HttpError(400, 'Bad file');
    const dir = path.join(PROJECTS, q.slug);
    const text = await fsp.readFile(path.join(dir, 'index.md'), 'utf8').catch(() => '');
    if (text.includes(`./${name}`)) return send(res, 200, { kept: true });
    await fsp.rm(path.join(dir, name), { force: true });
    return send(res, 200, { ok: true });
  }

  if (route === 'publish' && method === 'POST') return send(res, 200, { job: startJob('Publishing', publish) });
  if (route === 'update' && method === 'POST') return send(res, 200, { job: startJob('Getting updates', getUpdates) });
  if (route === 'discard' && method === 'POST') {
    if (job && !job.done) throw new HttpError(409, 'Please wait until the current job has finished.');
    await git(['checkout', '--', 'src/content', 'public']);
    await git(['clean', '-fdq', '--', 'src/content', 'public']);
    return send(res, 200, { ok: true });
  }
  throw new HttpError(404, 'Unknown request');
}

// ---------------------------------------------------------------- preview proxy
function proxy(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${DEV_PORT}` };
  if (headers.origin) headers.origin = `http://127.0.0.1:${DEV_PORT}`;
  delete headers.cookie; // the preview never needs the editor's session cookie
  const p = http.request({ host: '127.0.0.1', port: DEV_PORT, method: req.method, path: req.url, headers }, (pr) => {
    res.writeHead(pr.statusCode || 502, pr.headers);
    pr.pipe(res);
  });
  p.on('error', () => {
    if (!res.headersSent) send(res, 503, page('The preview is starting…', state.ready ? 'This takes a few seconds. The page reloads by itself.' : state.phase, 3), 'text/html; charset=utf-8');
    else res.destroy();
  });
  req.pipe(p);
}

function proxyUpgrade(req, socket, headBuf) {
  const upstream = net.connect(DEV_PORT, '127.0.0.1', () => {
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i];
      let value = req.rawHeaders[i + 1];
      const lower = name.toLowerCase();
      if (lower === 'cookie') continue;
      if (lower === 'host' || lower === 'origin') value = lower === 'host' ? `127.0.0.1:${DEV_PORT}` : `http://127.0.0.1:${DEV_PORT}`;
      raw += `${name}: ${value}\r\n`;
    }
    upstream.write(raw + '\r\n');
    if (headBuf?.length) upstream.write(headBuf);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  const close = () => {
    upstream.destroy();
    socket.destroy();
  };
  upstream.on('error', close);
  socket.on('error', close);
}

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://editor.local');
  const p = url.pathname;
  try {
    if (p === '/__editor/health') return send(res, 200, 'ok', 'text/plain');
    if (!PASSWORD) {
      return send(res, 503, page('The editor is switched off', 'Set EDITOR_PASSWORD in the .env file on the server, then run: docker compose up -d'), 'text/html; charset=utf-8');
    }
    if (p === '/__editor/login' && req.method === 'GET') return sendFile(res, path.join(UI, 'login.html'));
    if (p === '/__editor/login' && req.method === 'POST') {
      const ip = clientIp(req);
      if (tooManyFailures(ip)) return redirect(res, '/__editor/login?error=wait');
      const form = new URLSearchParams((await readBody(req, 10_000)).toString('utf8'));
      if (!passwordMatches(form.get('password') || '')) {
        failures.get(ip).push(Date.now());
        log('failed login from', ip);
        return redirect(res, '/__editor/login?error=1');
      }
      const exp = Date.now() + SESSION_MS;
      const cookie = `editor_session=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${isHttps(req) ? '; Secure' : ''}`;
      return redirect(res, '/__editor/', { 'Set-Cookie': cookie });
    }

    if (!loggedIn(req)) {
      if (p.startsWith('/__editor/api/')) throw new HttpError(401, 'Please log in again.');
      return redirect(res, '/__editor/login');
    }

    if (p === '/__editor/logout' && req.method === 'POST') {
      return redirect(res, '/__editor/login', { 'Set-Cookie': 'editor_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
    }
    if (p === '/__editor' || p === '/__editor/') return sendFile(res, path.join(UI, 'index.html'));
    if (p.startsWith('/__editor/ui/')) {
      const file = path.join(UI, path.basename(p));
      return sendFile(res, file);
    }
    if (p === '/__editor/img') {
      const name = path.basename(url.searchParams.get('name') || '');
      const slug = url.searchParams.get('slug') || '';
      const file = slug ? path.join(PROJECTS, SLUG.test(slug) ? slug : '-', name) : path.join(PUBLIC, 'videos', name);
      return await sendImage(res, file, Number(url.searchParams.get('w')) || 0);
    }
    if (p.startsWith('/__editor/api/')) return await api(req, res, url);
    if (p.startsWith('/__editor')) return send(res, 404, 'Not found', 'text/plain');
    return proxy(req, res);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) log('error:', e);
    if (!res.headersSent) send(res, status, { error: scrub(e.message) });
  }
});

server.requestTimeout = 30 * 60 * 1000; // big video uploads on slow connections
server.headersTimeout = 60 * 1000;

server.on('upgrade', (req, socket, headBuf) => {
  if (!PASSWORD || !loggedIn(req) || req.url.startsWith('/__editor')) return socket.destroy();
  proxyUpgrade(req, socket, headBuf);
});

async function main() {
  await fsp.mkdir(SITE_DIR, { recursive: true });
  builtCommit = readBuilt();
  server.listen(PORT, () => log(`editor listening on :${PORT}${PASSWORD ? '' : ' (switched off: EDITOR_PASSWORD is not set)'}`));
  try {
    await ensureDeps();
    loadLibs();
  } catch (e) {
    state.phase = 'Could not start';
    state.error = e.message;
    log(e.message);
    return;
  }
  state.ready = true;
  state.phase = 'Ready';
  if (PASSWORD) startDev();

  const rebuildIfNeeded = async () => {
    if (job && !job.done) return;
    const h = await head();
    if (h && (h !== builtCommit || !fs.existsSync(path.join(SITE_DIR, 'current')))) {
      try {
        startJob('Updating the live site', async (j) => {
          await buildLive(j);
          return 'The live site is up to date.';
        });
      } catch {}
    }
  };
  await rebuildIfNeeded();
  // Picks up commits made outside the editor too (for example `git pull` on the server).
  setInterval(rebuildIfNeeded, 60_000);
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    devStopping = true;
    dev?.kill('SIGTERM');
    process.exit(0);
  });
}

main();
