import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  test: {
    env: loadEnv(mode, process.cwd(), ''),
    environment: 'node',
    reporters: mode === 'reporte'
      ? ['default', ['junit', { outputFile: 'tests/reportes/junit.xml' }], ['html', { outputDir: 'tests/reportes/html' }]]
      : ['default'],
    coverage: {
      provider: 'v8',
      include: [
        'api/picking-masivo/**/*.ts',
        'api/notas/notas.service.ts',
        'src/features/picking-masivo/utils/**/*.ts',
      ],
      reporter: ['text', 'html'],
      reportsDirectory: 'tests/reportes/cobertura',
    },
    projects: [
      {
        extends: true,
        test: { name: 'unitarias', include: ['tests/unitarias/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'concurrencia',
          include: ['tests/concurrencia/**/*.test.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
}))
