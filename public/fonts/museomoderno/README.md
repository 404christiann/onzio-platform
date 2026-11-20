# MuseoModerno

Official Google Fonts variable TTF, weight axis100–900. The approved Rose City2027 display treatment uses900 (Black).

Source: https://raw.githubusercontent.com/google/fonts/main/ofl/museomoderno/MuseoModerno%5Bwght%5D.ttf

License: SIL Open Font License1.1, preserved in `OFL.txt`.

SHA256: `d03b027cf5cf72d014c8a405a8ceb83ea1d5d8ae2c64a7f602b131d9973e3503`.

This file does not supply Avenir or alter the existing LEMON MILK licensing status.

## Inlined Latin subset (RC-CLS-2)

`components/cinematic/CinematicDisplayFont.tsx` (rendered by the Rose City layout only) also inlines a 900-weight, Latin-only instance of this file as a `data:` URL (`museo-moderno-latin-900.ts`), declared after the full face in `cinematic.css` with a matching `unicode-range`. Headings then render in MuseoModerno from the first paint, instead of re-wrapping when this 188 KB file arrives (that re-wrap was the largest layout shift left on Shop and Schedule). The full file still loads for any character outside the subset. Made with fontTools 4.39 from the file above:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
font = instancer.instantiateVariableFont(TTFont("MuseoModerno.ttf"), {"wght": 900}, updateFontNames=False)
options = subset.Options(); options.notdef_outline = True; options.hinting = False; options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
subsetter = subset.Subsetter(options)
subsetter.populate(unicodes=[*range(0x20, 0x7F), *range(0xA0, 0x100), 0x131, 0x152, 0x153, 0x2BB, 0x2BC, 0x2C6, 0x2DA, 0x2DC,
    0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2022, 0x2026, 0x2039, 0x203A, 0x20AC, 0x2122, 0x2191, 0x2193, 0x2212, 0x2215])
subsetter.subset(font); font.save("MuseoModerno-900-latin.ttf")  # then base64 into the @font-face src
```

SHA256 of the subset: `a54a23537a1ebdd4c1d7b8df325c1f7e5a445274568b7f381d9f6193e88fccce` (24,848 bytes). At 64 px it renders with the same advances as the variable font at 900 (80 anti-aliasing pixels differ by at most 9/255).
