import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Projects: one folder per project in src/content/projects/<slug>/
 * containing index.md plus its images. The folder name becomes the URL:
 * src/content/projects/the-marvin/index.md  ->  /projects/the-marvin/
 */
const projects = defineCollection({
  loader: glob({
    pattern: '*/index.md',
    base: './src/content/projects',
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** One line under the title, also used on cards. */
      tagline: z.string(),
      /** One or two sentences for the project card. */
      summary: z.string(),
      year: z.number().int().optional(),
      /** Course code, client or employer, e.g. "D7017A Product Visualization". */
      context: z.string().optional(),
      /** "Solo project", "Group of 4", ... */
      team: z.string(),
      /** Your own part of the work. Leave out if it was evenly shared. */
      role: z.string().optional(),
      /** Used for the filter on the Projects page. Keep the wording consistent across projects. */
      disciplines: z.array(z.string()).min(1),
      tools: z.array(z.string()).default([]),
      /** Short "at a glance" bullets for people skimming. */
      highlights: z.array(z.string()).default([]),
      cover: image(),
      coverAlt: z.string(),
      /** Which part of the cover to keep when cards crop it, as CSS object-position, e.g. "left center" or "70% 50%". */
      coverPosition: z.string().default('50% 50%'),
      accent: z.enum(['rust', 'navy', 'olive', 'mustard', 'sand']).default('rust'),
      /** Featured projects appear on the home page (the first three by order). */
      featured: z.boolean().default(false),
      /** Lower numbers come first. */
      order: z.number().default(100),
      /** Drafts show up in `npm run dev` but are left out of the built site. */
      draft: z.boolean().default(false),
      gallery: z
        .array(
          z.object({
            src: image(),
            alt: z.string(),
            caption: z.string().optional(),
            /** Spans the full width of the gallery. */
            wide: z.boolean().default(false),
          }),
        )
        .default([]),
    }),
});

/** About page + contact details used across the site: src/content/about.md */
const about = defineCollection({
  loader: glob({ pattern: 'about.md', base: './src/content', generateId: () => 'about' }),
  schema: z.object({
    name: z.string(),
    headline: z.string(),
    location: z.string(),
    availability: z.string().optional(),
    email: z.string().email(),
    phone: z.string().optional(),
    website: z.string().optional(),
    linkedin: z.string().optional(),
    cv: z.string().optional(),
    education: z
      .array(z.object({ period: z.coerce.string(), title: z.string(), place: z.string(), note: z.string().optional() }))
      .default([]),
    experience: z
      .array(z.object({ period: z.coerce.string(), title: z.string(), place: z.string(), note: z.string().optional() }))
      .default([]),
    skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })).default([]),
  }),
});

export const collections = { projects, about };
