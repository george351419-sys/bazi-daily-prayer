#!/usr/bin/env python3
"""Offline compiler: two existing Ark Film files + exported account plan. No paid calls."""
import argparse, json, struct, hashlib, datetime
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageChops
MAGIC=b'RITUAL1\0'; FRAME=172832; STRIP=7680; ANSWER=4800
COLORS=[(0,0,0),(255,255,255),(255,255,0),(255,0,0),(0,0,255),(0,255,0)]
def text_layout(lines,size,font_path,action=False):
 probe=ImageDraw.Draw(Image.new('1',size));rows=[];margin=48 if action else 20
 for text,px in lines:
  font=ImageFont.truetype(font_path,px);line='';start=len(rows)
  for ch in text:
   if ch=='\n' or (line and probe.textlength(line+ch,font=font)>size[0]-2*margin):
    if line:rows.append((line,font,font.getbbox(line)))
    line='' if ch=='\n' else ch
   else:line+=ch
  if line:rows.append((line,font,font.getbbox(line)))
  section=rows[start:]
  if '\n' not in text and len(section)>1 and probe.textlength(section[-1][0],font=font)<(size[0]-2*margin)*0.35:
   # Avoid a final orphan character while retaining exactly the original copy.
   remaining=text;balanced=[]
   for i in range(len(section)):
    count=(len(remaining)+len(section)-i-1)//(len(section)-i)
    while count>1 and probe.textlength(remaining[:count],font=font)>size[0]-2*margin:count-=1
    chunk=remaining[:count] if i<len(section)-1 else remaining
    balanced.append((chunk,font,font.getbbox(chunk)));remaining=remaining[len(chunk):]
   if all(probe.textlength(row[0],font=font)<=size[0]-2*margin for row in balanced):rows[start:]=balanced
 if not rows:return []
 top,bottom=(12,110) if action else (6,size[1]-6)
 heights=[box[3]-box[1] for _,_,box in rows];available=bottom-top
 # Keep glyphs legible; reject overflow instead of silently clipping the last row.
 minimum_gap=5 if action else 4
 if sum(heights)+minimum_gap*(len(rows)-1)>available:raise ValueError('Copy overflows: '+str(lines))
 gap=min(22 if action else 12,(available-sum(heights))/(len(rows)-1)) if len(rows)>1 else 0
 y=top+(available-sum(heights)-gap*(len(rows)-1))/2
 result=[]
 for (text,font,box),height in zip(rows,heights):
  result.append((text,font,margin-box[0],round(y-box[1]),round(y),round(y+height)))
  y+=height+gap
 return result

def text_bitmap(lines,size,font_path,action=False):
 im=Image.new('1',size,0);d=ImageDraw.Draw(im)
 for text,font,x,y,_,_ in text_layout(lines,size,font_path,action):d.text((x,y),text,font=font,fill=1)
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
 p=argparse.ArgumentParser();p.add_argument('--cache-dir');p.add_argument('--plan',required=True);source=p.add_mutually_exclusive_group(required=True);source.add_argument('--films',nargs=2);source.add_argument('--images',nargs=2);p.add_argument('--answers',required=True);p.add_argument('--font',default='/System/Library/Fonts/Supplemental/Songti.ttc');p.add_argument('--encoder-root');p.add_argument('--out',required=True);args=p.parse_args()
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
  from ritual_frame_cache import cached_frame, encoder_fingerprint
  fingerprint=encoder_fingerprint(encoder_root)
  films=[];cache_hits=0
  def convert_frame(f):
   with Image.open(f) as original:
    image=ImageOps.exif_transpose(original).convert('RGBA');canvas=Image.new('RGBA',image.size,'white');canvas.alpha_composite(image);canvas=ImageOps.fit(canvas.convert('RGB'),(480,720),method=Image.Resampling.LANCZOS)
    frame=Image.new('RGB',(480,720),'white');frame.paste(canvas,((480-canvas.width)//2,(720-canvas.height)//2))
    film,_=_encoder().convert_for_device(frame.rotate(180),'pro',{'dither_type':'floyd_steinberg','dither_strength':80},screen_profile=profile_screen(ARK_PROFILE));return film
  for f in args.images:
   film,hit=cached_frame(f,args.cache_dir if plan.get('contentMode')=='photo' else None,fingerprint,convert_frame);films.append(film);cache_hits+=int(hit)
  print(json.dumps({'event':'frame-cache','hits':cache_hits,'total':len(films)}))
 data=build(plan,films,answers,args.font);target=Path(args.out);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 print(json.dumps({'file':str(target),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'answers':len(answers)}))
if __name__=='__main__':main()
