# Visualization Skill / Library Routing

Verified against current public repositories and docs on 2026-09-08.

The names below are often described online as “visual skills”, but most are libraries rather than Agent Skills. Treat them as implementation options, not as automatic visual-quality upgrades.

## What is actually installable as an Agent Skill

### ApexCharts

- Official AI skill exists: `apexcharts/apexcharts-skill`.
- It teaches correct ApexCharts data shapes, lifecycle, framework integration, SSR, and chart configuration.
- Useful when the output target is a standard interactive web chart.
- It does **not** replace this skill’s evidence, grounding, Metric Router, or deterministic dashboard composition.

### Recharts

- The official Recharts repository contains `.agents/skills`, but those are primarily repository-development workflows rather than a dedicated “make dashboards beautiful” skill.
- Recharts itself remains a chart library.

### visx, Bokeh, Cube, Nivo, Vue-ECharts, Scrollama

No first-party dedicated Agent Skill was found for these libraries in the same sense as the ApexCharts AI skill. They should be treated as libraries / infrastructure unless a separately maintained third-party skill is deliberately adopted and reviewed.

## Routing for this dashboard skill

The deterministic SVG renderer remains authoritative for the default Decision-First Dashboard output. Do not add a visualization dependency merely because a library looks visually richer in demos.

Use this routing only when the user explicitly asks for an application implementation in a framework rather than the fixed SVG/HTML compiler output:

| Need | Preferred option | Why |
| --- | --- | --- |
| Bespoke radar, custom geometry, unusual center composition | **visx** | Low-level React + D3 primitives; maximum geometry control. Best fit for recreating the `after-reference.png` visual family in a React product implementation. |
| Standard business charts in React | **Recharts** | Declarative, composable, fast to implement, easy to theme. |
| Standard charts with polished defaults | **Nivo** | Useful when a themed off-the-shelf chart is preferable to bespoke geometry. |
| Broad standard chart coverage / framework wrappers | **ApexCharts** | Strong chart-type coverage; official AI skill available. |
| Python interactive analytical output | **Bokeh** | Appropriate for Python-first exploratory / analytical dashboards, not this compiler renderer. |
| Vue application charting | **Vue-ECharts** | Vue wrapper around ECharts; use when the destination stack is Vue. |
| Data semantic layer / metrics API | **Cube** | Data infrastructure, not a visual rendering system. Do not treat it as an aesthetics tool. |
| Scrollytelling / narrative visualization | **Scrollama** | Scroll-triggered narrative orchestration, not a dashboard chart renderer. |

## Visual-quality rule

Library choice is secondary to the visual contract. A valid implementation must still preserve:

1. one dominant decision focal point;
2. a minimum sufficient first-view signal set;
3. real hierarchy instead of equal KPI cards;
4. restrained color and clear typography;
5. source-grounded values only;
6. a true radar only for 3–6 peer dimensions on one grounded shared scale;
7. geometry that follows the approved reference rather than the library’s default demo styling.

## Do not vendor all eight

Installing every package would add complexity without improving the deterministic renderer. For this repository:

- keep the current zero-dependency deterministic SVG/HTML production path;
- use **visx** as the preferred implementation reference when a custom React recreation is required;
- use **Recharts** for conventional supporting charts in React;
- use the **ApexCharts AI Skill** only when ApexCharts is actually chosen for an implementation target;
- do not introduce Cube, Bokeh, Vue-ECharts, Nivo, or Scrollama into the compiler unless a concrete output requirement justifies them.

## Public references

- Recharts: https://github.com/recharts/recharts
- visx: https://github.com/airbnb/visx
- ApexCharts AI Skill: https://github.com/apexcharts/apexcharts-skill
- ApexCharts AI docs: https://apexcharts.com/docs/ai/overview/
- Anthropic graphing skill example: https://github.com/anthropics/claude-tag-plugins/blob/main/claude-tag-data-viz/skills/graphing/SKILL.md
