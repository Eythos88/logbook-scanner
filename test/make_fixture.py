"""Render a fake handwritten log page (Ink Free font, slight jitter) for the live test.
Content mimics real shorthand + typos from HD39 DPR Sept 2026. Not a real log."""
import random, os
from PIL import Image, ImageDraw, ImageFont
random.seed(4)
lines = [
    ("12:10", "pre dive chks - all gd"),
    ("12:18", "Dive"),
    ("12:20", "HD309 TMS allstop @ 10m"),
    ("12:22", "out of TMS / seabird run"),
    ("12:29", "crane @ 15m"),
    ("12:40", "HD39 disconect crane fr carousel / crane clr to deck"),
    ("12:47", "VM"),
    ("12:50", "VM compl"),
    ("12:56", "air on LBW03 filling"),
    ("13:07", "leak spoted LBW03"),
    ("13:19", "air increasd to 40psi"),
    ("13:23", "LBW03 full / mov to LBW04"),
    ("13:28", "2 leaks side of LBW04 / LBW03 still leakin"),
    ("15:44", "in TMS / rtn to deck / AFI"),
    ("15:49", "Location"),
]
W, H = 1500, 1900
img = Image.new("RGB", (W, H), (246, 243, 232))
d = ImageDraw.Draw(img)
font = ImageFont.truetype("C:/Windows/Fonts/Inkfree.ttf", 46)
for y in range(150, H, 105):
    d.line([(60, y + 62), (W - 60, y + 62)], fill=(170, 190, 215), width=2)
d.line([(250, 120), (250, H - 40)], fill=(215, 140, 140), width=3)
d.text((80, 50), "HD39   16 Sept", font=font, fill=(30, 40, 90))
y = 150
for t, txt in lines:
    j = lambda: random.randint(-4, 4)
    d.text((80 + j(), y + j()), t, font=font, fill=(25, 35, 85))
    d.text((275 + j(), y + j()), txt, font=font, fill=(25, 35, 85))
    y += 105
img = img.rotate(1.2, expand=False, fillcolor=(246, 243, 232))
out = os.path.join(os.path.dirname(__file__), "fixtures", "page1.jpg")
img.save(out, quality=85)
print(out)
