# H Wallet UI System Guide

This project uses a unified UI token system in `src/theme/uiSystem.ts`.

## Single Source Of Truth

- Colors: `uiColors`
- Radius: `uiRadius`
- Spacing: `uiSpace`
- Shadows: `uiShadow`

## Mandatory Rules

- Page background must use `uiColors.appBg`.
- Card background/border should use `Surface` first, not ad-hoc styles.
- Horizontal page padding should use `uiSpace.pageX`.
- Section spacing should use `uiSpace.sectionGap` as baseline.
- New screen-level hardcoded background hex values are not allowed unless for a deliberate brand gradient area.

## Migration Priority

1. Screen container + section spacing
2. Card container styles through `Surface`
3. Repeated chips/pills to tokenized radius and colors
4. Keep brand gradients only for hero modules

## Review Checklist

- Does this page visually match Wallet rhythm (density, spacing, hierarchy)?
- Are token constants used instead of scattered literals?
- Is there unnecessary duplicate visual information?
- Are right-aligned numeric columns baseline-aligned?

