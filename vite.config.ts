import { defineConfig } from 'vite';

export default defineConfig(() => {
  const builtAt = new Date().toISOString();
  const buildId = process.env.GITHUB_SHA?.slice(0, 7) ?? builtAt;

  return {
    base: './',
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
      __APP_BUILT_AT__: JSON.stringify(builtAt)
    },
    plugins: [
      {
        name: 'playmaker-build-meta',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'build.json',
            source: JSON.stringify({ buildId, builtAt }, null, 2)
          });
        }
      }
    ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts']
    }
  };
});
