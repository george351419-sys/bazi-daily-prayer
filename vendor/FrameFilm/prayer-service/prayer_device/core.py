"""Transactional device ownership, immutable assets and monotonic receipts."""
import hashlib
import hmac
import importlib.util
import io
import re
import secrets
import sqlite3
import struct
import time
from datetime import date
from functools import lru_cache
import warnings
from contextlib import contextmanager
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

PROFILE = 'pro-e6-792x528-v1'
SCREEN = dict(canvas_w=528, canvas_h=792, width=792, height=528, pixel_layout='row-major')
CONVERTER_VERSION = 'prayer-pro-contain-fs80-v1'
ARK_PROFILE = 'ark-e6-720x480-v1'
PROFILES = {PROFILE: SCREEN, ARK_PROFILE: dict(canvas_w=480, canvas_h=720, width=720, height=480, pixel_layout='row-major')}

def profile_screen(profile):
    if profile not in PROFILES:
        raise ServiceError(400, '屏幕配置无效。')
    return PROFILES[profile]

def converter_version(profile):
    return CONVERTER_VERSION if profile == PROFILE else 'prayer-ark-contain-fs80-v1'

MAX_IMAGE_BYTES = 12 * 1024 * 1024
STAGES = ('downloaded', 'stored', 'displayed')
ID = re.compile(r'^[a-zA-Z0-9_-]{8,64}$')
OWNER = re.compile(r'^[a-f0-9]{32}$')
ARTWORK = re.compile(r'^[a-f0-9]{36}$')
HEX32 = re.compile(r'^[a-f0-9]{32}$')
SHA256 = re.compile(r'^[a-f0-9]{64}$')


class ServiceError(Exception):
    def __init__(self, status, message, code=None):
        super().__init__(message)
        self.status = status
        self.code = code


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def validate(value, pattern, label):
    if not isinstance(value, str) or not pattern.fullmatch(value):
        raise ServiceError(400, f'{label}无效。')
    return value


