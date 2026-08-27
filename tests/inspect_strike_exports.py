from pathlib import Path
from PIL import Image
import subprocess

root = Path('/home/ubuntu/Downloads')
png = root / 'promo-pop-A4-Portrait (2).png'
pdf = root / 'promo-pop-A4 (6).pdf'
with Image.open(png) as image:
    print(f'PNG {png.name}: {image.width}x{image.height}, mode={image.mode}')
info = subprocess.check_output(['pdfinfo', str(pdf)], text=True)
for line in info.splitlines():
    if line.startswith(('Pages:', 'Page size:', 'File size:')):
        print(line)
print(f'PDF {pdf.name}: {pdf.stat().st_size} bytes')

