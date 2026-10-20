#!/usr/bin/env bash
# Assemble NEON ESCAPE into a self-contained web bundle (www/) for Capacitor,
# with locally-vendored fonts so the APK needs zero network access.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf www
mkdir -p www/assets/fonts
cp -r neon-escape/* www/
rm -rf www/test www/tools www/README.md www/node_modules www/package*.json www/assets/icon-1024.png www/assets/art

# ---- vendor Google Fonts locally ----
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -sL -A "$UA" "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap" -o /tmp/ne-fonts.css

python3 - <<'EOF'
import re, subprocess, pathlib
css = pathlib.Path('/tmp/ne-fonts.css').read_text()
urls = re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', css)
for i, u in enumerate(urls):
    name = 'nef%d.woff2' % i
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

echo "neon-escape www assembled: $(find www -type f | wc -l) files, $(du -sh www | cut -f1)"
