import sqlite3
import os

db_path = r'c:\Users\ALAN-BG\CascadeProjects\personal-website\backend\personal_finance.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM config WHERE key = 'safe_to_spend_buffer'")
    row = cursor.fetchone()
    print(f"Config: {row}")
    conn.close()
else:
    print("DB not found")
