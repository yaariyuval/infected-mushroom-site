import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const optionalDate = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.date().optional());

const shows = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/shows' }),
  schema: z.object({
    date: z.coerce.date(),
    end_date: optionalDate,
    city: z.string(),
    region: z.string().optional().default(''),
    country: z.string(),
    venue: z.string().optional().default(''),
    event: z.string().optional().default(''),
    set: z.string().optional().default(''),
    tickets: z.string().optional().default(''),
    status: z.string().optional().default(''),
    note: z.string().optional().default(''),
  }),
});

const releases = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/releases' }),
  schema: z.object({
    title: z.string(),
    year: z.coerce.number(),
    label: z.string().optional().default(''),
    type: z.string().optional().default('Album'),
    cover: z.string().optional().default(''),
    listen: z.string().optional().default(''),
    spotify: z.string().optional().default(''),
    featured: z.boolean().optional().default(false),
    tracks: z.array(z.string()).optional().default([]),
  }),
});

export const collections = { shows, releases };
