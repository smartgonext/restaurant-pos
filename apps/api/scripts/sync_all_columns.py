import sqlite3
import os
import re

schema_path = 'api/prisma/schema.electron.sqlite.prisma'

# Parse models and their fields from schema.electron.sqlite.prisma
with open(schema_path, 'r', encoding='utf-8') as f:
    content = f.read()

models = {}
for match in re.finditer(r'model\s+(\w+)\s+\{([^}]+)\}', content):
    model_name = match.group(1)
    body = match.group(2)
    fields = {}
    for line in body.splitlines():
        line = line.strip()
        if not line or line.startswith('//') or line.startswith('@@'):
            continue
        parts = line.split()
        if len(parts) >= 2:
            fname = parts[0]
            ftype = parts[1].replace('?', '').replace('[]', '')
            # If ftype is a scalar or supported SQLite type
            if ftype in ['Int', 'String', 'Boolean', 'DateTime', 'Float', 'Decimal', 'Json']:
                sql_type = 'INTEGER' if ftype in ['Int', 'Boolean'] else ('REAL' if ftype in ['Float', 'Decimal'] else 'TEXT')
                fields[fname] = sql_type
    models[model_name] = fields

dbs = [
    'api/prisma/sqlite-template/dev.db',
    'api/sqlite-template/dev.db',
    'api/prisma/maligai.db',
    'api/maligai.db',
    os.path.expanduser('~/AppData/Roaming/restaurant-saas-electron/restaurant.db')
]

for db_path in dbs:
    if os.path.exists(db_path):
        print(f"\nChecking {db_path}...")
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        
        # Get existing tables
        cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [r[0] for r in cur.fetchall()]
        
        for mname, fields in models.items():
            if mname in tables:
                cur.execute(f"PRAGMA table_info('{mname}')")
                existing_cols = set(r[1] for r in cur.fetchall())
                for fname, ftype in fields.items():
                    if fname not in existing_cols:
                        alter_sql = f'ALTER TABLE "{mname}" ADD COLUMN "{fname}" {ftype};'
                        try:
                            cur.execute(alter_sql)
                            print(f"  + Added column {mname}.{fname} ({ftype})")
                        except Exception as e:
                            print(f"  ! Error adding {mname}.{fname}: {e}")
        con.commit()
        con.close()

print("\nAll database schema columns synchronized!")

