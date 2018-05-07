#!/bin/bash
#
# RUN ALL CHECKS
#
# https://sipb.mit.edu/doc/safe-shell/
set -euf -o pipefail

# What is chronic?
# Chronic runs a command quietly unless it fails to suppess overly verbose output
# It's part of moreutils (https://joeyh.name/code/moreutils/) and can be installed:
# - macOS: brew install moreutils
# - Debian: https://packages.debian.org/sid/utils/moreutils
# - Ubuntu: https://packages.ubuntu.com/search?keywords=moreutils
# - Alpine: https://pkgs.alpinelinux.org/package/edge/testing/x86/moreutils
required_binaries=(yarn chronic);
for binary in "${required_binaries[@]}"; do
  type ${binary} >/dev/null 2>&1 || { echo >&2 "❌  ${binary} binary not found. Please install ${binary} before running this script."; exit 1; }
done

printf "1️⃣  Running linters…"
chronic yarn lint
printf " ✅\n"

printf "2️⃣  Running tests…"
chronic yarn test
printf " ✅\n"

printf "3️⃣  Searching for open TODOs and FIXMEs in the code…"
yarn todo
