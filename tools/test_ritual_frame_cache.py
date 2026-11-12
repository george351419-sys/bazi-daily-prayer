import os
import tempfile
import unittest
from pathlib import Path
from ritual_frame_cache import cached_frame, encoder_fingerprint, FRAME_BYTES, center_photo_frame

class FrameCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cache = self.root / 'cache'
        self.one = self.root / 'one.jpg'; self.one.write_bytes(b'photo-one')
        self.two = self.root / 'two.jpg'; self.two.write_bytes(b'photo-two')
        self.calls = []
    def convert(self, source):
        self.calls.append(Path(source).read_bytes())
        return bytes([len(self.calls)]) * FRAME_BYTES
    def frame(self, source, version='v1'):
        return cached_frame(source, self.cache, version, self.convert)
    def test_reorder_duplicate_upload_and_new_image(self):
        first, hit = self.frame(self.one); self.assertFalse(hit)
        duplicate = self.root / 'uploaded-again.jpg'; duplicate.write_bytes(self.one.read_bytes())
        self.assertEqual(self.frame(duplicate), (first, True))
        second, hit = self.frame(self.two); self.assertFalse(hit)
        self.assertEqual([self.frame(p)[0] for p in [self.two,self.one]], [second,first])
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(os.stat(next(self.cache.glob('*.film'))).st_mode & 0o777, 0o600)
    def test_changed_algorithm_or_corruption_reconverts(self):
        self.frame(self.one); self.frame(self.one, 'v2')
        self.assertEqual(len(self.calls), 2)
        for file in self.cache.glob('*.film'): file.write_bytes(b'corrupt')
        self.assertFalse(self.frame(self.one)[1]); self.assertEqual(len(self.calls), 3)
    def test_failure_is_not_cached_and_unwritable_cache_falls_back(self):
        with self.assertRaises(ValueError):
            cached_frame(self.one,self.cache,'v1',lambda _:b'invalid')
        self.assertFalse(self.cache.exists())
        self.cache.write_bytes(b'not-a-directory')
        self.assertFalse(self.frame(self.one)[1])
    def test_encoder_source_changes_invalidate_cache(self):
        root = self.root / 'prayer-service'; (root/'prayer_device').mkdir(parents=True)
        (root/'prayer_device/core.py').write_text('core')
        converter = root.parent/'server/backend/app/services/film_convert.py'
        converter.parent.mkdir(parents=True); converter.write_text('algorithm1')
        before=encoder_fingerprint(root); converter.write_text('algorithm2')
        self.assertNotEqual(before, encoder_fingerprint(root))

class CenterCropTests(unittest.TestCase):
    def test_wide_image_keeps_horizontal_middle(self):
        from PIL import Image, ImageDraw
        image=Image.new('RGB',(1440,720),'red')
        draw=ImageDraw.Draw(image);draw.rectangle((480,0,959,719),fill='green');draw.rectangle((960,0,1439,719),fill='blue')
        frame=center_photo_frame(image)
        self.assertEqual(frame.size,(480,720));self.assertEqual(frame.getpixel((240,360)),(0,128,0))
        self.assertEqual(frame.getpixel((20,360)),(0,128,0));self.assertEqual(frame.getpixel((459,360)),(0,128,0))
    def test_tall_image_keeps_vertical_middle(self):
        from PIL import Image, ImageDraw
        image=Image.new('RGB',(480,2160),'red')
        draw=ImageDraw.Draw(image);draw.rectangle((0,720,479,1439),fill='green');draw.rectangle((0,1440,479,2159),fill='blue')
        frame=center_photo_frame(image)
        self.assertEqual(frame.getpixel((240,20)),(0,128,0));self.assertEqual(frame.getpixel((240,699)),(0,128,0))
    def test_camera_orientation_is_applied_before_center_crop(self):
        from PIL import Image, ImageDraw
        image=Image.new('RGB',(480,2160),'red')
        ImageDraw.Draw(image).rectangle((0,720,479,1439),fill='green')
        image.getexif()[274]=6
        frame=center_photo_frame(image)
        self.assertEqual(frame.getpixel((240,360)),(0,128,0))
    def test_transparency_is_white_and_portrait_keeps_full_image(self):
        from PIL import Image
        image=Image.new('RGBA',(480,720),(255,0,0,0));image.putpixel((240,360),(255,0,0,255))
        with self.assertRaises(ValueError): center_photo_frame(image)
        frame=center_photo_frame(image,photo=False)
        self.assertEqual(frame.getpixel((0,0)),(255,255,255));self.assertEqual(frame.getpixel((240,360)),(255,0,0))

    def test_opaque_photo_has_no_added_top_or_border_fill(self):
        from PIL import Image
        image=Image.new('RGB',(480,720),(0,0,255))
        frame=center_photo_frame(image)
        self.assertEqual(frame.tobytes(),image.tobytes())

if __name__ == '__main__': unittest.main()
