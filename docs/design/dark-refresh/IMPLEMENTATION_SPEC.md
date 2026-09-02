# Dark Control-Room Refresh — Implementation Spec

> Scope: presentation-only refresh of the existing local prototype
> Reference: general visual qualities observed at https://hubtown.co.in/; no copied branding, assets, copy, or distinctive interaction expression
> Supporting critique: read-only Kimi K3 review through Pi on 2026-09-01

## Concept Sources

- `assessment-desktop.png` — desktop assessment and live receipt
- `completed-desktop.png` — desktop completed receipt and learning review
- `assessment-mobile.png` — mobile assessment and live receipt
- `completed-mobile.png` — mobile completed receipt and learning review

The images are implementation references only. All product text, controls, receipt content, and state remain code-native.

## Scope Lock

- Preserve the current React component tree, navigation destinations, labels, assessment order, actions, API calls, runtime behavior, persistence, receipt semantics, learning controls, and error/recovery behavior.
- Change only visual tokens, layout, responsive presentation, component states, and non-blocking decorative treatment.
- Do not add images, WebGL, video, sound, a preloader, scroll choreography, new navigation, fake metrics, marketing copy, or product capabilities.
- Do not copy Hubtown branding, real-estate content, assets, or exact page composition.

## Visual Thesis

Andhrím should feel like a calm architectural control room for consequential decisions. One electric-blue focal signal identifies the current step, selected answer, recommendation, primary action, or keyboard focus. Everything else is structured by deep navy surfaces, cool-white typography, blue-gray secondary text, fine ruled boundaries, and generous document spacing.

The Recommendation Receipt is the focal object. It must read as an interface with distinct semantic sections, not as a paper screenshot or an undifferentiated wall of text.

## Color Tokens

| Token | Value | Role |
|---|---:|---|
| Canvas | `#05070D` | page background |
| Surface | `#0A1220` | primary panels and receipt |
| Surface raised | `#101B2D` | hover, nested editable regions |
| Surface inset | `#070C15` | text wells and code-like detail |
| Text primary | `#F4F7FF` | headings and body; 18.79:1 on canvas |
| Text secondary | `#AAB8D0` | supporting text; 9.35:1 on surface |
| Text quiet | `#8292AD` | metadata only; verify in render |
| Decorative line | `#26364D` | nonessential hairlines |
| Interactive line | `#526B8D` | required control boundaries; 3.43:1 on surface |
| Accent fill | `#2F6CF6` | primary filled action; white text 4.57:1 |
| Accent text | `#75A7FF` | links, labels, verdict; 7.79:1 on surface |
| Focus | `#9FC1FF` | keyboard focus; 11.07:1 on canvas |
| Success | `#58DF8B` | verified/success label plus non-color cue |
| Danger | `#FF887F` | error label plus border/message |

Decorative lines may be subtle. Any boundary needed to identify a control uses the interactive line or a stronger state color.

## Typography

- UI and content: `Inter`, `Segoe UI`, system sans-serif fallbacks.
- Wordmark and result display: the same family, with larger scale and disciplined negative tracking; no paper-like serif treatment.
- Wordmark: 30px desktop, 26px mobile, weight 600.
- Page title: `clamp(2rem, 3.2vw, 3.5rem)`, weight 650, line-height near 1.05.
- Receipt title: `clamp(1.65rem, 2.3vw, 2.35rem)`.
- Recommendation verdict: `clamp(1.75rem, 3vw, 3.25rem)`, weight 650, accent text color.
- Body: 15–16px with at least 1.55 line height.
- Technical labels: 11–12px uppercase, 0.08–0.12em tracking, weight 750; never below the quiet-text contrast floor.
- IDs and hashes: system monospace, allowed to wrap anywhere.

## Layout and Component Inventory

### Global frame

- Full dark canvas with a very faint 56px technical grid and one low-opacity blue radial light.
- Header uses a single bottom rule, a restrained wordmark, and the existing navigation only.
- Footer remains in normal flow and preserves all runtime/privacy text.

### Assessment state

- Desktop retains the existing `43% / 57%` split, with a maximum overall content width and equal panel discipline.
- Assessment and receipt become complementary bordered surfaces with 8px corner radius.
- Progress keeps five accessible 44px controls connected by one fine line.
- Radio options remain open rows, not individual cards. Selection uses filled radio, brighter text, and a subtle left-to-right accent wash.
- Primary action is electric-blue filled; secondary action remains transparent with a strong boundary.

### Recommendation Receipt

- Receipt surface is deep navy, not paper-white.
- Receipt heading and recommendation carry the largest type contrast.
- Tabs remain the existing Decision / Work plan / Trust views and use a bottom accent rule for the active view.
- Receipt rows retain semantic `dl` structure; desktop uses label/value columns and mobile stacks labels over values.
- Autonomy boundary, verification evidence, provenance, and recovery content remain fully visible.
- Work Starter Pack uses open ruled rows; editing fields use the inset surface and interactive boundary.

### Completed and learning state

- Desktop retains the existing receipt/learning two-column split until 1100px, then stacks.
- Numbered learning steps use blue circular markers connected by a faint vertical rule.
- Candidate and verification regions use one bordered surface without nested-card proliferation.
- Before/after/provenance remains a three-column comparison on desktop and a single stacked sequence on mobile.
- Destructive/deactivation actions remain visibly secondary and use text/border cues in addition to color.

## Responsive Contract

- `>1100px`: completed receipt and learning review are two columns.
- `>960px`: assessment and live receipt are two columns.
- `<=960px`: both main surfaces stack in document order with 20–28px gutters.
- `<=620px`: header becomes two deliberate rows; navigation wraps without hiding destinations; receipt label/value rows stack; actions wrap; tabs remain three equal columns; all content stays within the viewport.
- Minimum interactive target is 44px in either dimension where practical and never below WCAG 2.2 AA target-size expectations.
- No horizontal page overflow at 320, 360, 390, 768, 1024, or 1440 CSS pixels.

## Motion

- 120–180ms color, border, and opacity transitions only.
- Optional initial surface reveal is limited to opacity and a maximum 6px translation.
- No receipt-content reveal sequence, preloader, parallax, or scroll-linked motion.
- `prefers-reduced-motion: reduce` removes animation and transitions and disables smooth scrolling.

## Visible Copy Lock

The existing TSX is the source of truth. Do not add, remove, rename, or reorder visible product copy as part of this refresh. In particular, preserve:

- `Andhrím`, `Agent or Not?`
- `New case`, `Outcome`, `History`, `Export`, `About`
- `Delegation assessment`, all case fields, five questions, and their options
- `Recommendation Receipt`, `Decision`, `Work plan`, `Trust`
- all receipt section labels, trust evidence, Work Starter Pack, learning, history, error, recovery, and footer text

## Verification Gates

- Existing type, unit, build, provider-free, browser, secret, and license checks pass.
- Keyboard-only use preserves visible focus through the assessment, receipt tabs, editing, learning actions, history, export, and recovery.
- Automated browser verification covers desktop and mobile screenshots, overflow, and essential state visibility.
- Manual fidelity review compares each rendered state against its corresponding concept at a matching viewport.
- At least five explicit comparison points cover hierarchy, palette, receipt anatomy, controls, spacing, and responsive behavior.
