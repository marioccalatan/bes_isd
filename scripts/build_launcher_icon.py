"""Export the BES lightning mark as a multi-resolution Windows icon (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public"
SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def render(size):
    # Supersample each size separately to retain clean edges in small Windows UI.
    scale = size * 4 / 64
    image = Image.new("RGBA", (size * 4, size * 4))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(tuple(round(v * scale) for v in (2, 2, 62, 62)),
                           radius=round(12 * scale), fill="#085229")
    draw.polygon([(round(x * scale), round(y * scale)) for x, y in
                  ((34, 8), (16, 34), (28, 34), (24, 56), (48, 26), (34, 26))],
                 fill="#e5a92e")
    return image.resize((size, size), Image.Resampling.LANCZOS)


if __name__ == "__main__":
    render(512).save(OUTPUT / "bes-isd-icon.png")
    images = [render(size) for size in SIZES]
    images[-1].save(OUTPUT / "bes-isd.ico", format="ICO",
                    sizes=[(size, size) for size in SIZES], append_images=images[:-1])
    print(f"Created {OUTPUT / 'bes-isd.ico'} and PNG preview")
