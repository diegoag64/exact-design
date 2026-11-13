// The pinned SDK's source-editing server requires Unix filesystem operations.
export function requireSupportedHost() {
  if (process.platform === 'win32') {
    console.error('Run Exact Design inside Ubuntu on WSL2. Native Windows is not supported by the pinned Exact SDK.\nSee docs/development.md#develop-on-windows-with-wsl2.');
    process.exit(1);
  }
}

if (import.meta.main) requireSupportedHost();
