#!/usr/bin/env bash
# Assemble the game into a self-contained web bundle (www/) for Capacitor,
# including locally-vendored fonts so the APK needs zero network access.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf www
mkdir -p www/assets/fonts
cp index.html www/
cp -r css js www/
# vendor/ holds three.js. Missing it would not break the build - index.html
# would simply 404 on the script and the game would quietly fall back to the 2D
# renderer, which is exactly the "the 3D is gone in the APK" failure.
cp -r vendor www/
cp -r assets/* www/assets/

# ---- vendor Google Fonts locally ----
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -sL -A "$UA" "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap" -o /tmp/fonts.css

python3 - <<'EOF'
import re, subprocess, pathlib
css = pathlib.Path('/tmp/fonts.css').read_text()
urls = re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', css)
for i, u in enumerate(urls):
    name = 'f%d.woff2' % i
    subprocess.run(['curl', '-sL', u, '-o', 'www/assets/fonts/' + name], check=True)
    css = css.replace(u, '../assets/fonts/' + name)
pathlib.Path('www/css/fonts.css').write_text(css)
print('vendored %d font files' % len(urls))
EOF

# ---- point index.html at the local fonts ----
python3 - <<'EOF'
import pathlib
p = pathlib.Path('www/index.html')
s = p.read_text()
s = s.replace('<link rel="preconnect" href="https://fonts.googleapis.com">', '')
s = s.replace('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>', '')
s = s.replace('<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">',
              '<link href="css/fonts.css" rel="stylesheet">')
# the SW is pointless inside the APK bundle — drop its registration
s = s.replace("navigator.serviceWorker.register('./sw.js')", "Promise.reject() && navigator.serviceWorker.register('./sw.js')")
p.write_text(s)
EOF

# ---- stamp the exact commit into the bundle ----
# The in-game footer then always says which build is installed, so "nothing
# changed" can be checked instead of argued about.
SHA="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
SHA="${SHA:0:7}"
python3 - "$SHA" <<'STAMP'
import pathlib, sys
stamp = 'build %s' % sys.argv[1]
p = pathlib.Path('www/index.html')
s = p.read_text()
s = s.replace('>build local<', '>' + stamp + '<')
p.write_text(s)
print('stamped:', stamp)
STAMP

echo "www assembled: $(find www -type f | wc -l) files, $(du -sh www | cut -f1)"
