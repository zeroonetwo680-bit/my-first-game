#!/usr/bin/env bash
# Assemble BLOCK NOVA into a self-contained web bundle (www/) for Capacitor,
# with locally-vendored fonts so the APK needs zero network access.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf www
mkdir -p www
cp -r block-nova/* www/
rm -rf www/test www/README.md www/assets/icon-1024.png

# ---- vendor Google Fonts locally ----
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -sL -A "$UA" "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap" -o /tmp/bn-fonts.css

python3 - <<'EOF'
import re, subprocess, pathlib
css = pathlib.Path('/tmp/bn-fonts.css').read_text()
urls = re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', css)
for i, u in enumerate(urls):
    name = 'bnf%d.woff2' % i
    subprocess.run(['curl', '-sL', u, '-o', 'www/assets/fonts/' + name], check=True)
    css = css.replace(u, '../assets/fonts/' + name)
pathlib.Path('www/css/fonts.css').write_text(css)
print('vendored %d font files' % len(urls))
EOF

python3 - <<'EOF'
import pathlib
p = pathlib.Path('www/index.html')
s = p.read_text()
s = s.replace('<link rel="preconnect" href="https://fonts.googleapis.com">', '')
s = s.replace('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>', '')
s = s.replace('<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">',
              '<link href="css/fonts.css" rel="stylesheet">')
p.write_text(s)
EOF

echo "block-nova www assembled: $(find www -type f | wc -l) files, $(du -sh www | cut -f1)"
