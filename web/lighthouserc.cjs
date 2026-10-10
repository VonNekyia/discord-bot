// Lighthouse mit den Schwellen der Website. Siehe docs/entwicklung/ci.md, „Frontend“.
const baseUrl = (process.env.LHCI_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');

module.exports = {
  ci: {
    collect: {
      url: [`${baseUrl}/`],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--headless=new --no-sandbox --disable-dev-shm-usage',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', {minScore: 0.5, aggregationMethod: 'median'}],
        'categories:accessibility': ['error', {minScore: 0.85, aggregationMethod: 'median'}],
        'categories:best-practices': ['error', {minScore: 0.8, aggregationMethod: 'median'}],
        'categories:seo': ['error', {minScore: 0.9, aggregationMethod: 'median'}],
        'cumulative-layout-shift': ['error', {maxNumericValue: 0.25, aggregationMethod: 'median'}],
        'total-blocking-time': ['error', {maxNumericValue: 1200, aggregationMethod: 'median'}],
        'largest-contentful-paint': ['warn', {maxNumericValue: 4000, aggregationMethod: 'median'}],
        'document-title': 'error',
        'meta-description': 'error',
        'http-status-code': 'error',
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: 'lighthouse',
    },
  },
};
