"""
migrate.py — apply schema.sql to the Supabase Postgres database.

Usage:
    python backend/migrate.py

Requires DATABASE_URL secret (direct Postgres connection to Supabase):
  Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
  Find it in: Supabase dashboard → Settings → Database → Connection string (URI mode, Session pooler)
"""
import os
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:
    print("Installing psycopg2-binary...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"])
    import psycopg2

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable not set.")
    print("Add it as a Replit Secret: postgresql://postgres.[ref]:[password]@...")
    sys.exit(1)

schema_path = ROOT_DIR / "schema.sql"
sql = schema_path.read_text()

print(f"Connecting to database...")
conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = True
cur = conn.cursor()

print(f"Applying schema from {schema_path}...")
cur.execute(sql)
print("Schema applied successfully.")

cur.close()
conn.close()
