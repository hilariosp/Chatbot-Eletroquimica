import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        chatbot: resolve(__dirname, 'chatbot.html'),
        recursos: resolve(__dirname, 'recursos.html'),
        sobre: resolve(__dirname, 'sobre.html'),
        // Adicione outros arquivos HTML aqui se tiver mais
      },
    },
  },
});