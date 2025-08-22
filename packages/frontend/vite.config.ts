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
		rollupOptions: {
			output: {
				manualChunks: {
					// Vendor chunks
					vendor: ["react", "react-dom"],
					clerk: ["@clerk/clerk-react"],
					ui: [
						"@radix-ui/react-dialog",
						"@radix-ui/react-slot",
						"@radix-ui/react-context",
					],
					codemirror: [
						"@uiw/react-codemirror",
						"@codemirror/lang-markdown",
						"@codemirror/state",
						"@codemirror/view",
					],
					markdown: ["react-markdown"],
					table: ["@tanstack/react-table", "@tanstack/match-sorter-utils"],
					query: ["@tanstack/react-query"],
					utils: ["date-fns", "lucide-react", "zod", "zustand", "papaparse"],
					tailwind: ["tailwindcss", "@tailwindcss/typography"],
				},
				chunkFileNames: (chunkInfo) => {
					const facadeModuleId = chunkInfo.facadeModuleId
						? chunkInfo.facadeModuleId.split("/").pop()
						: "chunk";
					return `js/[name]-[hash].js`;
				},
			},
		},
		chunkSizeWarningLimit: 1000, // Increase warning limit to 1MB
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
