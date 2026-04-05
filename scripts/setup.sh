#!/bin/bash
set -euo pipefail

echo "Setting up Computer development environment..."

echo "Ensuring Node/npm are available..."
node --version
npm --version

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

if ! command -v bun >/dev/null 2>&1; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

for shell_rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  if [ -f "$shell_rc" ] && ! grep -Fq 'export BUN_INSTALL="$HOME/.bun"' "$shell_rc"; then
    {
      echo ''
      echo 'export BUN_INSTALL="$HOME/.bun"'
      echo 'export PATH="$BUN_INSTALL/bin:$PATH"'
    } >>"$shell_rc"
  fi
done

echo "Installing Homey CLI and Claude Code..."
npm install -g --no-optional homey @anthropic-ai/claude-code
homey --version || true
claude --version || true

echo "Installing project dependencies..."
bun install

echo "Generating app.json..."
bun prepare

echo "Installing GitHub Copilot CLI..."
gh extension install github/gh-copilot || echo "Copilot CLI already installed or failed"

echo ""
echo "Verifying installations..."
echo " node: $(node --version)"
echo " bun: $(bun --version)"
echo " gh: $(gh --version | sed -n '1p')"
gh copilot --version 2>/dev/null && echo " gh copilot: installed" || echo " gh copilot: run 'gh auth login' first"
claude --version 2>/dev/null && echo " claude: $(claude --version)" || echo " claude: installed (run 'claude' to authenticate)"
homey --version 2>/dev/null && echo " homey: $(homey --version)" || echo " homey: installed"

echo ""
echo "Development environment ready."
echo ""
echo "Next steps:"
echo " 1. Run 'gh auth login' to authenticate GitHub CLI"
echo " 2. Run 'bunx homey login' to authenticate the Homey CLI"
echo " 3. Run 'bunx homey select' to choose your Homey for development"
echo " 4. Run 'bun run dev' to start the app"
