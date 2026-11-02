import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';

export type Project = CollectionEntry<'projects'>;
export type Category = Project['data']['category'];

/**
 * Published projects, sorted by `order`, then newest first. Drafts are only shown in dev.
 * Pass a category to get only design work or only hobby projects.
 */
export async function getProjects(category?: Category): Promise<Project[]> {
  const all = await getCollection(
    'projects',
    ({ data }) => (import.meta.env.DEV || !data.draft) && (!category || data.category === category),
  );
  return all.sort((a, b) => a.data.order - b.data.order || (b.data.year ?? 0) - (a.data.year ?? 0));
}

export async function getAbout() {
  const about = await getEntry('about', 'about');
  if (!about) throw new Error('src/content/about.md is missing');
  return about;
}

export async function getHome() {
  const home = await getEntry('home', 'home');
  if (!home) throw new Error('src/content/home.md is missing');
  return home;
}

export async function getConsulting() {
  const consulting = await getEntry('consulting', 'consulting');
  if (!consulting) throw new Error('src/content/consulting.md is missing');
  return consulting;
}

/** Responsive widths that never upscale the source image. */
export function widthsFor(img: ImageMetadata, wanted: number[] = [480, 800, 1200, 1600, 2000]): number[] {
  const fit = wanted.filter((w) => w < img.width);
  return [...fit, img.width];
}

/** "Product design" -> "product-design" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Distinct disciplines in the order they first appear. */
export function disciplinesOf(projects: Project[]): string[] {
  return [...new Set(projects.flatMap((p) => p.data.disciplines))];
}
