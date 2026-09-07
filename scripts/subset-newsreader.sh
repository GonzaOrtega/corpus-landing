#!/usr/bin/env bash
set -euo pipefail

# Regenerate committed font assets; normal application builds are offline for Newsreader.
# Requires curl, sha256sum and uv. All downloaded input is pinned and verified.
font_work=$(mktemp -d /tmp/corpus-newsreader.XXXXXX)
font_root=$(cd "$(dirname "$0")/.." && pwd)
font_revision=1ece6a8bfe5db1a2b90c76cc1fe5d3b2eed5dcf3
font_source="https://raw.githubusercontent.com/productiontype/NewsReader/$font_revision/fonts/variable/ttf"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$font_work/uv-cache}"
export UV_TOOL_DIR="${UV_TOOL_DIR:-$font_work/uv-tools}"

for font_style in normal italic; do
  if [ "$font_style" = normal ]; then
    font_filename='Newsreader%5Bopsz,wght%5D.ttf'
    font_sha=8a08d13f8a6c0d51be379a60af84f945f65369a67e509ee3c3bdcc421254d7c1
    font_weights=300:600
    font_unicodes='U+0020-007E,U+00A0,U+00B7,U+00D7,U+2000-206F'
  else
    font_filename='Newsreader-Italic%5Bopsz,wght%5D.ttf'
    font_sha=796668611f80b64d5adf182fde3b6f29ed83b4e7cbec7b96937e84ac01364792
    font_weights=300:500
    # Pronunciations are italic. Include the upstream IPA/modifier glyphs,
    # eng (gloaming) and eth (fathom); unsupported IPA keeps its system fallback.
    font_unicodes='U+0020-007E,U+00A0,U+00B7,U+00D7,U+00F0,U+014B,U+0250-02FF,U+2000-206F'
  fi
  curl --fail --silent --show-error --location "$font_source/$font_filename" \
    --output "$font_work/$font_style.ttf"
  printf '%s  %s\n' "$font_sha" "$font_work/$font_style.ttf" | sha256sum --check
  uv tool run --from 'fonttools[woff]==4.60.1' --with 'brotli==1.2.0' \
    --with 'zopfli==0.4.3' fonttools varLib.instancer \
    "$font_work/$font_style.ttf" "wght=$font_weights" --no-recalc-timestamp \
    --output "$font_work/$font_style-range.ttf"
  uv tool run --from 'fonttools[woff]==4.60.1' --with 'brotli==1.2.0' \
    --with 'zopfli==0.4.3' pyftsubset \
    "$font_work/$font_style-range.ttf" --unicodes="$font_unicodes" \
    --layout-features='kern,liga,clig,calt,ccmp,locl,mark,mkmk' \
    --flavor=woff2 --no-recalc-timestamp \
    --output-file="$font_root/app/fonts/newsreader-$font_style.woff2"
done
sha256sum "$font_root/app/fonts/newsreader-normal.woff2" \
  "$font_root/app/fonts/newsreader-italic.woff2"
printf 'Pinned source and intermediates retained in %s\n' "$font_work"
