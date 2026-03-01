#!/bin/bash
# ============================================================================
# Mission Control iOS — Capacitor setup
# Run on a Mac with Node.js 18+ and Xcode 15+ installed.
#
# Usage:  cd mobile && bash setup.sh
#
# After setup: npx cap open ios → opens Xcode → sign → build → run on device
# ============================================================================
set -e

cd "$(dirname "$0")"

echo "=== Mission Control iOS Setup ==="
echo ""

# 1. Install Capacitor packages
echo "[1/3] Installing dependencies..."
npm install

# 2. Add iOS platform (generates ios/ directory with Xcode project)
if [ ! -d "ios" ]; then
  echo "[2/3] Adding iOS platform..."
  npx cap add ios
else
  echo "[2/3] iOS platform already exists, syncing..."
fi

# 3. Sync web content into native project
echo "[3/3] Syncing..."
npx cap sync ios

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. npx cap open ios                 (opens Xcode)"
echo "  2. Select your team for code signing (Xcode → target → Signing & Capabilities)"
echo "  3. Add 'Push Notifications' capability  (+ button → Push Notifications)"
echo "  4. Build and run on your device      (Cmd+R or Product → Run)"
echo ""
echo "For TestFlight distribution:"
echo "  - Product → Archive → Distribute App → TestFlight"
echo "  - Install TestFlight on your iPhone, open the build"
echo ""
echo "No Apple Developer account? Use free signing:"
echo "  - Personal Team signing works for 7 days per build"
echo "  - Push notifications require a paid account ($99/year)"
