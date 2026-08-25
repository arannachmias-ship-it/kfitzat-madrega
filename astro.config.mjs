import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://kfitzat-madrega.co.il',
  integrations: [mdx(), sitemap()],
  build: { inlineStylesheets: 'auto' },
});
