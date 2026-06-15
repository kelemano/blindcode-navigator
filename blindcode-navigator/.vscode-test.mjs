import { defineConfig } from '@vscode/test-cli';

// Nur Integrationstests laufen im Electron-/VS-Code-Host.
// Die schnellen Unit-Tests (out/test/unit/**) laufen ohne VS Code via mocha.
export default defineConfig({
	files: 'out/test/integration/**/*.test.js',
});
