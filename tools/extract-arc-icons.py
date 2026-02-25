#!/usr/bin/env python3
"""
Extract individual icons from the Arc Browser icon picker screenshot.

Usage:
  python3 tools/extract-arc-icons.py

Input:  docs/features/029-arc-icon-picker.jpg
Output: docs/features/arc-icons/<name>.png (one per icon)
"""

import os
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
INPUT_PATH = os.path.join(PROJECT_DIR, "docs", "features", "029-arc-icon-picker.jpg")
OUTPUT_DIR = os.path.join(PROJECT_DIR, "docs", "features", "arc-icons")

# Grid layout: 8 columns x 8 rows
# Measured from the 560x540 screenshot
COL_CENTERS = [67, 129, 191, 253, 315, 377, 439, 501]
ROW_CENTERS = [115, 183, 248, 310, 370, 433, 495]

# Each icon cell is roughly 50x50; crop a 44x44 box centered on each
ICON_SIZE = 44
HALF = ICON_SIZE // 2

# Icon names per row, matching the Arc icon picker grid.
# Names are Arc's internal identifiers.
GRID = [
    # Row 1
    ["star", "bookmark", "heart", "flag", "flash", "triangle", "medical", "notifications"],
    # Row 2
    ["bulb", "shapes", "grid", "apps", "layers", "albums", "fileTrayFull", "mail"],
    # Row 3
    ["folder", "briefcase", "calendar", "envelope", "checkbox", "file", "book", "chatBubbleEllipses"],
    # Row 4
    ["people", "terminal", "construction", "square", "ellipse", "circle", "moon", "sunny"],
    # Row 5
    ["planet", "leaf", "cloud", "paw", "bag", "gift", "bed", "restaurant"],
    # Row 6
    ["barbell", "airplane", "musicalNote", "colorPallete", "video", "bandage", "code", "baseball"],
    # Row 7
    ["cloudOutline", "controller", "bonfire", "pizza", "skull", "receipt", "thumbsUp", "train"],
]


def extract_icons():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    img = Image.open(INPUT_PATH)

    count = 0
    for row_idx, row_names in enumerate(GRID):
        if row_idx >= len(ROW_CENTERS):
            break
        cy = ROW_CENTERS[row_idx]

        for col_idx, name in enumerate(row_names):
            if name is None or col_idx >= len(COL_CENTERS):
                continue
            cx = COL_CENTERS[col_idx]

            # Crop the icon
            left = cx - HALF
            top = cy - HALF
            right = cx + HALF
            bottom = cy + HALF

            icon = img.crop((left, top, right, bottom))
            out_path = os.path.join(OUTPUT_DIR, f"{name}.png")
            icon.save(out_path)
            count += 1
            print(f"  {name}.png ({left},{top})-({right},{bottom})")

    print(f"\nExtracted {count} icons to {OUTPUT_DIR}")


if __name__ == "__main__":
    extract_icons()
