# OsterbergDesign portfolio

Portfolio site for Max Österberg — industrial & technical design.
Built with [Astro](https://astro.build): every project is a folder with a Markdown file and its images, so adding work never means touching HTML. The site builds to plain static files served by nginx in Docker.

```
src/content/
  about.md                  ← About page, CV, skills and contact details
  projects/
    the-marvin/
      index.md              ← text + settings for one project
      cover.jpg             ← images live next to it
      process-board.jpg
    footprint/ ...
templates/project/index.md  ← copy this to start a new project
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
| `featured`, `order` | Home page selection (first three featured by order) and sort order |
| `gallery` | Images under the story; `wide: true` spans the full width |
| `draft` | Visible in `npm run dev`, left out of the built site |

### Video

Markdown accepts plain HTML, so a product film can go straight into a project:

```html
<video src="/videos/the-marvin.mp4" controls playsinline poster="/videos/the-marvin.jpg"></video>
```

Put video files in `public/videos/`.

## Edit the About page

Everything is in `src/content/about.md`: the bio (the text under the settings), education, experience, skills and contact details. Those contact details are also used in the header and footer. To offer a CV download, put the PDF in `public/` and set `cv: /your-file.pdf`.

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
- The tile artwork on the home page is `public/pattern.svg`.
