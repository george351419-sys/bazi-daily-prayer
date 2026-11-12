"""Private, content-addressed cache for device-ready photo frames."""
import hashlib
import os
import tempfile
from pathlib import Path

# Bump whenever resize, alpha composition, rotation, palette or dithering changes.
FRAME_RECIPE = 'ark-photo-source-only-v3-480x720-exif-lanczos-rotate180-floyd80'
FRAME_BYTES = 172832

def center_photo_frame(original, *, photo=True):
    """Photo adaptation samples only the source: no padding or generated background."""
    from PIL import Image, ImageOps
    image = ImageOps.exif_transpose(original)
    if photo:
        if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
            alpha = image.convert('RGBA').getchannel('A')
            if alpha.getextrema()[0] < 255:
                raise ValueError('Transparent photo requires an explicit background; no fill was generated')
        source = image.convert('RGB')
    else:
        # Preserve the existing non-photo compiler path.
        rgba = image.convert('RGBA')
        source = Image.new('RGBA', rgba.size, 'white')
        source.alpha_composite(rgba)
        source = source.convert('RGB')
    return ImageOps.fit(source, (480, 720), method=Image.Resampling.LANCZOS,
                        centering=(0.5, 0.5))

def encoder_fingerprint(root):
    digest = hashlib.sha256(FRAME_RECIPE.encode())
    from PIL import __version__
    digest.update(__version__.encode())
    for source in sorted((Path(root) / 'prayer_device').rglob('*.py')):
        digest.update(str(source.relative_to(root)).encode())
        digest.update(source.read_bytes())
    converter = Path(root).parent / 'server/backend/app/services/film_convert.py'
    digest.update(converter.read_bytes())
    return digest.hexdigest()

def cached_frame(source, cache_dir, fingerprint, convert):
    raw = Path(source).read_bytes()
    key = hashlib.sha256(fingerprint.encode() + b'\0' + raw).hexdigest()
    target = Path(cache_dir) / (key + '.film') if cache_dir else None
    if target:
        try:
            stored = target.read_bytes()
            frame = stored[32:]
            if len(frame) == FRAME_BYTES and hashlib.sha256(frame).digest() == stored[:32]:
                return frame, True
        except OSError:
            pass
    frame = convert(source)
    if len(frame) != FRAME_BYTES:
        raise ValueError('Invalid converted frame length')
    if target:
        # Cache failures must not stop content delivery. Files contain private images.
        try:
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            fd, temp = tempfile.mkstemp(prefix='.frame-', dir=target.parent)
            try:
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(hashlib.sha256(frame).digest() + frame)
                os.replace(temp, target)
            finally:
                if os.path.exists(temp):
                    os.unlink(temp)
        except OSError:
            pass
    return frame, False