@lru_cache(maxsize=1)
def _encoder():
    module_path = Path(__file__).resolve().parents[2] / 'server/backend/app/services/film_convert.py'
    spec = importlib.util.spec_from_file_location('prayer_film_encoder', module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def convert_image_bytes(raw, profile=PROFILE):
    """Contain portrait composition; reuse the repository's device encoder."""
    screen = profile_screen(profile)
    cw, ch = screen['canvas_w'], screen['canvas_h']
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ServiceError(400, '图片大小无效。')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in ('PNG', 'JPEG', 'WEBP') or source.width * source.height > 16_000_000:
                    raise ServiceError(400, '图片格式或尺寸不支持。')
                source.seek(0)
                source = ImageOps.exif_transpose(source)
                rgba = source.convert('RGBA')
                opaque = Image.new('RGBA', rgba.size, 'white')
                opaque.alpha_composite(rgba)
                fitted = ImageOps.contain(opaque.convert('RGB'), (cw, ch), Image.Resampling.LANCZOS)
                canvas = Image.new('RGB', (cw, ch), 'white')
                canvas.paste(fitted, ((cw-fitted.width)//2, (ch-fitted.height)//2))
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as exc:
        raise ServiceError(400, '图片无法解码。') from exc
    film, preview = _encoder().convert_for_device(canvas, 'pro',
        {'dither_type': 'floyd_steinberg', 'dither_strength': 80}, screen_profile=screen)
    validate_film(film, profile)
    return film, preview


def validate_film(data, profile=PROFILE):
    screen = profile_screen(profile)
    width, height = screen['width'], screen['height']
    pixels = width * height // 2
    if len(data) != pixels + 32:
        raise ServiceError(400, '屏幕文件长度错误。')
    size, width, height = struct.unpack_from('<IHH', data)
    if (size, width, height, data[8], data[9]) != (pixels, screen['width'], screen['height'], 6, 0):
        raise ServiceError(400, '屏幕文件格式错误。')
    if struct.unpack_from('<H', data, 10)[0] not in (0, 1) or data[16:32] != bytes([0x00, 0xff, 0xfc, 0xe0, 0x03, 0x1c] + [0]*10):
        raise ServiceError(400, '屏幕文件帧数或色表错误。')
    if any((b >> 4) > 5 or (b & 15) > 5 for b in data[32:]):
        raise ServiceError(400, '屏幕文件像素错误。')


class Store:
    def __init__(self, filename):
        self.filename = str(filename)
        Path(filename).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.db() as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
                claim_hash TEXT NOT NULL, owner TEXT, name TEXT NOT NULL,
                revoked INTEGER NOT NULL DEFAULT 0, last_sync INTEGER,
                created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id),
                revision INTEGER NOT NULL, artwork_id TEXT NOT NULL, content_date TEXT NOT NULL,
                source_hash TEXT NOT NULL, converter TEXT NOT NULL, sha256 TEXT NOT NULL,
                film BLOB NOT NULL, preview BLOB NOT NULL, created INTEGER NOT NULL,
                UNIQUE(device_id, revision));
            CREATE TABLE IF NOT EXISTS receipts (
                asset_id TEXT NOT NULL REFERENCES assets(id), stage TEXT NOT NULL,
                created INTEGER NOT NULL, PRIMARY KEY(asset_id,stage));
            CREATE TABLE IF NOT EXISTS selections (
                device_id TEXT NOT NULL REFERENCES devices(id), request_id TEXT NOT NULL,
                fingerprint TEXT NOT NULL, revision INTEGER NOT NULL, reused INTEGER NOT NULL,
                PRIMARY KEY(device_id,request_id));
            CREATE TABLE IF NOT EXISTS ark_reports (
                device_id TEXT PRIMARY KEY REFERENCES devices(id), asset_id TEXT NOT NULL,
                stored_at INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS device_owner ON devices(owner);
            CREATE INDEX IF NOT EXISTS asset_device ON assets(device_id,revision DESC);
            ''')
            # Additive migration keeps existing owners and credentials intact.
            columns = {r['name'] for r in db.execute('PRAGMA table_info(devices)')}
            if 'kind' not in columns:
                db.execute("ALTER TABLE devices ADD COLUMN kind TEXT NOT NULL DEFAULT 'simulator'")
            if 'panel_profile' not in columns:
                db.execute("ALTER TABLE devices ADD COLUMN panel_profile TEXT NOT NULL DEFAULT 'pro-e6-792x528-v1'")
        Path(filename).chmod(0o600)
        from .automation import Automation
        self.automation = Automation(self)

    @contextmanager
    def db(self, write=False):
        db = sqlite3.connect(self.filename, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            if write:
                db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def provision(self, device_id=None, *, profile=PROFILE, kind='simulator'):
        profile_screen(profile)
        if kind not in ('simulator', 'ark') or (kind == 'ark' and profile != ARK_PROFILE):
            raise ServiceError(400, '设备类型与屏幕不匹配。')
        device_id = device_id or 'prayer-' + secrets.token_hex(8)
        validate(device_id, ID, '设备标识')
        token, code = secrets.token_hex(32), secrets.token_hex(16)
        try:
            with self.db(write=True) as db:
                db.execute('INSERT INTO devices(id,token_hash,claim_hash,name,created,panel_profile,kind) VALUES(?,?,?,?,?,?,?)',
                    (device_id, digest(token), digest(code), device_id, int(time.time()), profile, kind))
        except sqlite3.IntegrityError as exc:
            raise ServiceError(409, '设备标识已存在；不会覆盖旧设备。') from exc
        return dict(deviceId=device_id, token=token, claimCode=code, panelProfile=profile, kind=kind)

    @staticmethod
    def owned(db, owner, device_id):
        validate(owner, OWNER, '账户')
        validate(device_id, ID, '设备标识')
        row = db.execute('SELECT * FROM devices WHERE id=? AND owner=? AND revoked=0', (device_id, owner)).fetchone()
        if row is None:
            raise ServiceError(404, '找不到这台设备。')
        return row

    def claim(self, owner, device_id, code, name):
        validate(owner, OWNER, '账户')
        validate(device_id, ID, '设备标识')
        if not isinstance(code, str) or not re.fullmatch('[a-f0-9]{32}', code):
            raise ServiceError(400, '绑定码格式错误。')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40:
            raise ServiceError(400, '设备名称请使用1至40个字符。')
        with self.db(write=True) as db:
            row = db.execute('SELECT * FROM devices WHERE id=?', (device_id,)).fetchone()
            if row is None or row['revoked'] or not hmac.compare_digest(row['claim_hash'], digest(code)):
                raise ServiceError(403, '设备绑定码无效。')
            if row['owner'] and row['owner'] != owner:
                raise ServiceError(409, '设备已经绑定。')
            db.execute('UPDATE devices SET owner=?,name=? WHERE id=?', (owner, name.strip(), device_id))
        return dict(ok=True)

    def devices(self, owner):
        validate(owner, OWNER, '账户')
        with self.db() as db:
            result = []
            for row in db.execute('SELECT * FROM devices WHERE owner=? AND revoked=0 ORDER BY created,id', (owner,)):
                asset = db.execute('SELECT id,revision,artwork_id,content_date FROM assets WHERE device_id=? ORDER BY revision DESC LIMIT 1', (row['id'],)).fetchone()
                displayed = db.execute('''SELECT a.revision,a.artwork_id,a.content_date,r.created
                    FROM assets a JOIN receipts r ON r.asset_id=a.id AND r.stage='displayed'
                    WHERE a.device_id=? ORDER BY a.revision DESC LIMIT 1''', (row['id'],)).fetchone()
                stages = [r['stage'] for r in db.execute('SELECT stage FROM receipts WHERE asset_id=?', (asset['id'],))] if asset else []
                stage = next((s for s in reversed(STAGES) if s in stages), 'pending') if asset else 'empty'
                report = db.execute('SELECT asset_id,stored_at FROM ark_reports WHERE device_id=?', (row['id'],)).fetchone()
                if row['kind'] == 'ark' and asset and report and report['asset_id'] == asset['id']:
                    stage = 'stored'
                result.append(dict(id=row['id'], name=row['name'], panelProfile=row['panel_profile'], kind=row['kind'],
                    lastSyncAt=row['last_sync'], desiredRevision=asset['revision'] if asset else 0,
                    artworkId=asset['artwork_id'] if asset else None,
                    contentDate=asset['content_date'] if asset else None, stage=stage,
                    confirmedDisplay=dict(revision=displayed['revision'], artworkId=displayed['artwork_id'],
                        contentDate=displayed['content_date'], confirmedAt=displayed['created']) if displayed else None))
        return dict(items=result)

    def unbind(self, owner, device_id):
        with self.db(write=True) as db:
            self.owned(db, owner, device_id)
            db.execute('UPDATE devices SET owner=NULL,revoked=1,claim_hash=? WHERE id=?', ('', device_id))
            # Retire instead of reusing credentials. Physical reset/reprovisioning is a later hardware operation.
            db.execute('DELETE FROM ark_reports WHERE device_id=?', (device_id,))
            db.execute('DELETE FROM receipts WHERE asset_id IN (SELECT id FROM assets WHERE device_id=?)', (device_id,))
            db.execute('DELETE FROM assets WHERE device_id=?', (device_id,))
            db.execute('DELETE FROM selections WHERE device_id=?', (device_id,))
            if not db.execute('SELECT 1 FROM devices WHERE owner=? AND revoked=0', (owner,)).fetchone():
                self.automation.fixed(db, owner)
        return dict(ok=True, state='revoked')

    def select(self, owner, device_id, artwork_id, content_date, image, *, expected_revision, request_id, automation=None):
        validate(artwork_id, ARTWORK, '作品')
        validate(request_id, HEX32, '请求标识')
        if type(expected_revision) is not int or expected_revision < 0:
            raise ServiceError(400, '预期设备版本无效。')
        if not isinstance(content_date, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', content_date):
            raise ServiceError(400, '画作日期无效。')
        try:
            date.fromisoformat(content_date)
        except ValueError as exc:
            raise ServiceError(400, '画作日期无效。') from exc
        source_hash = hashlib.sha256(image).hexdigest()
        with self.db() as db:
            profile = self.owned(db, owner, device_id)['panel_profile']
        converter = converter_version(profile)
        fingerprint = digest('|'.join((artwork_id, content_date, source_hash, converter)))
        def previous_request(db):
            previous = db.execute('SELECT * FROM selections WHERE device_id=? AND request_id=?', (device_id, request_id)).fetchone()
            if previous:
                if previous['fingerprint'] != fingerprint:
                    raise ServiceError(409, '请求标识已用于另一幅画。', 'request_conflict')
                return dict(ok=True, revision=previous['revision'], reused=bool(previous['reused']), replayed=True)
        def check_revision(db):
            last = db.execute('SELECT revision FROM assets WHERE device_id=? ORDER BY revision DESC LIMIT 1', (device_id,)).fetchone()
            if (last['revision'] if last else 0) != expected_revision:
                raise ServiceError(409, '设备画面已变化，请刷新后重新选择。', 'revision_conflict')
        with self.db() as db:
            self.owned(db, owner, device_id)
            if automation is not None:
                self.automation.guard_publish(db, owner, device_id, automation)
            previous = previous_request(db)
            if previous:
                return previous
            check_revision(db)
            cached = db.execute('SELECT * FROM assets WHERE device_id=? AND artwork_id=? AND source_hash=? AND converter=? ORDER BY revision DESC LIMIT 1',
                (device_id, artwork_id, source_hash, converter)).fetchone()
        film, preview = (cached['film'], cached['preview']) if cached else (convert_image_bytes(image) if profile == PROFILE else convert_image_bytes(image, profile))
        with self.db(write=True) as db:
            self.owned(db, owner, device_id)  # Ownership may have changed during conversion.
            if automation is not None:
                self.automation.guard_publish(db, owner, device_id, automation)
            previous = previous_request(db)
            if previous:
                return previous
            check_revision(db)
            last = db.execute('SELECT * FROM assets WHERE device_id=? ORDER BY revision DESC LIMIT 1', (device_id,)).fetchone()
            if automation is None:
                self.automation.fixed(db, owner)
            if last and last['artwork_id'] == artwork_id and last['source_hash'] == source_hash and last['converter'] == converter:
                db.execute('INSERT INTO selections VALUES(?,?,?,?,?)', (device_id, request_id, fingerprint, last['revision'], 1))
                return dict(ok=True, revision=last['revision'], reused=True)
            revision = last['revision'] + 1 if last else 1
            db.execute('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                (secrets.token_hex(16), device_id, revision, artwork_id, content_date, source_hash,
                 converter, hashlib.sha256(film).hexdigest(), film, preview, int(time.time())))
            db.execute('INSERT INTO selections VALUES(?,?,?,?,?)', (device_id, request_id, fingerprint, revision, 0))
        return dict(ok=True, revision=revision, reused=False)

    def preview(self, owner, device_id, revision):
        if type(revision) is not int or revision < 1:
            raise ServiceError(400, '预览版本无效。')
        with self.db() as db:
            self.owned(db, owner, device_id)
            row = db.execute('SELECT preview FROM assets WHERE device_id=? AND revision=?', (device_id, revision)).fetchone()
            if row is None:
                raise ServiceError(404, '找不到此版本的预览。')
            return row['preview']

    @staticmethod
    def authenticate(db, token):
        if not isinstance(token, str) or not re.fullmatch('[a-f0-9]{64}', token):
            raise ServiceError(401, '设备凭据无效。')
        row = db.execute('SELECT * FROM devices WHERE token_hash=? AND revoked=0 AND owner IS NOT NULL', (digest(token),)).fetchone()
        if row is None:
            raise ServiceError(401, '设备未绑定或凭据已撤销。')
        return row

    def sync(self, token, body):
        if type(body.get('protocolVersion')) is not int or body.get('protocolVersion') != 2:
            raise ServiceError(409, '设备协议或屏幕不匹配。')
        reported = body.get('reportedRevision', 0)
        if type(reported) is not int or reported < 0:
            raise ServiceError(400, '设备版本无效。')
        reported_hash = body.get('reportedSha256', '')
        if not isinstance(reported_hash, str) or not (SHA256.fullmatch(reported_hash) or reported_hash == ''):
            raise ServiceError(400, '设备文件校验值无效。')
        now = int(time.time())
        with self.db(write=True) as db:
            device = self.authenticate(db, token)
            if body.get('panelProfile') != device['panel_profile']:
                raise ServiceError(409, '设备协议或屏幕不匹配。')
            db.execute('UPDATE devices SET last_sync=? WHERE id=?', (now, device['id']))
            asset = db.execute('SELECT id,revision,artwork_id,content_date,sha256,length(film) AS byte_length FROM assets WHERE device_id=? ORDER BY revision DESC LIMIT 1', (device['id'],)).fetchone()
            if reported > (asset['revision'] if asset else 0):
                raise ServiceError(409, '服务端版本落后，停止自动降级。', 'server_version_behind')
            acknowledged = db.execute('''SELECT r.stage FROM receipts r JOIN assets a ON a.id=r.asset_id
                WHERE a.device_id=? AND a.revision=? AND a.sha256=?''', (device['id'], reported, reported_hash)).fetchall()
            receipt_stage = next((stage for stage in reversed(STAGES) if stage in {r['stage'] for r in acknowledged}), None)
            manifest = None
            if asset and (reported != asset['revision'] or body.get('reportedSha256') != asset['sha256']):
                manifest = dict(desiredRevision=asset['revision'], assetId=asset['id'], artworkId=asset['artwork_id'],
                    contentDate=asset['content_date'], panelProfile=device['panel_profile'], filmFormat=0,
                    byteLength=asset['byte_length'], sha256=asset['sha256'],
                    downloadPath='/api/device/v2/assets/' + asset['id'])
            return dict(protocolVersion=2, kind=device['kind'], serverTime=now, nextSyncAt=now+3600,
                acknowledgedStage=receipt_stage, manifest=manifest)

    def asset(self, token, asset_id):
        validate(asset_id, HEX32, '文件标识')
        with self.db() as db:
            device = self.authenticate(db, token)
            row = db.execute('SELECT * FROM assets WHERE id=? AND device_id=?', (asset_id, device['id'])).fetchone()
            if row is None:
                raise ServiceError(404, '找不到此设备的文件。')
            return row['film']

    def ark_stored(self, token, sha):
        """Hardware saved-file evidence only; never creates a displayed receipt."""
        validate(sha, SHA256, '文件校验值')
        with self.db(write=True) as db:
            device = self.authenticate(db, token)
            if device['kind'] != 'ark':
                raise ServiceError(403, 'Ark report required')
            asset = db.execute('SELECT id,sha256 FROM assets WHERE device_id=? ORDER BY revision DESC LIMIT 1', (device['id'],)).fetchone()
            if not asset or asset['sha256'] != sha:
                raise ServiceError(409, '文件与当前目标不匹配。')
            db.execute('INSERT INTO ark_reports VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET asset_id=excluded.asset_id,stored_at=excluded.stored_at',
                (device['id'], asset['id'], int(time.time())))

    def ack(self, token, body):
        validate(body.get('assetId'), HEX32, '文件标识')
        validate(body.get('sha256'), SHA256, '文件校验值')
        stage = body.get('stage')
        if type(body.get('revision')) is not int or stage not in STAGES:
            raise ServiceError(400, '回执阶段无效。')
        with self.db(write=True) as db:
            device = self.authenticate(db, token)
            if device['kind'] != 'simulator' or body.get('evidence') != 'simulator':
                raise ServiceError(409, '开发设备必须明确标记模拟回执。')
            asset = db.execute('SELECT * FROM assets WHERE id=? AND device_id=?', (body.get('assetId'), device['id'])).fetchone()
            if asset is None or asset['revision'] != body.get('revision') or asset['sha256'] != body.get('sha256'):
                raise ServiceError(409, '回执与文件不匹配。')
            index = STAGES.index(stage)
            if index and not db.execute('SELECT 1 FROM receipts WHERE asset_id=? AND stage=?', (asset['id'], STAGES[index-1])).fetchone():
                raise ServiceError(409, '请按下载、保存、显示顺序回执。')
            db.execute('INSERT OR IGNORE INTO receipts VALUES(?,?,?)', (asset['id'], stage, int(time.time())))
        return dict(ok=True)
