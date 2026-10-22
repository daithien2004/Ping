import re, glob

for f in glob.glob('apps/web/src/components/ui/ping-*.tsx'):
    s = open(f, encoding='utf-8').read()
    s = re.sub(r'export interface (\w+Props) extends ([\w<>, ]+) \{\s*\}', r'export type \1 = \2;', s)
    open(f, 'w', encoding='utf-8').write(s)
print('done')