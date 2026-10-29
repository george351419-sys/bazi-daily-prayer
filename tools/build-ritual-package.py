#!/usr/bin/env python3
"""Offline compiler: two existing Ark Film files + exported account plan. No paid calls."""
import argparse, json, struct, hashlib, datetime
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageChops
MAGIC=b'RITUAL1\0'; FRAME=172832; STRIP=7680; ANSWER=4800
COLORS=[(0,0,0),(255,255,255),(255,255,0),(255,0,0),(0,0,255),(0,255,0)]
def text_bitmap(lines, size, font_path, action=False):
 im=Image.new('1',size,0);d=ImageDraw.Draw(im)
 if action:
  d.line((12,0,12,127),fill=1);d.line((468,0,468,127),fill=1)
  d.line((48,37,432,37),fill=1)
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
 frames=[]
 for raw in films:
  if photo and not show_actions:
   frames.append(raw);continue
  source=portrait(raw);im=Image.new('RGB',(480,720),'white')
  # One continuous scroll frame, with the full deity preserved inside it.
  # The replaceable action band crosses the same frame, keeping both assets independent.
  bounds=ImageChops.difference(source,Image.new('RGB',source.size,'white')).getbbox()
  if bounds:source=source.crop(bounds) # Remove only wholly empty outer padding, never crop the figure.
  fitted=ImageOps.contain(source,((400 if photo else 340),480),Image.Resampling.NEAREST);im.paste(fitted,((480-fitted.width)//2,62+(480-fitted.height)//2))
  d=ImageDraw.Draw(im);d.rectangle((12,18,468,702),outline='black',width=1)
  title=ImageFont.truetype(font,24);side=ImageFont.truetype(font,18);foot=ImageFont.truetype(font,14)
  d.text((240,26),'我的照片' if photo else '今日祈愿',anchor='mt',font=title,fill='black')
  if not photo:
   for i,ch in enumerate('心有所愿向好而行'):d.text((34,190+i*27),ch,font=side,fill='black')
   d.rectangle((423,112,454,149),outline='red',width=2);d.text((427,116),'愿',font=title,fill='red')
  d.line((48,549,432,549),fill='black',width=1)
  d.text((240,684),'上键 · 答案之书    下键 · 回到今日',anchor='mt',font=foot,fill='black')
  # Pillow antialiases fonts on RGB; snap only those edge pixels back to the six supported inks.
  palette=Image.new('P',(1,1));palette.putpalette([v for c in COLORS for v in c]+[0]*(768-18))
  im=im.quantize(palette=palette,dither=Image.Dither.NONE).convert('RGB')
  frames.append(encode(im,raw[:32]))
 strips=[]
 for day in plan['days']:
  for a in day['actions']:
   strips.append(text_bitmap([(a['branch']+'时 · '+a['title'],20),(a['text'],30)],(480,128),font,action=True))
 answer_bits=[text_bitmap([(a['id']+' · 答案之书',18),(a['text'],32)],(480,80),font) for a in answers]
 offset1=64;offset2=offset1+2*FRAME;offset3=offset2+16*STRIP;length=offset3+len(answers)*ANSWER
 header=struct.pack('<8s8I24x',MAGIC,length,start,int(plan['mode']=='test'),len(answers),offset1,offset2,offset3,2 if photo else 1)
 header=bytearray(header);struct.pack_into('<I',header,60,(2|int(not show_actions)) if photo else 0);header[44:60]=hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).digest()[:16]
 if plan.get('anchor','first_connection')=='first_connection' and plan['mode']=='test':
  struct.pack_into('<I',header,12,0);struct.pack_into('<I',header,40,1)
 return bytes(header)+b''.join(frames+strips+answer_bits)
def main():
 p=argparse.ArgumentParser();p.add_argument('--plan',required=True);source=p.add_mutually_exclusive_group(required=True);source.add_argument('--films',nargs=2);source.add_argument('--images',nargs=2);p.add_argument('--answers',required=True);p.add_argument('--font',default='/System/Library/Fonts/Supplemental/Songti.ttc');p.add_argument('--out',required=True);args=p.parse_args()
 plan=json.loads(Path(args.plan).read_text());answers=json.loads(Path(args.answers).read_text());answers=answers.get('answers',answers) if isinstance(answers,dict) else answers
 if args.films:
  films=[Path(f).read_bytes() for f in args.films]
 else:
  import sys
  sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'FrameFilm/prayer-service'))
  from prayer_device.core import _encoder, profile_screen, ARK_PROFILE
  films=[]
  for f in args.images:
   with Image.open(f) as original:
    image=ImageOps.exif_transpose(original).convert('RGBA');canvas=Image.new('RGBA',image.size,'white');canvas.alpha_composite(image);canvas=ImageOps.contain(canvas.convert('RGB'),(480,720),Image.Resampling.LANCZOS)
    frame=Image.new('RGB',(480,720),'white');frame.paste(canvas,((480-canvas.width)//2,(720-canvas.height)//2))
    film,_=_encoder().convert_for_device(frame.rotate(180),'pro',{'dither_type':'floyd_steinberg','dither_strength':80},screen_profile=profile_screen(ARK_PROFILE));films.append(film)
 data=build(plan,films,answers,args.font);target=Path(args.out);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 print(json.dumps({'file':str(target),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'answers':len(answers)}))
if __name__=='__main__':main()
