# Diagram sources

The engineering diagrams used by the public README and architecture guide are
rendered from `render_diagrams.py`. They deliberately use the same paper, ink,
green, lime, coral and teal system as the Finite product.

Requirements:

- Python 3.11 or newer
- Pillow 10 or newer
- Arial or DejaVu Sans fonts

Render from the repository root:

```bash
python docs/diagrams/render_diagrams.py
```

The script writes deterministic PNG assets into `docs/media/`. Commit both the
source and the rendered files so GitHub readers do not depend on an external
diagram service.
