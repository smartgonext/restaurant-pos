from pathlib import Path
p=Path('d:/restorent/apps/api/src/routes/mainpos/index.ts')
lines=p.read_text(encoding='utf-8').splitlines()
paren=brace=brack=0
for i,l in enumerate(lines, start=1):
    for ch in l:
        if ch=='(': paren+=1
        elif ch==')': paren-=1
        elif ch=='{': brace+=1
        elif ch=='}': brace-=1
        elif ch=='[': brack+=1
        elif ch==']': brack-=1
    if 430<=i<=540:
        print(f'{i:4d}: p={paren} b={brace} q={brack} | {l.strip()}')
