"""Harder synthetic page for the fix suggestions: a smudged word, a smudged hour digit,
an abbreviation not in the master list (FLOT), and one very long entry. Not a real log."""
import random, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
random.seed(9)
lines = [
    ("13:00", "HD39 out of TMS hdg to LBW05"),
    ("13:07", "leak spoted LBW05 nr FLOT"),
    ("13:12", "HD39 replace hose on SMUDGEWORD"),
    ("1X:20", "air off LBW05"),
    ("13:25", "GVI LBW01 gd / LBW02 gd / LBW03 small leak top / LBW04 leak side / LBW05 leak @ valve / LBW06 gd / LBW07 leak blk plate"),
    ("13:40", "in TMS / rtn to deck"),
]
W, H = 2300, 900
img = Image.new("RGB", (W, H), (246, 243, 232)); d = ImageDraw.Draw(img)
font = ImageFont.truetype("C:/Windows/Fonts/Inkfree.ttf", 40)
y = 60
smudges = []
for t, txt in lines:
    d.line([(40, y + 55), (W - 40, y + 55)], fill=(170, 190, 215), width=2)
    tt = t.replace("X", "3"); d.text((50, y), tt, font=font, fill=(25, 35, 85))
    if "X" in t: smudges.append((50 + 18, y + 2, 50 + 42, y + 50))
    if "SMUDGEWORD" in txt:
        before = txt.replace(" SMUDGEWORD", "")
        d.text((230, y), before + " carousel", font=font, fill=(25, 35, 85))
        x0 = 230 + d.textlength(before + " ", font=font)
        smudges.append((x0 + 30, y + 4, x0 + d.textlength("carousel", font=font), y + 50))
    else:
        d.text((230, y), txt, font=font, fill=(25, 35, 85))
    y += 120
for (a, b, c, e) in smudges:   # ink smear over part of the word / digit
    region = img.crop((int(a), int(b), int(c), int(e))).filter(ImageFilter.GaussianBlur(7))
    img.paste(region, (int(a), int(b)))
    ImageDraw.Draw(img).rectangle([a, b + 14, c, e - 14], fill=(95, 100, 135))
out = os.path.join(os.path.dirname(__file__), "fixtures", "page2.jpg"); img.save(out, quality=85); print(out)
