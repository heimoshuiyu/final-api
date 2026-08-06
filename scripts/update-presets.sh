#!/bin/bash
# Download raw provider/model data from models.dev
set -e

OUT="assets/models-dev.json"
mkdir -p assets

python3 -c "
import urllib.request, sys

url = 'https://models.dev/api.json'
req = urllib.request.Request(url, headers={'User-Agent': 'final-api/1.0'})
data = urllib.request.urlopen(req).read()

with open('$OUT', 'wb') as f:
    f.write(data)

print(f'Downloaded {len(data)} bytes → $OUT')
"
