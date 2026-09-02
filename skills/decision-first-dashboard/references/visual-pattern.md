# Visual Pattern Reference

Use this as a **composition reference**, not a literal template.

The target is a calm, product-native executive dashboard similar to the repository's SaaS After example: one dominant synthesis area, diagnostics to the left, action/trend/impact to the right, and no visible framework terminology.

## Composite mode

Use when a real composite score or status model exists.

```text
┌──────────────────────────────────────────────────────────────┐
│ Product / page title                                         │
│                                                              │
│ WHY / WHERE            OVERALL STATE          WHO / IMPACT   │
│                                                              │
│ Outcome context        Subscription health    At-risk items  │
│ MRR / target                 68 / 100          Account list   │
│                              At risk                         │
│ Score composition          supporting          Health trend   │
│ / diagnostics             dimensions           -6 MoM         │
│                                                              │
│ Segment risk                                     Outcome      │
│ Enterprise churn                                 Net New MRR  │
└──────────────────────────────────────────────────────────────┘
```

### Visual behavior

- The center is the strongest focal point.
- Supporting inputs visually converge on the central state.
- Left panels explain **why / where**.
- Right panels answer **who / trend / impact**.
- Outcome impact stays visible but is not visually confused with score inputs.
- Use restrained color and generous whitespace.

## Multi-signal mode

Use when no defensible composite score can be calculated.

Do **not** replace a missing score with a fabricated one. Keep the same visual grammar:

```text
┌──────────────────────────────────────────────────────────────┐
│ Subscription health                                         │
│                                                              │
│ WHY / WHERE            OVERALL STATE          WHO / IMPACT   │
│                                                              │
│ Revenue trend          IMPROVING              Known exception│
│                        Target unknown          Dovetail       │
│                        ↑ MRR  +12.4%            cancellation   │
│ Churn trend            ↓ Churn -0.6pp                         │
│                        ↑ Customers +8.1%       Outcome context│
│ Conversion             ↑ Trial conv +3.2%      MRR $184,320   │
└──────────────────────────────────────────────────────────────┘
```

The center still synthesizes the evidence; it simply uses an evidence-bounded status instead of invented score math.

## Reasoning stays backstage

These are reasoning concepts, not default UI copy:

- Decision
- Driver
- Diagnostic
- Outcome
- Actionable
- Success Signal
- Composite mode
- Multi-signal mode

Translate them into hierarchy, not labels.

## Preserve product credibility

If a source dashboard has no target, do not add one.
If an account is only labeled `At risk`, do not invent `Failed payment`.
If a trial has already converted in the activity log, do not render a `Convert` action.
If a list is a sample, do not imply it represents the whole customer base.

## Reference image

When the runtime can inspect local image assets, use `after-reference.png` as a visual composition reference. Match its hierarchy, balance, restraint, and central-synthesis pattern — not its literal numbers or business facts.
