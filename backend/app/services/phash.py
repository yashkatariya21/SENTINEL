"""Perceptual hashing for logos (B5 — optional, and deliberately timid).

A 64-bit difference hash (dhash): the image is reduced to a 9×8 greyscale grid and each
pixel is compared with the one to its right. It survives re-encoding, mild scaling and
small colour shifts, which is exactly what you want for "is this the same mark?" — and
it is exactly why a match is *not* proof.

Rules this module is built to respect:

* PNG only. JPEG artefacts move the low bits around, and a hash that changes with the
  encoder is not a measurement.
* A match is reported as **Possible**, never Confirmed. Two different marks can hash
  within a few bits of each other; only a person can say "that is our logo, and it is
  the old one".
* The distance is always reported, so a reviewer can see how close the call was.
"""
from __future__ import annotations

import io

from PIL import Image

# Bits of difference. Under 10 of 64 is "looks like the same mark at a glance"; the
# number is printed in the finding so nobody has to trust it blindly.
SIMILAR_DISTANCE = 10
HASH_SIZE = 8  # 8x8 comparisons -> 64 bits


def dhash(image: Image.Image, *, size: int = HASH_SIZE) -> str:
    """Hex string of the perceptual hash. Deterministic for the same pixels."""
    small = image.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    pixels = list(small.getdata())
    bits = 0
    index = 0
    for row in range(size):
        for col in range(size):
            left = pixels[row * (size + 1) + col]
            right = pixels[row * (size + 1) + col + 1]
            if left > right:
                bits |= 1 << index
            index += 1
    return f"{bits:016x}"


def phash_bytes(data: bytes) -> str | None:
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            return dhash(im)
    except Exception:
        return None


def hamming(hash_a: str, hash_b: str) -> int | None:
    """Number of differing bits, or None if either hash is not a 64-bit hex string."""
    try:
        return bin(int(hash_a, 16) ^ int(hash_b, 16)).count("1")
    except (TypeError, ValueError):
        return None


def similarity(hash_a: str, hash_b: str) -> dict | None:
    distance = hamming(hash_a, hash_b)
    if distance is None:
        return None
    return {
        "distance": distance,
        "bits": 64,
        "similar": distance <= SIMILAR_DISTANCE,
        "threshold": SIMILAR_DISTANCE,
    }


def best_match(image_hash: str, logos: list[dict]) -> dict | None:
    """Closest known logo, with its distance and status. Never asserts identity."""
    best = None
    for logo in logos or []:
        known = logo.get("phash")
        if not known:
            continue
        scored = similarity(image_hash, known)
        if scored is None:
            continue
        if best is None or scored["distance"] < best["distance"]:
            best = {**scored, "name": logo.get("name"), "version": logo.get("version"),
                    "status": logo.get("status"), "value": logo.get("value")}
    return best
