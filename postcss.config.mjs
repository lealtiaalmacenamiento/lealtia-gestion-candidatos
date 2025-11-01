let plugins = []

// When running tests (Vitest sets VITEST env), skip PostCSS plugins to avoid
// loading Tailwind/Vite PostCSS plugins which can fail in the test environment.
if (!process.env.VITEST) {
  try {
    // Try loading the Tailwind PostCSS plugin; fall back silently if not present.
    // We use dynamic import to keep this file ESM-compatible.
    const mod = await import('@tailwindcss/postcss').catch(() => null)
    if (mod && (mod.default || mod)) {
      plugins = [mod.default || mod]
    }
  } catch (err) {
    // ignore and keep plugins empty
    plugins = []
  }
}

export default { plugins }
