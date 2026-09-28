#!/usr/bin/env python3
"""Prepare source-matched Khua layers for the editable Icon Composer file.

The source logo is a flattened RGB PNG. This script preserves every visible
background pixel outside the cyan mark, smoothly inpaints only the background
hidden by the mark, and separates the three connected mark components.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, PngImagePlugin


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "KhuaPlayer-StaticMaster-1024.png"
ICON_ASSETS = ROOT / "KhuaPlayer.icon" / "Assets"
SIZE = 1024


def smoothstep(low: float, high: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - low) / (high - low), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def connected_components(mask: np.ndarray) -> list[np.ndarray]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    components: list[np.ndarray] = []

    for start_y, start_x in zip(*np.where(mask & ~visited)):
        if visited[start_y, start_x]:
            continue

        queue: deque[tuple[int, int]] = deque([(int(start_y), int(start_x))])
        visited[start_y, start_x] = True
        points: list[tuple[int, int]] = []

        while queue:
            y, x = queue.popleft()
            points.append((y, x))
            for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if (
                    0 <= next_y < height
                    and 0 <= next_x < width
                    and mask[next_y, next_x]
                    and not visited[next_y, next_x]
                ):
                    visited[next_y, next_x] = True
                    queue.append((next_y, next_x))

        if len(points) < 64:
            continue

        component = np.zeros_like(mask, dtype=np.uint8)
        ys, xs = zip(*points)
        component[np.asarray(ys), np.asarray(xs)] = 255
        components.append(component)

    return sorted(components, key=lambda item: int(np.count_nonzero(item)), reverse=True)


def component_center_y(component: np.ndarray) -> float:
    ys, _ = np.where(component > 0)
    return float(np.mean(ys))


def extract_mark_layers(source: np.ndarray) -> tuple[Image.Image, Image.Image, Image.Image]:
    red = source[:, :, 0].astype(np.float32)
    green = source[:, :, 1].astype(np.float32)
    blue = source[:, :, 2].astype(np.float32)

    seed = (green > 48.0) & ((green - red) > 30.0) & (blue > 85.0)
    components = connected_components(seed)[:3]
    if len(components) != 3:
        raise RuntimeError(f"Expected three Khua mark components, found {len(components)}")

    components.sort(key=component_center_y)
    top, triangle, bottom = components

    # Recover the anti-aliased boundary without admitting the dark-blue plate.
    cyan_alpha = np.minimum.reduce(
        (
            smoothstep(28.0, 62.0, green),
            smoothstep(14.0, 38.0, green - red),
            smoothstep(52.0, 92.0, blue),
        )
    )

    def expanded_alpha(component: np.ndarray) -> np.ndarray:
        neighborhood = Image.fromarray(component, mode="L").filter(ImageFilter.MaxFilter(13))
        neighborhood_array = np.asarray(neighborhood, dtype=np.float32) / 255.0
        return np.clip(cyan_alpha * neighborhood_array, 0.0, 1.0)

    top_alpha = expanded_alpha(top)
    triangle_alpha = expanded_alpha(triangle)
    bottom_alpha = expanded_alpha(bottom)
    ribbons_alpha = np.maximum(top_alpha, bottom_alpha)
    full_alpha = np.maximum(ribbons_alpha, triangle_alpha)

    def rgba(alpha: np.ndarray) -> Image.Image:
        pixels = np.dstack((source, np.rint(alpha * 255.0).astype(np.uint8)))
        return Image.fromarray(pixels, mode="RGBA")

    return rgba(ribbons_alpha), rgba(triangle_alpha), Image.fromarray(
        np.rint(full_alpha * 255.0).astype(np.uint8),
        mode="L",
    )


def axis_background_estimate(source: np.ndarray, known_mask: np.ndarray) -> np.ndarray:
    """Interpolate hidden RGB from horizontal and vertical background constraints."""

    height, width = known_mask.shape
    x_coordinates = np.arange(width, dtype=np.float32)
    y_coordinates = np.arange(height, dtype=np.float32)
    horizontal = np.empty_like(source, dtype=np.float32)
    vertical = np.empty_like(source, dtype=np.float32)

    for channel in range(3):
        for y in range(height):
            known_x = np.flatnonzero(known_mask[y])
            horizontal[y, :, channel] = np.interp(
                x_coordinates,
                known_x,
                source[y, known_x, channel],
            )
        for x in range(width):
            known_y = np.flatnonzero(known_mask[:, x])
            vertical[:, x, channel] = np.interp(
                y_coordinates,
                known_y,
                source[known_y, x, channel],
            )

    estimate = (horizontal + vertical) * 0.5
    smoothed = np.empty_like(estimate)
    for channel in range(3):
        smoothed[:, :, channel] = np.asarray(
            Image.fromarray(
                np.rint(np.clip(estimate[:, :, channel], 0.0, 255.0)).astype(np.uint8),
                mode="L",
            ).filter(ImageFilter.GaussianBlur(5.0)),
            dtype=np.float32,
        )

    return smoothed


def make_background(source: np.ndarray, mark_alpha: Image.Image) -> Image.Image:
    """Keep the source background intact and inpaint only mark-covered pixels."""

    alpha_u8 = np.asarray(mark_alpha, dtype=np.uint8)
    mark_coverage = alpha_u8 > 0
    covered = np.asarray(
        Image.fromarray(np.where(mark_coverage, 255, 0).astype(np.uint8), mode="L").filter(
            ImageFilter.MaxFilter(5)
        ),
        dtype=np.uint8,
    ) > 0

    # Exclude a narrow fringe from the estimator so cyan anti-aliasing cannot
    # contaminate the recovered navy background. The output itself still changes
    # only pixels covered by the extracted mark.
    contaminated = np.asarray(
        Image.fromarray(np.where(covered, 255, 0).astype(np.uint8), mode="L").filter(
            ImageFilter.MaxFilter(17)
        ),
        dtype=np.uint8,
    ) > 0
    known = ~contaminated

    inpaint = axis_background_estimate(source, known)

    background = source.astype(np.float32).copy()
    background[covered] = inpaint[covered]
    return Image.fromarray(np.rint(np.clip(background, 0.0, 255.0)).astype(np.uint8), mode="RGB")


def recover_layer_colors(
    source: np.ndarray,
    background: Image.Image,
    layer: Image.Image,
) -> Image.Image:
    """Unmix flattened edge colors so recompositing reproduces the source."""

    background_rgb = np.asarray(background, dtype=np.float32)
    composite_rgb = source.astype(np.float32)
    initial_alpha = np.asarray(layer, dtype=np.uint8)[:, :, 3].astype(np.float32) / 255.0
    active = np.asarray(
        Image.fromarray(np.where(initial_alpha > 0.0, 255, 0).astype(np.uint8), mode="L").filter(
            ImageFilter.MaxFilter(5)
        ),
        dtype=np.uint8,
    ) > 0

    # Raise alpha only when needed to represent a source/background delta without
    # clipping the recovered foreground outside 0...255.
    required = np.zeros_like(initial_alpha)
    for channel in range(3):
        source_channel = composite_rgb[:, :, channel]
        background_channel = background_rgb[:, :, channel]
        brighter = source_channel >= background_channel
        up_denominator = np.maximum(255.0 - background_channel, 1.0)
        down_denominator = np.maximum(background_channel, 1.0)
        channel_required = np.where(
            brighter,
            (source_channel - background_channel) / up_denominator,
            (background_channel - source_channel) / down_denominator,
        )
        required = np.maximum(required, channel_required)

    alpha = np.where(active, np.maximum(initial_alpha, required), 0.0)
    alpha_u8 = np.rint(np.clip(alpha, 0.0, 1.0) * 255.0).astype(np.uint8)
    quantized_alpha = alpha_u8.astype(np.float32) / 255.0
    safe_alpha = np.maximum(quantized_alpha, 1.0 / 255.0)[:, :, None]
    foreground = background_rgb + (composite_rgb - background_rgb) / safe_alpha
    foreground = np.where((alpha_u8 > 0)[:, :, None], foreground, 0.0)

    rgba = np.dstack(
        (
            np.rint(np.clip(foreground, 0.0, 255.0)).astype(np.uint8),
            alpha_u8,
        )
    )
    return Image.fromarray(rgba, mode="RGBA")


def make_preview(
    background: Image.Image,
    ribbons: Image.Image,
    triangle: Image.Image,
) -> Image.Image:
    preview = background.convert("RGBA")
    preview = Image.alpha_composite(preview, ribbons)
    preview = Image.alpha_composite(preview, triangle)

    mask = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((10, 6, 1014, 1016), radius=214, fill=255)
    preview.putalpha(mask)
    return preview


def main() -> None:
    ICON_ASSETS.mkdir(parents=True, exist_ok=True)
    source_file = Image.open(SOURCE)
    icc_profile = source_file.info.get("icc_profile")
    srgb_intent = source_file.info.get("srgb")
    source_image = source_file.convert("RGB")
    if source_image.size != (SIZE, SIZE):
        raise RuntimeError(f"Expected {SIZE}x{SIZE}, found {source_image.size}")

    save_options: dict[str, object] = {"optimize": True}
    if icc_profile is not None:
        save_options["icc_profile"] = icc_profile
    elif srgb_intent is not None:
        pnginfo = PngImagePlugin.PngInfo()
        pnginfo.add(b"sRGB", bytes((int(srgb_intent),)))
        save_options["pnginfo"] = pnginfo

    source = np.asarray(source_image, dtype=np.uint8)
    raw_ribbons, raw_triangle, mark_alpha = extract_mark_layers(source)
    background = make_background(source, mark_alpha)
    ribbons = recover_layer_colors(source, background, raw_ribbons)
    triangle = recover_layer_colors(source, background, raw_triangle)

    layers = {
        "01-Background.png": background,
        "03-RearRibbons.png": ribbons,
        "04-PlayTriangle.png": triangle,
    }
    for filename, image in layers.items():
        image.save(ICON_ASSETS / filename, **save_options)

    preview = make_preview(background, ribbons, triangle)

    preview_rgb = np.asarray(preview.convert("RGB"), dtype=np.int16)
    source_rgb = source.astype(np.int16)
    rgb_mae = float(np.mean(np.abs(preview_rgb - source_rgb)))

    print(f"Synchronized Icon Composer document assets in {ICON_ASSETS}")
    print(f"Layer assembly RGB MAE versus source: {rgb_mae:.4f}")


if __name__ == "__main__":
    main()
