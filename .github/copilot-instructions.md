# CineForge AI workspace instructions

## Project overview

- This repository is a Node-powered AI video demo.
- The application UI is in `Index.html`: HTML, CSS, and browser JavaScript are in one file.
- `server.js` is the dependency-free static server and Google Veo API proxy.
- Start the app with `npm start`; the default URL is `http://localhost:3000`.
- Keep `GOOGLE_API_KEY` in `.env` or the server environment. Never expose it in HTML or browser JavaScript.

## Repository conventions

- Make `Index.html` the source of truth unless the task explicitly requires splitting the app into files.
- Keep the existing single-page structure and use the `navigate(page)` function for section switching.
- Follow the existing lowercase, kebab-free DOM ID conventions where practical and keep JavaScript compatible with plain browser APIs.
- Preserve the existing CineForge visual system: dark surfaces, purple accents, muted text, 14px Inter-based type, rounded cards, and responsive sidebar layout.
- Keep changes surgical and avoid adding dependencies unless a real feature requires them.
- Clearly distinguish local preview output from Google Veo AI output.
- Prefer semantic HTML and existing `.secondary`, `.primary`, `.card`, `.field`, and `.nav` patterns over new one-off styles.
- Preserve keyboard and basic accessibility behavior: use real buttons or labels for controls, visible focus styles, useful image alternative text, and avoid changing the UI without user feedback.

## Working with the JavaScript

- The application initializes sample templates, projects, media, and storyboards near the end of `Index.html`.
- Use existing functions such as `navigate`, `showToast`, `openModal`, `useTemplate`, and `generate` before duplicating behavior.
- Keep local operations deterministic and mark server-backed actions accurately.
- Do not interpolate untrusted user input into `innerHTML`. Continue using static sample data for generated markup, and use DOM APIs or `textContent` for user-controlled values.
- Preserve prompt limits and existing form defaults, especially the 2000-character prompt limit.

## Styling and responsive behavior

- Main responsive rules are in the inline `<style>` block and already cover tablet and mobile widths.
- Test layout changes at desktop, roughly tablet, and mobile widths. The sidebar intentionally collapses at the 700px breakpoint.
- Do not rely on external asset availability for layout correctness. Unsplash and Google Fonts imports are existing optional enhancements.
- Keep images and cards from overflowing narrow viewports; verify large text, form grids, modals, and preview controls.

## Validation

- Start the app with `npm start`.
- Open `http://localhost:3000/` and manually verify the affected page and controls.
- For JavaScript changes, open browser developer tools and check the Console for errors.
- At minimum, verify navigation, modal/toast behavior, prompt character counting, template selection, text-to-video and image-to-video tabs, and mobile layout when relevant.
- If adding a real external integration, document configuration requirements and add appropriate environment handling; do not embed secrets or credentials.
