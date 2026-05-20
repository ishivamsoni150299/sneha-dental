module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: 'var(--color-bg)',
          surface: 'var(--color-surface)',
          elevated: 'var(--color-surface-elevated)',
          muted: 'var(--color-surface-muted)',
          line: 'var(--color-line)',
          'line-strong': 'var(--color-line-strong)',
          text: 'var(--color-text)',
          'text-soft': 'var(--color-text-soft)',
          'text-muted': 'var(--color-text-muted)',
        },
        brand: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          soft: 'var(--color-primary-soft)',
          border: 'var(--color-primary-border)',
        },
        status: {
          success: 'var(--color-success)',
          'success-soft': 'var(--color-success-soft)',
          warning: 'var(--color-warning)',
          'warning-soft': 'var(--color-warning-soft)',
          danger: 'var(--color-danger)',
          'danger-soft': 'var(--color-danger-soft)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
      },
      borderRadius: {
        control: 'var(--radius-control)',
        panel: 'var(--radius-panel)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        soft: 'var(--shadow-soft)',
      },
      transitionDuration: {
        '400': '400ms',
      },
    },
  },
  plugins: [],
};
