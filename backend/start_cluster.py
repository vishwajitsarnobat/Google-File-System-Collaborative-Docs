import subprocess
import sys
import time
import os
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

PYTHON_EXE = sys.executable

# Ensure logs directory exists
if not os.path.exists('logs'):
    os.makedirs('logs')

# Configuration
NODES_CONFIG = {
    # Masters
    6001: {"type": "master", "args": ["6002,6003"]},
    6002: {"type": "master", "args": ["6001,6003"]},
    6003: {"type": "master", "args": ["6001,6002"]},
    # Chunkservers
    5001: {"type": "chunk", "args": ["6001,6002,6003"]},
    5002: {"type": "chunk", "args": ["6001,6002,6003"]},
    5003: {"type": "chunk", "args": ["6001,6002,6003"]},
    5004: {"type": "chunk", "args": ["6001,6002,6003"]},
}

processes = {}

def launch_node(port):
    conf = NODES_CONFIG[port]
    script = "master.py" if conf["type"] == "master" else "chunkserver.py"
    
    # CMD: python script.py PORT ARGS...
    cmd = [PYTHON_EXE, script, str(port)] + conf["args"]
    
    # Log files
    stdout = open(f"logs/node_{port}.out", "w")
    stderr = open(f"logs/node_{port}.err", "w")
    
    p = subprocess.Popen(cmd, stdout=stdout, stderr=stderr)
    processes[port] = p
    return True

@app.route('/manager/status', methods=['GET'])
def get_status():
    status = {}
    for port in NODES_CONFIG:
        p = processes.get(port)
        if p is None:
            status[port] = "STOPPED"
        elif p.poll() is not None:
            status[port] = "CRASHED" # Process died unexpectedly
        else:
            status[port] = "RUNNING"
    return jsonify(status)

@app.route('/manager/start/<int:port>', methods=['POST'])
def start_node(port):
    if port not in NODES_CONFIG: return jsonify({"error":"Invalid port"}), 404
    launch_node(port)
    return jsonify({"success": True})

@app.route('/manager/stop/<int:port>', methods=['POST'])
def stop_node(port):
    p = processes.get(port)
    if p and p.poll() is None:
        if sys.platform == 'win32':
            subprocess.call(['taskkill', '/F', '/T', '/PID', str(p.pid)])
        else:
            p.terminate()
    return jsonify({"success": True})

@app.route('/manager/startall', methods=['POST'])
def start_all_nodes():
    for port in NODES_CONFIG:
        if not processes.get(port) or processes[port].poll() is not None:
            launch_node(port)
    return jsonify({"success": True})

if __name__ == "__main__":
    print("[MANAGER] Starting initial cluster...")
    for port in NODES_CONFIG:
        launch_node(port)
    print("[MANAGER] Manager running on port 8000")
    app.run(port=8000, debug=False)