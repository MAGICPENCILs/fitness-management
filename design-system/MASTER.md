# Fitness Pro Design System

## Product direction

- Product: operational fitness-center admin dashboard
- Tone: professional, clear, energetic without visual noise
- Primary users: front-desk staff and managers working quickly on desktop or tablet
- Priority: clarity, scan speed, accessible controls, and responsive operation

## Visual language

- Use a light slate background with white surfaces and one indigo accent per view.
- Use green, amber, and red only for semantic status, always paired with text or an icon.
- Do not use gradients, glows, decorative blur, or emoji as interface icons.
- Use Lucide outline icons consistently.
- Use the existing radius and shadow tokens; cards use `rounded-xl`, `border`, and `shadow-sm`.

## Typography and numbers

- Use the application sans-serif stack with Thai system fallback.
- Headings use `text-balance`; body copy uses `text-pretty`.
- Use `tabular-nums` for currency, counts, dates, and other operational data.
- Keep body text at least 16px on mobile inputs and maintain readable contrast.

## Layout and spacing

- Follow a 4/8px spacing rhythm.
- Page containers use responsive padding: 16px mobile, 24px tablet, 32px desktop.
- Desktop uses a persistent 256px sidebar; mobile uses a labelled menu dialog.
- Interactive targets are at least 44px high where practical.
- Dense tables may scroll horizontally, but page content must not create horizontal overflow.

## Interaction and accessibility

- Preserve visible focus rings and keyboard operation.
- Icon-only buttons require an accessible label.
- Forms require visible labels and local error messages.
- Loading, empty, error, and success states must explain the next action.
- Charts require a text summary or accessible label and must not rely on color alone.
- Keep interaction feedback under 200ms and respect reduced-motion preferences.
