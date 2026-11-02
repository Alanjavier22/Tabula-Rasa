/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--app-bg)',
        surface: 'var(--app-surface)',
        'surface-soft': 'var(--app-surface-soft)',
        'surface-strong': 'var(--app-surface-strong)',
        primary: 'var(--app-text)',
        muted: 'var(--app-muted)',
        subtle: 'var(--app-subtle)',
        line: 'var(--app-border)',
        'line-strong': 'var(--app-border-strong)',
        accent: 'var(--app-accent)',
        'accent-strong': 'var(--app-accent-strong)',
        'accent-soft': 'var(--app-accent-soft)',
        'on-accent': 'var(--app-on-accent)',
        success: 'var(--app-success)',
        'success-soft': 'var(--app-success-soft)',
        danger: 'var(--app-danger)',
        'danger-soft': 'var(--app-danger-soft)',
        warning: 'var(--app-warning)',
        'warning-soft': 'var(--app-warning-soft)',
        info: 'var(--app-info)',
        'info-soft': 'var(--app-info-soft)',
        overlay: 'var(--app-overlay)',
        'on-color': 'var(--app-on-accent)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
