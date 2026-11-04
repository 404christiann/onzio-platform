"""Lossless source preparation; run from the app checkout with the outer archive present.
No synthetic logo detail or global normalization changes. Publication happens separately.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

workspace = Path('../..')
sources = workspace / 'assets/originals/identity'
output = Path('assets/rose-city-crest-2027/inputs')
output.mkdir(parents=True, exist_ok=True)
assets = {}

def record(key, path, source, processing):
    image = Image.open(path)
    assets[key] = {'inputPath': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                   'width': image.width, 'height': image.height, 'mimeType': 'image/png',
                   'kind': 'graphic', 'source': str(source), 'processing': processing}

def prepare(key, name, trim=False):
    source = sources / name
    image = Image.open(source).convert('RGBA')
    if trim:
        image = image.crop(image.getchannel('A').getbbox())
    path = output / (key + '.png')
    image.save(path, compress_level=9)
    record(key, path, source, 'Lossless PNG, transparent-margin trim only' if trim else
           'Lossless PNG re-encoding; original geometry/colors retained')

patches = ['Rose City FC Crest Rose City Futbol Club Grayscale.png',
           'Rose City FC Crest Rose Grayscale.png', 'Rose City FC Crest #23 Grayscale.png',
           'Rose City FC Crest Crown Grayscale.png', 'Rose City FC Crest Key Grayscale.png',
           'Rose City FC Crest Stem.png']
icons = ['Rose City FC Logo Details black.png', 'Rose City FC Rose black.png',
         'Rose City FC 23 black.png', 'Rose City FC Crown black.png', 'Rose City FC Key black.png']
for index, name in enumerate(patches):
    prepare(f'patch{index + 1}', name, True)
for index, name in enumerate(icons):
    prepare(f'icon{index + 1}', name, True)
prepare('map', 'Rose City FC Official Pasadena Map 2027.png')
colors = ['Rose CIty FC Brand Identity Rose Parade Red Color Black.png',
          'Rose CIty FC Brand Identity 12am at Midnight Color Black.png',
          'Rose CIty FC Brand Identity Faded White Color Black.png',
          'Rose CIty FC Brand Identity Rose Stem Color Black.png',
          'Rose CIty FC Brand Identity Steel Color Black.png',
          'Rose CIty FC Brand Identity Parrot Colors Black.png']
for index, name in enumerate(colors):
    prepare(f'color{index + 1}', name)

master_source = workspace / 'assets/originals/Rose City FC Official Club Logo 7 16 2027 MASTER.png'
master = Image.open(master_source).convert('RGBA')
stem = master.crop((1580, 2200, 1720, 2373))
stem.putdata([(0, 0, 0, round(max(0, min(255, -5*r + 10*g - 5*b)) * a/255))
              for r, g, b, a in stem.getdata()])
stem = stem.crop(stem.getchannel('A').getbbox())
path = output / 'icon6.png'
stem.save(path, compress_level=9)
record('icon6', path, master_source, 'Exact supplied stem pixels, same reversible green-to-alpha matrix as approved preview; black silhouette, alpha crop')

scale = 3
canvas = Image.new('RGBA', (700*scale, 530*scale), (0, 0, 0, 0))
render = master.resize((round(525*scale), round(525*scale*master.height/master.width)), Image.Resampling.LANCZOS)
canvas.alpha_composite(render, (round(98*scale), round(26.5*scale)))
draw = ImageDraw.Draw(canvas)
lines = [[(340,46),(340,112)],[(110,248),(224,248)],[(122,294),(280,294)],
         [(148,371),(344,371)],[(601,162),(414,162),(414,174)],[(633,248),(509,248)]]
for line in lines:
    draw.line([(round(x*scale), round(y*scale)) for x, y in line], fill='#818181', width=3)
font = ImageFont.truetype('public/fonts/lemon-milk/LEMONMILK-BoldItalic.otf', 22*scale)
labels = [('ROSE CITY FUTBOL CLUB',157.5,0),('CROWN',0,530*.445),('ROSE',700*.082,530*.532),
          ('STEM',700*.124,530*.677),('#23',700*.87,530*.287),('KEY',700*.915,530*.445)]
for label, x, y in labels:
    draw.text((round(x*scale), round(y*scale)), label, font=font, fill='#141414', anchor='lt')
path = output / 'diagram.png'
canvas.save(path, compress_level=9)
record('diagram', path, master_source, 'Authored annotated graphic from untouched master and approved HTML diagram coordinates, 3x labels/leader lines, no generated logo geometry')
Path('assets/rose-city-crest-2027/manifest.json').write_text(json.dumps({
    'version': 1, 'sourceFolder': '/Rose City FC x Onzio 2027/Our Identity', 'assets': assets
}, indent=2) + '\n')
