const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const { execSync } = require('child_process');

const svgRaw = fs.readFileSync('assets/icon.svg', 'utf-8');
// Scale up to 1024x1024
const svgScaled = svgRaw.replace(/width="16"/g, 'width="1024"').replace(/height="16"/g, 'height="1024"');

const resvg = new Resvg(svgScaled, { fitTo: { mode: 'width', value: 1024 } });
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

fs.writeFileSync('assets/icon.png', pngBuffer);
console.log('PNG saved: assets/icon.png');

// Use Pillow for ICO and ICNS
execSync(`python -c "
from PIL import Image
img = Image.open('assets/icon.png').convert('RGBA')
sizes = [(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]
imgs = [img.resize(s, Image.LANCZOS) for s in sizes]
imgs[0].save('assets/icon.ico', format='ICO', sizes=sizes, append_images=imgs[1:])
print('ICO saved: assets/icon.ico')
# ICNS via TIFF approach (Electron accepts PNG-named .icns)
img.save('assets/icon.icns', format='PNG')
print('ICNS saved: assets/icon.icns')
"`, { stdio: 'inherit' });
console.log('All icon formats generated!');
