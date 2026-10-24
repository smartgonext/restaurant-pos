from pathlib import Path
p=Path('d:/restorent/apps/api/src/routes/mainpos/index.ts')
lines=p.read_text(encoding='utf-8').splitlines()
for i in range(520, 676):
    print(f'{i:4d}: {lines[i-1]}')
