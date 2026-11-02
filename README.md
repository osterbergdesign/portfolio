# OsterbergDesign portfolio

Portfolio site for Max Österberg — industrial & technical design.
Built with [Astro](https://astro.build): every project is a folder with a Markdown file and its images, so adding work never means touching HTML. The site builds to plain static files served by nginx in Docker.

```
src/content/
  about.md                  ← About page, CV, skills and contact details
  consulting.md             ← Consulting page: services, steps, form topics
  projects/
    the-marvin/
      index.md              ← text + settings for one project
      cover.jpg             ← images live next to it
      process-board.jpg
    footprint/ ...
templates/project/index.md  ← copy this to start a new project
contact/                    ← small mail service behind the consulting form
```

## Run it on your server

Needs Docker with the Compose plugin.

```bash
docker compose up -d --build
```

The site is now on `http://<server-ip>:8080`. Change the port and `SITE_URL` in `docker-compose.yml` if needed. To publish it on your domain with HTTPS, point your reverse proxy (Caddy, Traefik, Nginx Proxy Manager…) at port 8080.

After any change to the content, rebuild:

```bash
docker compose up -d --build
```

The site runs as two containers: `portfolio` (nginx with the built pages) and `contact` (sends the consulting form to your inbox, see [Contact form](#contact-form)).

The first build downloads Astro from npm and takes a minute or two; later builds reuse the cached dependencies. Commit the `package-lock.json` it creates (run `npm install` once locally, or copy it out of the build) so future builds use exactly the same versions.

## Add a project

1. Copy `templates/project/` to `src/content/projects/<name>/` — the folder name becomes the address, e.g. `/projects/desk-lamp/`.
2. Put your images in that folder. A cover around 2000 px wide works well; Astro resizes everything into web-friendly sizes automatically.
3. Fill in the settings at the top of `index.md` and write the story underneath in Markdown.
4. Delete the `draft: true` line and rebuild.

The settings are checked at build time, so a typo (for example a missing `coverAlt` or a misspelled image name) stops the build with a message pointing at the file — nothing broken goes live.

| Setting | What it does |
| --- | --- |
| `title`, `tagline` | Heading and one-liner, shown on cards and the project page |
| `summary` | Card text on the home page and the link-preview description |
| `year`, `context`, `team`, `role` | The fact sheet beside the story. `role` is optional |
| `disciplines` | Drives the filter on the Projects page — reuse existing words |
| `tools` | Tags in the fact sheet |
| `highlights` | The "At a glance" box — results and decisions for skimmers |
| `cover`, `coverAlt`, `coverPosition` | Cover image, its description, and which part to keep when cropped |
| `accent` | Colour field for the card and page header: `rust`, `navy`, `olive`, `mustard`, `sand` |
| `category` | `work` (default) for academic and client projects, `hobby` for your own — decides the tab it's listed under |
| `featured`, `order` | Home page selection (first three featured by order) and sort order |
| `links` | Buttons under the title, e.g. `- label: View on GitHub` / `url: https://github.com/...` |
| `film` | Optional film shown full width under the story: `src`, `poster` and `caption` (files go in `public/videos/`) |
| `gallery` | Images under the story; `wide: true` spans the full width |
| `draft` | Visible in `npm run dev`, left out of the built site |

### Hobby projects

Set `category: hobby` in a project's settings and it moves to the **Hobby projects** tab (`/projects/hobby/`). The tabs above the project list appear as soon as there is at least one published hobby project; until then the Projects page shows only the design work. Hobby projects never appear in "Selected work" on the home page, and "Next project" at the bottom of a project page stays within the same tab.

### Video

The easiest way to show a product film is the `film` setting — The Marvin uses it:

```yaml
film:
  src: /videos/the-marvin.mp4
  poster: /videos/the-marvin-poster.jpg
  caption: What the film shows.
```

Markdown also accepts plain HTML, so a smaller clip can go straight into the story text:

```html
<video src="/videos/my-clip.mp4" poster="/videos/my-clip-poster.jpg" controls playsinline preload="metadata"></video>
```

Put video files in `public/videos/`. Export them as MP4 (H.264) at 1080p; keep each file under 25 MB if you upload through the GitHub website (100 MB is GitHub's hard limit). The poster is the still shown before the film plays.

## Edit the About page

Everything is in `src/content/about.md`: the bio (the text under the settings), education, experience, skills and contact details. Those contact details are also used in the header and footer. To offer a CV download, put the PDF in `public/` and set `cv: /your-file.pdf`.

## Edit the Consulting page

All the text is in `src/content/consulting.md`: the intro, the four service cards (each with its own `accent` colour), the "How it works" steps, and the choices in the form's "What is it about?" menu. The text under the settings appears next to the form.

## Contact form

The form on `/consulting/` posts to `/api/contact`, which nginx hands to the `contact` container. That service checks the message, filters out obvious spam (a hidden field, a minimum time on the page, max 5 messages per visitor per 15 minutes) and emails it to you with the sender as *Reply-To*, so you can answer straight from your inbox. Nothing is stored.

It needs an email account to send from. With Gmail:

1. Turn on 2-step verification for the Google account.
2. Create an app password at <https://myaccount.google.com/apppasswords>.
3. On the server, next to `docker-compose.yml`:
   ```bash
   cp .env.example .env
   nano .env          # fill in SMTP_USER (your Gmail address) and SMTP_PASS (the app password)
   docker compose up -d --build
   ```

`.env` holds a password, so it is listed in `.gitignore` — keep it out of the repository. Check that it works with `docker compose logs contact`: it says *ready … sending to …* when configured. Until `.env` is filled in, the form tells visitors it can't send right now and offers to open their email app with the message already written instead.

Other providers work too: set `SMTP_HOST`, `SMTP_PORT` (587 for STARTTLS, 465 for SSL), `SMTP_USER` and `SMTP_PASS`. Set `CONTACT_TO` to deliver to a different address than the one you send from.

## Work on it locally (optional)

Needs Node.js 20 or newer.

```bash
npm install
npm run dev        # live preview on http://localhost:4321
npm run build      # builds to dist/
```

## Design notes

- Colours: paper `#FAF8F3`, ink `#1F2636`, rust `#AD542D`, navy `#243049`, olive `#5B6837`, mustard `#D9A43A`, sand `#DCCDB2`. All in `src/styles/global.css`.
- Type: Inter Display Black for headlines, Inter for text — self-hosted in `public/fonts/` (SIL Open Font License, see `public/fonts/OFL.txt`), so the site makes no requests to outside servers.
- The tile artwork on the home page is `src/components/Pattern.astro` — 32 small tiles, so each one can animate on its own. (`public/pattern.svg` is the same artwork as a single image.)
- Motion: `src/scripts/motion.js` reveals elements marked `data-reveal="rise"`, `"wipe"` or `"roll"` as they scroll into view, and feeds a 0–1 scroll value (`--p`) to elements marked `data-progress`, which the "Motion" section of `global.css` turns into the hero coming apart, the sliding word band, cover parallax and so on. Visitors who have turned on *reduce motion* in their system settings get the static site, and so does anyone without JavaScript.
