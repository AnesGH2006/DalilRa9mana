---
name: Framer Motion TypeScript Quirks
description: Known TS type issues with framer-motion Variants in this project
---

## Rule
Do NOT use `ease: number[]` (bezier array) in `Variants` objects — TypeScript rejects it.
Use `ease: "easeOut" as const` (or other string names) instead.

For custom variant functions (`animate: (i) => ({...})`), type the variants object as `any`:
```ts
const myVariants: any = {
  initial: { opacity: 0 },
  animate: (i: number) => ({ opacity: 1, transition: { delay: i * 0.05 } }),
};
```

**Why:** framer-motion's `Variants` TypeScript type doesn't accept `number[]` for `ease` (it expects `Easing | Easing[]` where `Easing` is a string union), even though the runtime accepts bezier arrays. Custom function variants also fall outside the declared `Variants` type.

**How to apply:** When writing new animation variants, default to string easing values ("easeOut", "easeIn", "easeInOut"). Only use arrays inline on `transition={{}}` props (not in Variants objects) if needed.
