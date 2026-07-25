---
title: Devtools ADB Extension
tags: [project, firefox, devtools, extension]
status: active
source_repo: 4Alpha2Hunt0/devtools-adb-extension
source_path: README.md
created: 2026-07-25
---

# Devtools ADB Extension

## Summary
A Firefox extension that supports remote debugging in Firefox DevTools. It
bundles ADB binaries (Linux, Linux64, Mac64, Win32) that DevTools uses to
connect to Firefox/GeckoView on Android devices over USB.

## Links
- [[Projects/Devtools ADB Extension - Release Process|Release process]]
- [[Projects/Devtools ADB Extension - Code of Conduct|Code of Conduct]]
- Upstream issue tracker: github.com/mozilla/devtools-adb-extension/issues

## Notes
- Discussion channels: Slack (devtools-html-slack), IRC `#devtools` on
  irc.mozilla.org, and Bugzilla (product: DevTools).
- Packaging is driven by the `Makefile` in the repo root (`make package`,
  `make clean`) — see the release process note for the full flow.
