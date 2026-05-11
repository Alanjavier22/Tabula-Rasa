import sqlite3
import uuid
from datetime import datetime

db_path = r'c:\Users\ALAN-BG\CascadeProjects\personal-website\backend\finance.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cat_id = str(uuid.uuid4())
now = datetime.now().isoformat()

try:
    cursor.execute("""
        INSERT INTO categories (id, name, description, is_deleted, created_at, updated_at, version)
        VALUES (?, ?, ?, 0, ?, ?, 1)
    """, (cat_id, "Cuotas y Pagos Diferidos (💳)", "Pagos de consumos diferidos en tarjeta de crédito (cuotas mensuales).", now, now))
    conn.commit()
    print(f"Created category: {cat_id}")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
