import sys
import os
import time
import threading
import sqlite3
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

# Argument Check
if len(sys.argv) < 3:
    # This will show up in logs/node_XXXX.err if it fails
    print(f"ERROR: Missing arguments. Got: {sys.argv}")
    sys.exit(1)

PORT = int(sys.argv[1])
MASTER_PORTS = [int(p) for p in sys.argv[2].split(",")]
DB_NAME = f"chunk_{PORT}.db"

app = Flask(__name__)
CORS(app)

simulated_clock_offset = 0
request_count = 0
staging_buffer = {}

# --- Helper Functions ---
def get_simulated_time():
    return time.time() + simulated_clock_offset

@app.before_request
def count_requests():
    global request_count
    request_count += 1

def init_db():
    try:
        conn = sqlite3.connect(DB_NAME, timeout=10)
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS stored_chunks 
                     (handle TEXT PRIMARY KEY, data TEXT, version INT, last_mod FLOAT)''')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Init Error: {e}")
        sys.exit(1) # Crash if DB fails

def send_heartbeat():
    while True:
        for m in MASTER_PORTS:
            try:
                requests.post(f"http://localhost:{m}/heartbeat", 
                              json={"port": PORT, "time": get_simulated_time()}, 
                              timeout=0.5)
            except: pass
        time.sleep(5)

# --- API Routes ---
@app.route('/chunk/stage', methods=['POST'])
def stage():
    d = request.json
    staging_buffer[d['handle']] = d['content']
    return jsonify({"status":"staged"})

@app.route('/chunk/commit', methods=['POST'])
def commit():
    d = request.json; h=d['handle']
    if h not in staging_buffer: return jsonify({"error":"No data"}),400
    
    conn = sqlite3.connect(DB_NAME, timeout=10)
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO stored_chunks VALUES (?,?,?,?)", 
              (h, staging_buffer[h], 1, get_simulated_time()))
    conn.commit()
    conn.close()
    
    for sec in d.get('secondaries',[]):
        try: requests.post(f"http://localhost:{sec}/chunk/commit", json={"handle":h}, timeout=1)
        except: pass
    
    del staging_buffer[h]
    return jsonify({"status":"committed"})

@app.route('/chunk/read/<handle>', methods=['GET'])
def read(handle):
    conn = sqlite3.connect(DB_NAME, timeout=10)
    c = conn.cursor()
    c.execute("SELECT data FROM stored_chunks WHERE handle=?",(handle,))
    r = c.fetchone()
    conn.close()
    return jsonify({"data":r[0]}) if r else (jsonify({"error":"Not found"}),404)

# --- Admin Routes ---
@app.route('/admin/status', methods=['GET'])
def status():
    return jsonify({
        "port": PORT, "status": "ONLINE",
        "metrics": {"clock_offset": simulated_clock_offset, "total_requests": request_count, "storage_usage": 0}
    })

@app.route('/admin/clock', methods=['GET'])
def clock(): return jsonify({"port":PORT, "simulated_time":get_simulated_time()})

@app.route('/admin/adjust-clock', methods=['POST'])
def adj_clock():
    global simulated_clock_offset
    simulated_clock_offset += request.json.get('offset',0)
    return jsonify({"status":"ok"})

@app.route('/admin/kill', methods=['POST'])
def kill():
    def s(): time.sleep(0.5); os._exit(0)
    threading.Thread(target=s).start()
    return jsonify({"status":"killed"})

if __name__ == '__main__':
    print(f"Starting Chunkserver on {PORT} connecting to {MASTER_PORTS}")
    init_db()
    threading.Thread(target=send_heartbeat, daemon=True).start()
    app.run(port=PORT, debug=False)