import sqlite3
import os

db_path = r'c:\Users\ALAN-BG\CascadeProjects\personal-website\backend\personal_finance.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"Tables: {tables}")
    conn.close()
else:
    print("DB not found")
