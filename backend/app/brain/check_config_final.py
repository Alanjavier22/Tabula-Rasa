import sqlite3
import os

db_path = r'c:\Users\ALAN-BG\CascadeProjects\personal-website\backend\finance.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Check tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"Tables: {tables}")
    
    # Check config
    if ('config',) in tables:
        cursor.execute("SELECT key, value FROM config WHERE key = 'safe_to_spend_buffer'")
        row = cursor.fetchone()
        print(f"Buffer Config: {row}")
    conn.close()
else:
    print(f"DB not found at {db_path}")
