# Screenshot procedure (verified 2026-11-04 on this PC)

Headless Edge renders WebGL (SwiftShader) from file:// with ES modules + CDN imports.
Use YOUR OWN profile folder name (edge-<yourlabel>) so you never touch another agent's Edge.
Run in bash; `timeout 60` is mandatory. Never pipe through `tail`.

```bash
SHOTS="C:/Users/pdbul/Desktop/Personal/pdbull-overlay/prototypes/shots"   # output folder (git-ignored)
PROF="C:/Users/pdbul/AppData/Local/Temp/pdbull-edge/edge-<yourlabel>"
mkdir -p "$SHOTS"
timeout 60 "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new \
  --user-data-dir="$PROF" --allow-file-access-from-files --enable-unsafe-swiftshader --use-angle=swiftshader \
  --window-size=1920,1080 --virtual-time-budget=5000 --enable-logging=stderr --v=0 \
  --screenshot="$SHOTS/<page>-v<N>.png" \
  "file:///C:/Users/pdbul/Desktop/Personal/pdbull-overlay/prototypes/<page>.html?v=<N>&shot=1" \
  > "$SHOTS/<page>-v<N>.log" 2>&1; echo "exit=$?"
grep -E "CONSOLE|Uncaught|rror" "$SHOTS/<page>-v<N>.log" | grep -v chrome-extension
```

- `--virtual-time-budget` = ms of page time before the shot. Use a larger value
  (e.g. 9000) to capture a later moment of an animation.
- After your last capture, prove no Edge of yours is left (must print 0):
  `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { \$_.CommandLine -like '*edge-<yourlabel>*' } | Measure-Object | Select -Expand Count"`
  If not 0, stop ONLY those PIDs (same filter, Stop-Process -Force). Never kill other msedge.exe.
- Look at the PNG with the Read tool (it shows images). SwiftShader is slower and has
  no real GPU: judge composition, light and materials, not frame rate.

## Capture stability notes (found by earlier tasks)
- readPixels after advance: after `wt.advance(sec)` do a 1-px `gl.readPixels` (for example
  `const gl = wt.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));`)
  before the screenshot is taken. It forces the GPU work to finish, so the headless shot shows the finished frame.
- Pages holding an open ntfy/Twitch stream: use `--timeout=5000`, or `--virtual-time-budget=8000` if chat must render.
  An open stream never goes idle, so the default wait would hang.
- Memory/lifecycle probe: `probes/scene-churn.html` (20x create/dispose through `core/scene.js`), run as above with
  `--enable-logging=stderr`, then `grep CHURN` in the log.
