import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      PORT: '3000',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_KEY: 'test-supabase-key',
      API_SECRET: 'test-api-secret-0123456789',
    },
  },
});
