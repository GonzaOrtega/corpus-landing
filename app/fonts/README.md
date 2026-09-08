# Newsreader delivery subset

These OFL-1.1 assets are derived from [Newsreader's upstream source](https://github.com/productiontype/NewsReader/tree/1ece6a8bfe5db1a2b90c76cc1fe5d3b2eed5dcf3),
the revision identified by Google Fonts' Newsreader metadata. The license is
included in [OFL.txt](./OFL.txt).

The authoritative landing requests **optical size 6–72**, normal weight 300–600
and italic weight 300–500. Both files retain the full optical-size axis and
those weight ranges. Do not pin/remove `opsz`: that changes outlines, character
widths and the one-line desktop philosophy heading even when CSS is unchanged.

The English normal face contains printable ASCII, NBSP, middle dot, multiplication
sign and General Punctuation. Italic adds eth, eng and upstream-supported
IPA/Spacing Modifier Letters (U+0250–02FF). Newsreader supplies ə/ŋ/ð from the
lexicon's pronunciation characters; other IPA symbols already rely on system
fallback in the reference and still do here. Standard
kerning, ligatures, contextual shaping, composition, localization and mark
positioning remain; unused optional stylistic features are omitted. Text using
other scripts/characters needs an expanded subset (otherwise it falls back).
This is a delivery subset for the current English site, not the full family.

`next/font/local` self-hosts and preloads these two WOFF2 files, with swap and
Times New Roman metric-adjusted fallback. Karla still uses `next/font/google`.
The installed Google loader cannot combine its variable optical axis with the
reference's restricted weight ranges. Normal builds consume the committed
assets; only regeneration requires network access and external tooling.

Regenerate from the repository root with `bash scripts/subset-newsreader.sh`
(requires `curl`, `sha256sum`, `uv`). The script pins upstream revision, checks
both TTF SHA-256 values, pins fonttools 4.60.1/Brotli 1.2.0/Zopfli 0.4.3, limits
only weights/glyphs/features, and preserves timestamps. Run the loaded-font
typography and transfer-budget browser tests after any regeneration; also compare the reference and remeasure
three optimized Lighthouse runs when changing the subset.
