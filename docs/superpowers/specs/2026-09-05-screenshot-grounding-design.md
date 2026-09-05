# V4 Screenshot Grounding Design

## Goal
Allow a user to upload a PNG/JPG dashboard screenshot and receive the same deterministic decision-first HTML/SVG/PNG output path used by V3, without trusting agent-authored OCR text.

## Trust boundary
The screenshot itself is the source of truth. A code adapter must hash the image bytes and produce an OCR token manifest. The agent may select token IDs and classify decision roles, but it may not create OCR tokens, alter token text, or invent screenshot coordinates.

## Data flow

```text
Screenshot PNG/JPG
  -> screenshot-adapter.js
  -> OCR token manifest {imageSha256,width,height,tokens[]}
  -> Agent selects tokenRefs and builds grounded bundle
  -> grounding.js verifies screenshot hash, manifest hash, token existence, bbox, confidence and claim value
  -> PASS / RETURN_TO_EVIDENCE_EXTRACTION / FALLBACK_TO_NO_SCORE
  -> existing deterministic renderer
  -> HTML / SVG / PNG
```

## Source contract
`grounded-bundle.schema.json` gains `source.kind = "screenshot"` and an optional `manifestPath` + required `manifestSha256` for screenshot sources. Existing json/text sources remain unchanged.

A screenshot evidence anchor uses:

```json
{
  "type": "token_span",
  "tokenRefs": ["tok_001", "tok_002"],
  "valueText": "$283,189"
}
```

The token manifest is closed-schema:

```json
{
  "version": 1,
  "imageSha256": "<64 hex>",
  "width": 2048,
  "height": 1218,
  "engine": "tesseract",
  "tokens": [
    {
      "id": "tok_000001",
      "text": "Monthly",
      "confidence": 96.9,
      "bbox": {"x":139,"y":21,"width":127,"height":32}
    }
  ]
}
```

## Adapter behavior
`screenshot-adapter.js` is a zero-NPM-dependency Node wrapper around the system `tesseract` binary. It accepts a local PNG/JPG and output manifest path, runs Tesseract TSV, drops empty/negative-confidence tokens, assigns deterministic token IDs in OCR row order, records image dimensions and SHA-256, then writes the manifest.

The adapter must fail closed with a non-zero exit when Tesseract is unavailable or OCR produces no usable tokens.

## Screenshot grounding rules
Grounding must verify all of the following mechanically:

1. image file stays inside the bundle base directory and is a regular file;
2. image SHA-256 equals `source.sha256`;
3. manifest file stays inside the base directory, is a regular file, and its SHA-256 equals `manifestSha256`;
4. manifest `imageSha256` equals the image source SHA;
5. every `tokenRef` exists exactly once;
6. token bbox stays within image dimensions;
7. token confidence is >= 70 for facts used in decision-state claims;
8. token span order follows reading order and concatenated token text contains/matches `valueText` under conservative whitespace normalization;
9. one evidence record still backs exactly one claim, preserving V3 exact-ledger semantics.

Failures are machine-readable. New codes: `SCREENSHOT_MANIFEST_MISSING`, `SCREENSHOT_MANIFEST_HASH_MISMATCH`, `SCREENSHOT_IMAGE_HASH_MISMATCH`, `TOKEN_NOT_FOUND`, `TOKEN_BBOX_INVALID`, `OCR_EVIDENCE_UNCERTAIN`, `TOKEN_TEXT_MISMATCH`, `SCREENSHOT_OCR_FAILED`.

## Scope of V4.0
The first release grounds high-value visible facts only: dashboard title, date range, KPI labels/values/deltas, section labels, and compact signal values. It does not attempt full table-cell reconstruction, chart-point digitization, tooltip extraction, or semantic OCR correction.

## Real regression fixtures
The three accepted real screenshots are used as screenshot-adapter smoke fixtures, with the MRR page as the primary end-to-end regression. Expected mode for all three is `no_score`; no composite score may be invented.

## Output behavior
The renderer remains unchanged in V4.0. Once screenshot grounding passes, existing no-score/composite renderers produce HTML/SVG. PNG is derived from the deterministic SVG/HTML render rather than generated independently by an image model.
