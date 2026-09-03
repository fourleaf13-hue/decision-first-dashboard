# SaaSGrid real-world pressure-test fixture

This fixture is a real-world visual-transcription test for the no-score compiler path.

Source image:
https://gdm-catalog-fmapi-prod.imgix.net/ProductScreenshot/0adccb43-e54f-4892-a2ab-57721fa45dcc.png

Values transcribed from the visible top-level KPI cards used by this fixture:

- ARR: `$4.98M`
- NDR: `80.7%`
- Gross Margin: `88.9%`
- CAC Payback: `9.4 mo`
- Burn Multiple: `1.5x`

The visible KPI cards do not provide a per-metric delta or direction, so the fixture intentionally omits those fields. It also does not add a composite score, thresholds, inferred targets, account exceptions, or events.

Purpose: protect the compiler against three real-world regressions discovered during pressure testing:

1. forcing callers to invent `delta` / `direction` for point-in-time KPIs;
2. rendering blank movement slots when movement evidence is absent;
3. hardcoding MRR / monthly comparison copy when the source provides ARR without a comparison period.

This fixture is evidence extracted from a screenshot for regression testing; it is not a claim that these values are current SaaSGrid company metrics.
