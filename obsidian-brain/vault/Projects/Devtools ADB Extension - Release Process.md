---
title: Devtools ADB Extension - Release Process
tags: [project, firefox, devtools, release-process]
status: active
source_repo: 4Alpha2Hunt0/devtools-adb-extension
source_path: README.md, Makefile
created: 2026-07-25
---

# Devtools ADB Extension — Release Process

## Summary
Manual, ordered release process for shipping new ADB binaries across four
architectures (linux, linux64, mac64, win32).

## Steps
1. Bump `VERSION` in `Makefile` (keep it to three parts — `make package`
   appends a fourth, per-arch index automatically) and commit.
2. Run `make package`. This produces `dist/<arch>/adb-extension-<version>.<index>-<arch>.xpi`
   and a matching `update.json` for each arch.
3. Upload each XPI to AMO as an **unlisted** version, in arch order
   (`linux` → `linux64` → `mac64` → `win32`), since the version's fourth
   segment (0/1/2/3) must increase monotonically.
4. Download the signed XPIs from AMO. AMO renames them — rename each back to
   the original `adb-extension-<version>-<arch>.xpi` pattern.
5. Upload the signed XPIs + their `update.json` files to the FTP server,
   both as the versioned filename and as an `-latest-<arch>` copy (same
   bytes/hash as the versioned one).

## Notes
- The whole flow is order-sensitive: skipping the arch order in step 3
  breaks the auto-update chain.
- [[Projects/Devtools ADB Extension|Back to project overview]]
