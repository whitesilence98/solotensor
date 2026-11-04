# Surface brief — /assets (Existing Assets gallery)

## Scope & mode
Operate. Visitor completes a task: find, inspect, and retrieve previously generated assets. Part of Comfy Studio (Next.js 15 + Tailwind), reached from the dark studio workspace via the sidebar Assets icon. Images tab is wired to the real backend (GET /api/v1/gallery); Videos and 3D Assets tabs show honest teaching empty states (backend does not produce these yet).

## Audience, job, action, proof, constraints
- Audience: the solo creator using their local ComfyUI pipeline.
- Job: browse everything they have generated; find one asset fast; open or download it.
- Action: search, switch media type, open lightbox, download/open original, load more.
- Proof: real files from local disk storage (backend-only decision); no invented creators — every asset is the user's own.
- Constraints: brief pins light world (white #FFFFFF, #F8F9FA surfaces, slate #1E293B text, #6366F1 accent, Inter, 200ms ease-in-out, 12px radius, 16px gap, masonry 3–5 columns). Backend returns no creator/title/tag metadata — creator is honestly "You"; search filters by filename.

## Chosen direction & memorable moment
Precisely-specified brief; no concept roll (form is the brief's own). Direction: a light, gallery-grade masonry library (Unsplash/Spline register) set against the app's dark generator — the contrast IS the wayfinding. Signature interaction: the hover choreography on image cards (gradient veil + creator row rising, quick actions fading in) with the indigo underline tab indicator sliding the eye between media types; plus the persistent centered indigo FAB that loads more assets and disappears when exhausted.

## Direction contract
THESIS: the asset wall is the product's memory — a quiet white room where everything you made is findable in seconds; it refuses the dashboard instinct of wrapping assets in chrome-heavy cards.
OWN-WORLD: white ground, slate-50 raised surfaces, hairline slate-100 borders, one indigo accent reserved for active tab underline, FAB, focus, and selection; Inter throughout with tight tracking on headings; 12px radii, 16px gutters, 200ms ease-in-out on every state change.
STORY: "everything I generate is collected here; I can search it, tab between media types, open any piece full-size, and take it with me." Empty tabs teach what would populate them instead of apologizing.
FIRST VIEWPORT: sticky white header (search bar with icon left + "/" hint, Settings button right) over a tab row (Images n / Videos 0 / 3D Assets 0, active = crisp indigo underline + tinted count pill), then masonry of real generated images filling the rest; FAB floats bottom-center of the content column.
FORM: precisely-specified brief; no concept-seed roll (per skill routing for narrow, fully-pinned requests); composition follows the brief's own hierarchy.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions
- None blocking; Videos/3D content arrives only when a backend workflow produces those types.