
from flask import Flask, request, jsonify
import sqlite3
import pandas as pd

app = Flask(__name__)
DATABASE = 'database.db'

def init_db():
    with sqlite3.connect(DATABASE) as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS trucks (
                plate TEXT PRIMARY KEY,
                driver_name TEXT,
                phone TEXT,
                home_address TEXT,
                shift TEXT,
                status TEXT
            )
        ''')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_time TEXT,
                request_location TEXT,
                arrival_time TEXT,
                workshop_location TEXT,
                delivery_time TEXT
            )
        ''')

@app.route('/api/trucks', methods=['GET', 'POST'])
def manage_trucks():
    conn = sqlite3.connect(DATABASE)
    cur = conn.cursor()

    if request.method == 'POST':
        data = request.json
        cur.execute('''
            INSERT OR REPLACE INTO trucks VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            data['plate'],
            data['driver_name'],
            data['phone'],
            data['home_address'],
            data['shift'],
            data['status']
        ))
        conn.commit()
        return jsonify({"status": "saved"})
    
    cur.execute("SELECT * FROM trucks")
    rows = cur.fetchall()
    return jsonify(rows)

@app.route('/api/upload', methods=['POST'])
def upload_csv():
    file = request.files['file']
    df = pd.read_csv(file)
    conn = sqlite3.connect(DATABASE)
    df.to_sql('jobs', conn, if_exists='replace', index=False)
    return jsonify({"status": "CSV loaded"})

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
