# Dark refresh fidelity ledger

This ledger compares the conceptual mockups in this directory with the implemented prototype. The mockups are directional references, not product screenshots.

| Reference point | Implemented result | Intentional difference |
| --- | --- | --- |
| Near-black canvas, navy surfaces, cool-white type, and one electric-blue accent | Implemented as CSS design tokens across the full application | Green and amber remain reserved for verified and caution states so semantic status is not flattened into the brand accent. |
| Strong desktop split between assessment/receipt and receipt/outcome learning | Implemented with responsive two-column grids and a clear shared axis | The existing case-title, desired-outcome, and constraints fields remain above the assessment question, so the real first viewport is taller than the concept. |
| Receipt presented as a readable interface rather than an image-like document | Implemented as Decision, Work plan, and Trust tabs with semantic HTML, selectable text, and local controls | Existing domain copy, provenance, and verification behavior are preserved instead of adopting illustrative mockup text. |
| Dedicated mobile composition | Implemented as a single-column stack with 44px interaction targets, wrapped navigation, and no horizontal overflow at 390px | The mobile result remains a continuous document rather than compressing dense evidence into accordions that would change information access. |
| Fine architectural lines and restrained technical atmosphere | Implemented through borders, a faint grid, an accent seam, and subtle focus glow | Generated icons and decorative diagrams were not shipped; the product has no established icon system, and adding one would exceed a presentation-only refresh. |
| Clear validated-result and learning-review hierarchy | Implemented with blue recommendation emphasis, green verification evidence, numbered outcome steps, candidate card, and before/after preview | Validation appears only when real verification evidence exists; the live preview never implies a completed check. |

## Verification notes

- Desktop assessment and completed views were inspected at 1536 × 1024.
- Mobile assessment and completed views were inspected at 390 × 844.
- Both mobile states had document width equal to the viewport client width, with no horizontal overflow.
- Assessment, receipt tabs, trust evidence, learning candidate actions, learning history, focus treatment, reduced motion, forced colors, and print treatment are covered by the CSS refresh.
