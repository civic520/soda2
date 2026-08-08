import subprocess, sys, os
from PIL import Image

# Step 1: Use Inkscape or fallback to svglib to rasterize SVG to PNG
svg_path = "assets/icon.svg"
png_1024 = "assets/icon.png"
png_ico_src = "assets/logo-build/icon-1024.png"

# Try cairosvg first
try:
    import cairosvg
    cairosvg.svg2png(url=svg_path, write_to=png_1024, output_width=1024, output_height=1024)
    print("Converted with cairosvg")
except ImportError:
    # Try svglib
    try:
        from svglib.svglib import svg2rlg
        from reportlab.graphics import renderPM
        drawing = svg2rlg(svg_path)
        if drawing:
            drawing.width = 1024
            drawing.height = 1024
            drawing.scale(1024/16, 1024/16)
            renderPM.drawToFile(drawing, png_1024, fmt="PNG", dpi=72)
            print("Converted with svglib")
        else:
            raise Exception("svg2rlg returned None")
    except Exception as e:
        print(f"SVG conversion libraries not available: {e}")
        print("Using Pillow to create icon from scratch...")
        # Create a simple orange rabbit-like icon
        S = 1024
        img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        # Orange background circle
        draw.ellipse([40, 40, S-40, S-40], fill=(244, 81, 30, 255))
        # Simple face
        draw.ellipse([280, 200, 744, 760], fill=(255, 255, 255, 255))  # face
        draw.ellipse([380, 350, 480, 500], fill=(244, 81, 30, 255))  # left eye
        draw.ellipse([544, 350, 644, 500], fill=(244, 81, 30, 255))  # right eye
        draw.ellipse([450, 550, 574, 650], fill=(244, 81, 30, 255))  # nose
        img.save(png_1024)
        print("Created placeholder icon")

# Copy to logo-build for reference
img = Image.open(png_1024)
img.save(png_ico_src)
print(f"PNG saved: {png_1024} ({img.size})")

# Step 2: Create ICO (multiple sizes)
ico_sizes = [(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)]
ico_images = []
for size in ico_sizes:
    resized = img.resize(size, Image.LANCZOS)
    ico_images.append(resized)
ico_images[0].save("assets/icon.ico", format="ICO", sizes=ico_sizes, append_images=ico_images[1:])
print("ICO saved: assets/icon.ico")

# Step 3: Create ICNS (macOS) - just use PNG as icns doesn't need special format for Electron
img.save("assets/icon.icns", format="ICNS")
print("ICNS saved: assets/icon.icns")

print("All icon formats generated!")
