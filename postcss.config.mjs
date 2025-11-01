// Export simple plugin names so Next.js' build (webpack/postcss) accepts them.
// During tests (VITEST env) we return an empty list to avoid loading Tailwind/Vite plugins.
// Use the new '@tailwindcss/postcss' adapter plugin for PostCSS so Next.js can
// require it directly during build. Keep autoprefixer as well.
const plugins = process.env.VITEST ? [] : ['@tailwindcss/postcss', 'autoprefixer']

export default { plugins }
