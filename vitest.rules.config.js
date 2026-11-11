import {defineConfig} from 'vitest/config'
// The rules tests talk to the real Firestore emulator, so they must NOT load the setup file that
// replaces the Firebase SDK with a stand-in. They run in plain Node, one at a time.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__rules__/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
})
