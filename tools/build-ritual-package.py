#!/usr/bin/env python3
"""Offline compiler: two existing Ark Film files + exported account plan. No paid calls."""
import argparse, json, struct, hashlib, datetime
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageChops
MAGIC=b'RITUAL1\0'; FRAME=172832; STRIP=7680; ANSWER=4800
COLORS=[(0,0,0),(255,255,255),(255,255,0),(255,0,0),(0,0,255),(0,255,0)]
def text_bitmap(lines, size, font_path, action=False):
 im=Image.new('1',size,0);d=ImageDraw.Draw(im)
 y=8
 for text,px in lines:
  f=ImageFont.truetype(font_path,px)
  # Explicit wrapping preserves all copy, including conditions.
  line=''
  for ch in text:
   if d.textlength(line+ch,font=f)>size[0]-(96 if action else 40):
    d.text((48 if action else 20,y),line,font=f,fill=1);y+=px+6;line=''
   line+=ch
  d.text((48 if action else 20,y),line,font=f,fill=1);y+=px+10
 if y>size[1]+8:raise ValueError('Copy overflows: '+str(lines))
 return im.tobytes()
def portrait(film):
 if len(film)!=FRAME or struct.unpack_from('<IHH',film)!=(172800,720,480) or film[8:16]!=bytes([6,0,0,0,0,0,0,0]) or film[16:32]!=bytes([0,255,252,224,3,28]+[0]*10):raise ValueError('Only validated Ark v1 six-colour Film is supported')
 body=film[32:];im=Image.new('RGB',(480,720));pix=im.load()
 for x in range(480):
  for y in range(720):
   pos=x*720+719-y;b=body[pos//2];idx=(b>>4) if pos%2==0 else b&15
   if idx>5:raise ValueError('Invalid palette index')
   pix[x,y]=COLORS[idx]
 return im

def encode(im,header):
 # Nearest-neighbour reduction keeps existing six-colour pixels exact.
 body=bytearray(172800);pix=im.load()
 for x in range(480):
  for y in range(720):
   idx=COLORS.index(pix[x,y]);pos=x*720+719-y
   body[pos//2]|=idx<<(4 if pos%2==0 else 0)
 return header+body

def build(plan,films,answers,font):
 if plan['mode'] not in ('test','daily') or len(films)!=2:raise ValueError('Two days required')
 start=int(datetime.datetime.fromisoformat(plan['startsAt'].replace('Z','+00:00')).timestamp())
 if len(plan['days'])!=2 or any(len(d['actions'])!=8 for d in plan['days']):raise ValueError('16 actions required')
 photo=plan.get('contentMode','prayer')=='photo';show_actions=plan.get('showActions',True)
 variants=5 if plan.get('actionVariants')==5 else 1
 frames=[]
 for raw in films:
  if not show_actions:
   frames.append(raw);continue
  source=portrait(raw)
  im=ImageOps.fit(source,(480,720),method=Image.Resampling.NEAREST)
  frames.append(encode(im,raw[:32]))
 strips=[]
 for day in plan['days']:
  for variant in range(variants):
   for original in day['actions']:
    options=[original]+original.get('alternatives',[])
    if len(options)<variants:raise ValueError('Five action options required')
    a=options[variant]
    strips.append(text_bitmap([(a['branch']+'时 · '+a['title']+((' '+str(variant+1)+'/5') if variants==5 else ''),20),(a['text'],30)],(480,128),font,action=True))
 answer_bits=[text_bitmap([(a['id']+' · 答案之书',18),(a['text'],32)],(480,80),font) for a in answers]
 offset1=64;offset2=offset1+2*FRAME;offset3=offset2+16*variants*STRIP;length=offset3+len(answers)*ANSWER
 header=struct.pack('<8s8I24x',MAGIC,length,start,int(plan['mode']=='test'),len(answers),offset1,offset2,offset3,3 if variants==5 else (2 if photo or not show_actions else 1))
 header=bytearray(header);struct.pack_into('<I',header,60,(2|int(not show_actions)) if photo or not show_actions else 0);header[44:60]=hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).digest()[:16]
 if plan.get('anchor','first_connection')=='first_connection' and plan['mode']=='test':
  struct.pack_into('<I',header,12,0);struct.pack_into('<I',header,40,1)
 return bytes(header)+b''.join(frames+strips+answer_bits)
def main():
 p=argparse.ArgumentParser();p.add_argument('--plan',required=True);source=p.add_mutually_exclusive_group(required=True);source.add_argument('--films',nargs=2);source.add_argument('--images',nargs=2);p.add_argument('--answers',required=True);p.add_argument('--font',default='/System/Library/Fonts/Supplemental/Songti.ttc');p.add_argument('--encoder-root');p.add_argument('--out',required=True);args=p.parse_args()
 plan=json.loads(Path(args.plan).read_text());answers=json.loads(Path(args.answers).read_text());answers=answers.get('answers',answers) if isinstance(answers,dict) else answers
 if args.films:
  films=[Path(f).read_bytes() for f in args.films]
 else:
  import sys
  candidates=[Path(args.encoder_root)] if args.encoder_root else [parent/'FrameFilm/prayer-service' for parent in Path(__file__).resolve().parents]
  encoder_root=next((candidate for candidate in candidates if (candidate/'prayer_device/core.py').is_file()),None)
  if encoder_root is None:raise ValueError('FrameFilm prayer-service encoder not found; pass --encoder-root')
  sys.path.insert(0,str(encoder_root))
  from prayer_device.core import _encoder, profile_screen, ARK_PROFILE
  films=[]
  for f in args.images:
   with Image.open(f) as original:
    image=ImageOps.exif_transpose(original).convert('RGBA');canvas=Image.new('RGBA',image.size,'white');canvas.alpha_composite(image);canvas=ImageOps.fit(canvas.convert('RGB'),(480,720),method=Image.Resampling.LANCZOS)
    frame=Image.new('RGB',(480,720),'white');frame.paste(canvas,((480-canvas.width)//2,(720-canvas.height)//2))
    film,_=_encoder().convert_for_device(frame.rotate(180),'pro',{'dither_type':'floyd_steinberg','dither_strength':80},screen_profile=profile_screen(ARK_PROFILE));films.append(film)
 data=build(plan,films,answers,args.font);target=Path(args.out);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 print(json.dumps({'file':str(target),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'answers':len(answers)}))
if __name__=='__main__':main()
