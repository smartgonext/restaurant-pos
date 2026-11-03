import sqlite3
import os

dbs = [
    'api/prisma/sqlite-template/dev.db',
    'api/sqlite-template/dev.db',
    'api/prisma/maligai.db',
    'api/maligai.db',
    os.path.expanduser('~/AppData/Roaming/restaurant-saas-electron/restaurant.db')
]

for db_path in dbs:
    if os.path.exists(db_path):
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        cur.execute("PRAGMA table_info('Order')")
        cols = [r[1] for r in cur.fetchall()]
        print(f"{db_path}: deliveryExecutiveId present? {'deliveryExecutiveId' in cols}")
        con.close()

