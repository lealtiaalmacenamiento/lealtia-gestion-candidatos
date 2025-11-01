// Export simple plugin names so Next.js' build (webpack/postcss) accepts them.
// During tests (VITEST env) we return an empty list to avoid loading Tailwind/Vite plugins.
const plugins = process.env.VITEST ? [] : ['tailwindcss', 'autoprefixer']

export default { plugins }
