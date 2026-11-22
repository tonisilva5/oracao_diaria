#!/usr/bin/env python3
"""Gera os ícones da PWA Oração Diária (fundo azul-noite, cruz dourada, coroa de contas)."""
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent / "icons"   # a pasta icons/ ao lado deste ficheiro

TOP = (44, 62, 99)      # #2c3e63
BOT = (22, 35, 61)      # #16233d
GOLD = (216, 178, 94)   # #d8b25e
GOLD_SOFT = (198, 160, 84)

def gradient(size):
    img = Image.new("RGB", (size, size), BOT)
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        r = int(TOP[0] + (BOT[0] - TOP[0]) * t)
        g = int(TOP[1] + (BOT[1] - TOP[1]) * t)
        b = int(TOP[2] + (BOT[2] - TOP[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return img

def draw_icon(size, cross_scale=1.0, beads=True):
    S = size * 4  # supersample p/ suavizar
    img = gradient(S).convert("RGBA")
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S / 2

    # Coroa de contas do terço
    if beads:
        ring_r = S * 0.40
        n = 24
        bead_r = S * 0.016
        for i in range(n):
            ang = (i / n) * 2 * math.pi - math.pi / 2
            # conta maior a cada 10 (Pai-Nosso)
            big = (i % 10 == 0)
            br = bead_r * (1.9 if big else 1.0)
            bx = cx + ring_r * math.cos(ang)
            by = cy + ring_r * math.sin(ang)
            alpha = 235 if big else 150
            d.ellipse([bx - br, by - br, bx + br, by + br],
                      fill=(GOLD[0], GOLD[1], GOLD[2], alpha))

    # Cruz latina dourada
    cw = S * 0.052 * cross_scale          # meia-largura do braço
    v_top = cy - S * 0.26 * cross_scale
    v_bot = cy + S * 0.28 * cross_scale
    h_y = cy - S * 0.09 * cross_scale
    h_left = cx - S * 0.17 * cross_scale
    h_right = cx + S * 0.17 * cross_scale

    def bar(x0, y0, x1, y1):
        d.rounded_rectangle([x0, y0, x1, y1], radius=cw * 0.9, fill=GOLD)

    bar(cx - cw, v_top, cx + cw, v_bot)          # vertical
    bar(h_left, h_y - cw, h_right, h_y + cw)     # horizontal

    # brilho subtil no centro da cruz
    d.ellipse([cx - cw*1.5, h_y - cw*1.5, cx + cw*1.5, h_y + cw*1.5],
              fill=(GOLD_SOFT[0], GOLD_SOFT[1], GOLD_SOFT[2], 90))

    return img.resize((size, size), Image.LANCZOS).convert("RGB")

# ícones normais
draw_icon(192).save(f"{OUT}/icon-192.png")
draw_icon(512).save(f"{OUT}/icon-512.png")
# apple-touch (sem transparência; iOS arredonda os cantos)
draw_icon(180).save(f"{OUT}/apple-touch-icon.png")
# maskable: conteúdo dentro da zona segura (~80%)
draw_icon(512, cross_scale=0.78, beads=True).save(f"{OUT}/icon-512-maskable.png")
print("Ícones gerados:", OUT)
