import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		viteReact(),
		tailwindcss(),
		visualizer({
			filename: "dist/stats.html",
			open: true,
			gzipSize: true,
			brotliSize: true,
		}),
	],
	server: {
		port: 5175,
		proxy: {
			"/api": {
				target: "http://localhost:8080", // Updated to new API port
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
		},
	},
	build: {
		outDir: "dist",
		sourcemap: false, // Disable for production
	},
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./vitest.setup.ts", "./vitest.polyfills.js"],
		mockReset: false,
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
});
