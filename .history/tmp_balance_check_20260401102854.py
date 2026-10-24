from pathlib import Path
p = Path('d:/restorent/apps/api/src/routes/mainpos/index.ts')
text = p.read_text(encoding='utf-8')
paren = brace = brack = 0
lines = text.splitlines()
for i, ch in enumerate(text, start=1):
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
    if paren < 0 or brace < 0 or brack < 0:
        print('neg', i, paren, brace, brack)
        break
for ln in [80,160,240,320,400,480,560,640,677,690]:
    if ln <= len(lines):
        pcnt = sum(l.count('(')-l.count(')') for l in lines[:ln])
        bcnt = sum(l.count('{')-l.count('}') for l in lines[:ln])
        qcnt = sum(l.count('[')-l.count(']') for l in lines[:ln])
        print(f'line {ln} counts: paren={pcnt} brace={bcnt} brack={qcnt}')
