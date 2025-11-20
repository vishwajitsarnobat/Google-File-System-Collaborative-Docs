import sys
import os
import time
import threading
import sqlite3
import requests
import random
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- Arg Parsing ---
if len(sys.argv) < 3:
    print("Usage: python chunkserver.py <PORT> <MASTER_PORTS>")
    sys.exit(1)

PORT = int(sys.argv[1])
try:
    MASTER_PORTS = [int(p) for p in sys.argv[2].split(",")]
except:
    MASTER_PORTS = []

DB_NAME = f"chunk_{PORT}.db"

app = Flask(__name__)
CORS(app)

# --- Internal State ---
simulated_clock_offset = 0
request_count = 0
staging_buffer = {} # Memory buffer for 2-phase commit

def get_simulated_time():
    return time.time() + simulated_clock_offset

@app.before_request
def count_requests():
    global request_count
    request_count += 1

# --- Database ---
def init_db():
    try:
        conn = sqlite3.connect(DB_NAME, timeout=10)
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS stored_chunks 
                     (handle TEXT PRIMARY KEY, data TEXT, version INT, last_mod FLOAT)''')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Error: {e}")
        sys.exit(1)

# --- Heartbeat ---
def send_heartbeat():
    # Add startup jitter to prevent thundering herd on Master
    time.sleep(random.uniform(0.5, 3.0))
    
    while True:
        for m in MASTER_PORTS:
            try:
                requests.post(f"http://localhost:{m}/heartbeat", 
                              json={"port": PORT, "time": get_simulated_time()}, 
                              timeout=0.5)
            except:
                pass # Master might be down, just retry next interval
        time.sleep(5)

# --- GFS Data Logic ---

@app.route('/chunk/stage', methods=['POST'])
def stage_chunk():
    """Phase 1: Hold data in memory."""
    data = request.json
    staging_buffer[data['handle']] = data['content']
    return jsonify({"status": "staged"})

@app.route('/chunk/commit', methods=['POST'])
def commit_chunk():
    """Phase 2: Write to DB and propagate."""
    data = request.json
    handle = data['handle']
    
    if handle not in staging_buffer:
        return jsonify({"error": "No data staged"}), 400
    
    content = staging_buffer[handle]
    
    try:
        conn = sqlite3.connect(DB_NAME, timeout=10)
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO stored_chunks VALUES (?, ?, ?, ?)", 
                  (handle, content, 1, get_simulated_time()))
        conn.commit()
        conn.close()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
    # If Primary (secondaries provided), replicate
    secondaries = data.get('secondaries', [])
    for sec in secondaries:
        try:
            requests.post(f"http://localhost:{sec}/chunk/commit", 
                          json={"handle": handle, "secondaries": []}, timeout=1)
        except:
            print(f"Failed to replicate to {sec}")

    # Clear buffer
    del staging_buffer[handle]
    return jsonify({"status": "committed"})

@app.route('/chunk/read/<handle>', methods=['GET'])
def read_chunk(handle):
    try:
        conn = sqlite3.connect(DB_NAME, timeout=10)
        c = conn.cursor()
        c.execute("SELECT data FROM stored_chunks WHERE handle=?", (handle,))
        row = c.fetchone()
        conn.close()
        if row: return jsonify({"data": row[0]})
        return jsonify({"error": "Not found"}), 404
    except:
        return jsonify({"error": "DB Error"}), 500

# --- Admin & Algo Support ---

@app.route('/admin/status', methods=['GET'])
def get_status():
    """Called by Middleware for Admin Dashboard metrics."""
    return jsonify({
        "port": PORT,
        "status": "ONLINE",
        "metrics": {
            "clock_offset": simulated_clock_offset,
            "active_threads": threading.active_count(),
            "total_requests": request_count,
            "storage_usage": len(staging_buffer)
        }
    })

@app.route('/admin/clock', methods=['GET'])
def get_clock():
    return jsonify({"port": PORT, "simulated_time": get_simulated_time()})

@app.route('/admin/adjust-clock', methods=['POST'])
def adjust_clock():
    global simulated_clock_offset
    simulated_clock_offset += request.json.get('offset', 0)
    return jsonify({"status": "ok"})

@app.route('/admin/kill', methods=['POST'])
def kill_node():
    """Delayed kill to ensure response reaches the client."""
    def shutdown():
        time.sleep(1.0)
        print(f"[CHUNKSERVER-{PORT}] Shutting down via Admin command.")
        os._exit(0)
    threading.Thread(target=shutdown).start()
    return jsonify({"status": "killed"})

if __name__ == '__main__':
    init_db()
    threading.Thread(target=send_heartbeat, daemon=True).start()
    print(f"[CHUNKSERVER-{PORT}] Running.")
    app.run(port=PORT, debug=False)