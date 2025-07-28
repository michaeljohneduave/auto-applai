import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [viteReact(), tailwindcss()],
	server: {
		port: 5175,
		proxy: {
			"/api": {
				target: "http://localhost:5000",
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
		},
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
