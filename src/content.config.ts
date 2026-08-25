import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const maslul = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/maslul' }),
  schema: z.object({
    stage: z.number(),          // 0-4
    order: z.number(),          // position inside the track
    title: z.string(),
    kicker: z.string(),         // the pain, one line
    goal: z.string(),           // what you'll know by the end
    readingTime: z.number(),
    author: z.enum(['ארן נחמיאס', 'מתי מצוינים']),
    interactive: z.boolean().default(false),
    published: z.boolean().default(true),
    date: z.date(),
  }),
});

export const collections = { maslul };
