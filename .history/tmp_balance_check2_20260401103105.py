from pathlib import Path
p = Path('d:/restorent/apps/api/src/routes/mainpos/index.ts')
lines = p.read_text(encoding='utf-8').splitlines()
paren = brace = brack = 0
for i, l in enumerate(lines, start=1):
    old_p, old_b, old_q = paren, brace, brack
    for ch in l:
        if ch == '(':
            paren += 1
        elif ch == ')':
            paren -= 1
        elif ch == '{':
            brace += 1
        elif ch == '}':
            brace -= 1
        elif ch == '[':
            brack += 1
        elif ch == ']':
            brack -= 1
    if 600 <= i <= 690 or i in (10, 20, 30):
        print(f'{i:4d}: p={paren} b={brace} q={brack} (+{paren-old_p},+{brace-old_b},+{brack-old_q}) {l.strip()}')
