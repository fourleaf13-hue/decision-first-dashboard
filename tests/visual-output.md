# Test: Visual Translation Regression

## Observed failure before v4

Earlier skill revisions improved reasoning but still failed at visual translation.

### Failure A — framework diagram leakage

A model rendered labels such as:

- `(Decision)`
- `(Outcome)`
- `(Actionable)`
- `Diagnostic Signal`
- `Success Signal`

It also invented an unsupported `MARGINAL` status and invented workflow buttons.

### Failure B — generic three-column reinterpretation

After v3 added backstage-reasoning rules and a visual reference, a model still produced:

- `Diagnostic Context`
- `Overall Subscription State`
- `Required Interventions`
- a large center text card saying `Metric Performance is Improving (Targets unknown)`;
- a full-width customer table dominating the lower page;
- an invented `Intervene` button.

The result followed the words `left / center / right` but did **not** preserve the supplied After reference's dominant-center composition, compact card density, integrated synthesis, or executive visual balance.

## Prompt

Redesign the attached SaaS dashboard using the decision-first-dashboard skill.

Primary user: SaaS founder / revenue leader.

Primary decision:
Is subscription health good enough, or does something require intervention?

Requirements:
- create the actual visual dashboard, not only a written specification;
- use only source-supported data;
- use `after-reference.png` as a composition and visual-hierarchy target, not a data source;
- do not invent scores, targets, statuses, customer events, actions, or causal claims;
- verify every displayed value after rendering.

## Expected behavior

The agent should:

- inspect the visual reference before rendering when the runtime permits;
- preserve a clearly dominant central synthesis region;
- make left/right support areas subordinate rather than equal peers;
- create an integrated central signal cluster rather than a large sentence card;
- avoid framework-like headings such as `Diagnostic Context`, `Overall State`, or `Required Interventions`;
- avoid `Decision`, `Diagnostic`, `Outcome`, or `Actionable` labels in the product UI;
- avoid a four-card KPI strip as the primary hierarchy;
- use an evidence-bounded status when thresholds are missing;
- preserve improving-vs-healthy as separate concepts;
- surface confirmed account exceptions without inventing causes, workflow states, or buttons;
- keep executive detail compact instead of letting a full-width customer table dominate the page;
- create/render the requested interface rather than stopping at analysis;
- verify that every rendered number, state, event, and action matches the source.

## Visual pass criteria

A passing result should feel structurally closer to `after-reference.png` than to a standard admin dashboard:

1. **Dominant center:** unmistakable first focal point.
2. **Integrated synthesis:** 3–6 signals visually contribute to the central state.
3. **Asymmetric support:** left/right explain and operationalize without competing with center.
4. **Compact executive density:** no large operational table unless explicitly required.
5. **Product-native language:** no methodology headings.
6. **Data integrity:** no invented score, target, status, event, action, or mismatched value.
