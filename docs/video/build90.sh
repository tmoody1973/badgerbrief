#!/bin/bash
# BadgerBrief 90s explainer — 15 blocks x 6s, ElevenLabs narration, captions burned.
set -e
V="$(cd "$(dirname "$0")" && pwd)"; cd "$V"
VOICE=sarah; VODIR=vo90; BLOCK=6
mkdir -p out90 parts90 cap90
ENC="-c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -r 30 -s 1920x1080"

node - <<'NODE'
const { chromium } = require('playwright');
const DIR = process.cwd();
const caps = [
 ['c01','18 candidates for governor'],['c02','Every race on the ballot'],
 ['c03','Jump to what you care about'],['c04','Who actually filed'],
 ['c05','Where they stand, issue by issue'],['c06','Verbatim excerpt + a link'],
 ['c07','Researched by AI agents'],['c08','Find → extract → check'],
 ['c09','Nothing publishes without a person'],['c10','Ask a voting question'],
 ['c11','Answered from official sources'],['c12','Raised · spent · cash on hand'],
 ['c13','Who writes the biggest checks'],['c14','Ad spending — coming next'],
 ['c15','badgerbrief.vercel.app'],
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const CSS = `@import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@700&display=swap');
   *{margin:0;padding:0;box-sizing:border-box}
   body{width:1920px;height:1080px;background:transparent;font-family:'Public Sans',sans-serif}
   .l{position:absolute;left:96px;bottom:88px;border:5px solid #1c1b1a;background:#f6e7b2;
      padding:22px 34px;box-shadow:12px 12px 0 #1c1b1a;font-size:46px;font-weight:700;max-width:1500px}`;
  for (const [id, t] of caps) {
    await p.setContent(`<style>${CSS}</style><body><div class="l">${t}</div></body>`);
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${DIR}/cap90/${id}.png`, omitBackground: true });
  }
  await b.close();
})();
NODE

# blk <source.mp4|webm> <caption> <out> <start>
blk () {
  local fo; fo=$(python3 -c "print($BLOCK-1.0)")
  ffmpeg -y -loglevel error -ss "$4" -i "$1" -loop 1 -i "cap90/$2.png" -t $BLOCK -filter_complex \
    "[1]format=rgba,fade=in:st=0.35:d=0.35:alpha=1,fade=out:st=${fo}:d=0.5:alpha=1[l];[0][l]overlay=0:0" \
    $ENC "parts90/$3.mp4"
}
pick () { ls "$1"/*.webm 2>/dev/null | head -1; }

blk "$(pick seg36/b1-race)"     c01 b01 3.0    # crowded ballot
blk "$(pick seg/02-home)"       c02 b02 2.0    # what it is
blk "$(pick seg/03-race)"       c03 b03 1.0    # jump nav
blk "$(pick seg/03-race)"       c04 b04 9.0    # not-on-ballot fold
blk "$(pick seg/04-candidate)"  c05 b05 1.0    # positions
blk "$(pick seg36/b4-macro)"    c06 b06 3.3    # macro: excerpt + link
blk "$(pick seg36/b3-agents)"   c07 b07 0.2    # agent pipeline
blk "$(pick seg36/b3-agents)"   c08 b08 2.2    # pipeline detail
blk "$(pick seg36/b5-gate)"     c09 b09 0.0    # human gate
# Chat: tighter 2x window on ONE exchange. The thread is permanent (MOO-335),
# so re-record takes stack identical Q&As; this frames a single one instead.
chatblk () { # <out> <caption> <start> <ycrop>
  local fo; fo=$(python3 -c "print($BLOCK-1.0)")
  ffmpeg -y -loglevel error -ss "$3" -i parts/p5.mp4 -loop 1 -i "cap90/$2.png" -t $BLOCK -filter_complex \
    "[0]crop=1440:810:240:$4,scale=1920:1080[v];[1]format=rgba,fade=in:st=0.35:d=0.35:alpha=1,fade=out:st=${fo}:d=0.5:alpha=1[l];[v][l]overlay=0:0" \
    $ENC "parts90/$1.mp4"
}
chatblk b10 c10 12.6 270   # the question + send
chatblk b11 c11 16.0 60   # the sourced answer
blk "$(pick seg90/f3-race-money)" c12 b12 3.0  # who raised the most
blk "$(pick seg90/f2-donors)"   c13 b13 2.5    # PAC / committee donors
blk "$(pick seg90/f4-upcoming)" c14 b14 0.0    # ads: explicitly upcoming
ffmpeg -y -loglevel error -loop 1 -i cards/08-end.png -t $BLOCK $ENC parts90/b15.mp4

: > parts90/vlist.txt
for i in $(seq -w 1 15); do echo "file 'b$i.mp4'" >> parts90/vlist.txt; done
ffmpeg -y -loglevel error -f concat -safe 0 -i parts90/vlist.txt -c copy out90/video.mp4

: > parts90/alist.txt
for i in $(seq 1 15); do
  n=$(printf %02d $i)
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${VODIR}/${VOICE}_$i.m4a")
  DLY=$(python3 -c "print(int(max(0,min(350,(${BLOCK}-${DUR})*1000-120))))")
  ffmpeg -y -loglevel error -i "${VODIR}/${VOICE}_$i.m4a" \
    -af "adelay=${DLY}|${DLY},apad=whole_dur=${BLOCK}" -t $BLOCK -c:a aac -b:a 192k "parts90/a$n.m4a"
  echo "file 'a$n.m4a'" >> parts90/alist.txt
done
ffmpeg -y -loglevel error -f concat -safe 0 -i parts90/alist.txt -c copy out90/audio.m4a

ffmpeg -y -loglevel error -i out90/video.mp4 -i out90/audio.m4a -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest out90/badgerbrief-90s.mp4
echo "BUILT: $V/out90/badgerbrief-90s.mp4"
ffprobe -v error -show_entries format=duration -of csv=p=0 out90/badgerbrief-90s.mp4
