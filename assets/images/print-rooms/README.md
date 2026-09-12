# Photographic room backdrops

Generated with the built-in image-generation tool on 12 September 2026, using the imagegen skill. Project files: `living-v1.jpg`, `bedroom-v1.jpg`, `office-v1.jpg`, `minimal-v1.jpg`. Originals remain in the local Codex generated-images folder. JPEG encoding reduces these four 1536x1024 assets to approximately 1.1 MB total. Load only the selected room and reuse it in memory.

Shared final prompt:

> Use case: photorealistic-natural. Asset: static backdrop for wall-art ecommerce configurator. Photorealistic high-end interior editorial photograph, landscape 3:2. Camera exactly front-on to a blank plaster wall, verticals straight, no perspective tilt. Wall spans approximately 4 metres horizontally. Large uninterrupted EMPTY wall in top 65 percent, especially center x50%, y37%, where artwork will be composited later. Furniture confined to bottom 35 percent. Natural window light from upper left, realistic material detail, subtle shadows, warm neutral tones. No art, no frames, no mirrors, no wall decoration, no text, no logos, no people. Not illustration or flat vector.

Room-specific prompt additions:

- Living: Living room: oatmeal linen sofa 2 metres wide centered at bottom, oak side table at far left, subtle woven rug and warm oak flooring.
- Bedroom: Bedroom: softly upholstered low headboard and ivory linen bedding centered at bottom, walnut bedside table far right, calm warm ivory plaster wall.
- Office: Home office: elegant walnut writing desk centered at bottom, low leather chair, small task lamp at far edge below wall display area, warm greige plaster wall.
- Minimal: Minimal architectural interior: travertine bench centered at bottom, softly textured limewash wall, pale stone flooring, single sculptural ceramic vase at far edge below wall display area.

The renderer uses approximate furniture-relative scale, not a physical measurement of an actual room. Generated compositions were visually inspected and their scale/anchor metadata adjusted. Artwork is composited separately without any AI processing. Frame highlights/shadows do not modify the artwork or the print export. Room load failure falls back to product view; stale asynchronous loads cannot overwrite a newer selection.
