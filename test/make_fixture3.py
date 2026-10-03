"""Synthetic mattress-lay page in rushed shorthand (IDs left off later steps, one mattress
missing its 'released' line). Not a real log."""
import random, os
from PIL import Image, ImageDraw, ImageFont
random.seed(3)
lines = [
    ("00:07", "in posn begin F21"),
    ("00:24", "landed GL to release"),
    ("00:27", "released"),
    ("00:37", "SOZ"),
    ("01:00", "crane off deck mat F22"),
    ("01:05", "visual / rigging ok"),
    ("01:15", "in posn"),
    ("01:30", "F22 landed GL"),
    ("01:53", "SOZ for recovery"),
    ("02:30", "crane off deck B4"),
    ("02:33", "mat visual rig chk ok"),
    ("02:50", "in posn begin B4"),
    ("03:00", "landed GL"),
    ("03:07", "rel"),
    ("03:15", "SOZ"),
]
W, H = 1400, 1750
img = Image.new("RGB", (W, H), (246, 243, 232)); d = ImageDraw.Draw(img)
font = ImageFont.truetype("C:/Windows/Fonts/Inkfree.ttf", 44)
y = 60
for t, txt in lines:
    j = lambda: random.randint(-3, 3)
    d.line([(40, y + 60), (W - 40, y + 60)], fill=(170, 190, 215), width=2)
    d.text((60 + j(), y + j()), t, font=font, fill=(25, 35, 85))
    d.text((250 + j(), y + j()), txt, font=font, fill=(25, 35, 85))
    y += 108
out = os.path.join(os.path.dirname(__file__), "fixtures", "page3.jpg"); img.save(out, quality=85); print(out)
