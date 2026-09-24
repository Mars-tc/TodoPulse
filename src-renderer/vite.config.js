import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  root: __dirname,
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        widget: resolve(__dirname, 'widget.html')
      }
    }
  },
  server: {
    port: 5173,
    // 与「仅监听 127.0.0.1」的安全取向一致，开发服务器不对局域网开放
    host: '127.0.0.1'
  }
})
