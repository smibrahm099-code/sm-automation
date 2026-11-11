import {defineConfig} from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins:[react()],
  test:{
    environment:'jsdom',
    globals:true,
    setupFiles:['./src/test/setup.js'],
    // the rules tests need the Firestore emulator and their own config (npm run test:rules)
    exclude:['node_modules/**','dist/**','src/__rules__/**'],
    // the real .env is never read here, so the tests always run against the same settings
    env:{
      VITE_FIREBASE_API_KEY:'test-key', VITE_FIREBASE_AUTH_DOMAIN:'test.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID:'test-project', VITE_FIREBASE_APP_ID:'1:1:web:test',
      VITE_OWNER_WA:'919876543210',
      VITE_CLOUDINARY_CLOUD_NAME:'democloud', VITE_CLOUDINARY_UPLOAD_PRESET:'demopreset',
    },
  },
})
