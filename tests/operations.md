# Test — Operations Dashboard

## Input condition

Dashboard contains:

- production output
- OEE
- defect rate
- downtime
- throughput
- energy use
- safety incidents

Primary user: Plant manager.

## Primary decision

Is the plant operating acceptably, and what requires immediate intervention?

## Critical constraint

A critical safety incident is active.

## Expected behavior

The skill must treat the safety incident as a hard-stop condition.

It must NOT average safety into a reassuring composite score.

Expected central state:

**Operational Health — Critical**

Supporting diagnostics can explain:

- which line has downtime
- which machine is driving defects
- production impact
- recommended intervention

## Failure condition

A composite score such as 72/100 that visually suggests moderate health despite an active critical safety incident.
