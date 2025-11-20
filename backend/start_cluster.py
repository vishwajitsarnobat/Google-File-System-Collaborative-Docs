import subprocess
import sys
import time
import os
import platform
import signal
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Use the current python interpreter to ensure installed dependencies (Flask, etc.) are found
PYTHON_EXE = sys.executable

# Ensure logs directory exists to capture output from nodes
if not os.path.exists('logs'):
    os.makedirs('logs')

# --- Cluster Configuration ---
# Defines the topology of the distributed system
NODES_CONFIG = {
    # Master Nodes (Metadata & Election)
    # Args: <PORT> <PEER_PORTS>
    6001: {"type": "master", "args": ["6002,6003"]},
    6002: {"type": "master", "args": ["6001,6003"]},
    6003: {"type": "master", "args": ["6001,6002"]},
    
    # Chunkservers (Data Storage)
    # Args: <PORT> <MASTER_PORTS>
    5001: {"type": "chunk", "args": ["6001,6002,6003"]},
    5002: {"type": "chunk", "args": ["6001,6002,6003"]},
    5003: {"type": "chunk", "args": ["6001,6002,6003"]},
    5004: {"type": "chunk", "args": ["6001,6002,6003"]},
}

# Store active subprocess objects: { port: subprocess.Popen }
processes = {}

def free_port(port):
    """Attempts to kill any process currently using the specified port."""
    try:
        if sys.platform == 'win32':
            # Find PID using netstat
            cmd = f'netstat -ano | findstr :{port}'
            output = subprocess.check_output(cmd, shell=True).decode()
            if output:
                # Parse PID (last column)
                lines = output.strip().split('\n')
                for line in lines:
                    parts = line.strip().split()
                    pid = parts[-1]
                    if pid.isdigit() and int(pid) > 0:
                        print(f"[MANAGER] Port {port} in use by PID {pid}. Killing...")
                        subprocess.call(['taskkill', '/F', '/PID', pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            # Linux/MacOS using lsof
            try:
                pid = subprocess.check_output(['lsof', '-t', '-i', f':{port}']).decode().strip()
                if pid:
                    print(f"[MANAGER] Port {port} in use by PID {pid}. Killing...")
                    subprocess.call(['kill', '-9', pid])
            except subprocess.CalledProcessError:
                pass # No process found
    except Exception as e:
        # print(f"[MANAGER] Warning: Could not cleanup port {port}: {e}")
        pass

def launch_node(port):
    """Spawns a node process and redirects output to log files."""
    if port not in NODES_CONFIG:
        return False

    # 1. Cleanup orphaned processes on this port
    free_port(port)
    
    conf = NODES_CONFIG[port]
    script = "master.py" if conf["type"] == "master" else "chunkserver.py"
    
    # Construct command: python script.py PORT ARGS...
    cmd = [PYTHON_EXE, script, str(port)] + conf["args"]
    
    # Open log files for this specific node
    try:
        stdout = open(f"logs/node_{port}.out", "w")
        stderr = open(f"logs/node_{port}.err", "w")
        
        # Launch process non-blocking
        p = subprocess.Popen(cmd, stdout=stdout, stderr=stderr)
        processes[port] = p
        return True
    except Exception as e:
        print(f"Failed to launch node {port}: {e}")
        return False

# --- API Endpoints (Controlled by Middleware/Admin Dashboard) ---

@app.route('/manager/status', methods=['GET'])
def get_status():
    """Checks which processes are physically running."""
    status = {}
    for port in NODES_CONFIG:
        p = processes.get(port)
        
        if p is None:
            status[port] = "STOPPED"
        elif p.poll() is not None:
            # Process has exited (crashed or stopped)
            status[port] = "CRASHED" 
        else:
            status[port] = "RUNNING"
            
    return jsonify(status)

@app.route('/manager/start/<int:port>', methods=['POST'])
def start_node(port):
    """Revives a node."""
    if port not in NODES_CONFIG:
        return jsonify({"error": "Invalid port"}), 404
    
    # Check if already running
    p = processes.get(port)
    if p and p.poll() is None:
        return jsonify({"message": "Already running"}), 200

    if launch_node(port):
        return jsonify({"success": True, "status": "RUNNING"})
    else:
        return jsonify({"error": "Failed to launch"}), 500

@app.route('/manager/stop/<int:port>', methods=['POST'])
def stop_node(port):
    """Kills a node process."""
    p = processes.get(port)
    if p and p.poll() is None:
        # Force kill based on OS
        try:
            if sys.platform == 'win32':
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(p.pid)])
            else:
                p.terminate() # Gentle signal
                try:
                    p.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    p.kill() # Force kill if stuck
        except Exception as e:
            print(f"Error killing {port}: {e}")
            
        return jsonify({"success": True, "status": "STOPPED"})
    
    return jsonify({"message": "Node was not running"}), 200

@app.route('/manager/startall', methods=['POST'])
def start_all_nodes():
    """Utility to boot everything."""
    for port in NODES_CONFIG:
        p = processes.get(port)
        if not p or p.poll() is not None:
            launch_node(port)
    return jsonify({"success": True})

# --- Main Execution ---

def cleanup():
    """Ensures all child processes are killed when this script stops."""
    print("\n[MANAGER] Shutting down cluster...")
    for port, p in processes.items():
        if p.poll() is None:
            try:
                if sys.platform == 'win32':
                    subprocess.call(['taskkill', '/F', '/T', '/PID', str(p.pid)])
                else:
                    p.kill()
            except:
                pass
    print("[MANAGER] All nodes stopped.")

if __name__ == "__main__":
    print(f"[MANAGER] Initializing Cluster with interpreter: {PYTHON_EXE}")
    print("[MANAGER] Logs will be written to backend/logs/")
    
    # 1. Launch all nodes immediately
    for port in NODES_CONFIG:
        print(f" -> Launching Node {port}...")
        launch_node(port)
    
    print("[MANAGER] Cluster Manager API running on http://localhost:8000")
    print("[INFO] Press Ctrl+C to stop the entire cluster.")

    try:
        # Run the Flask app to listen for Admin commands
        app.run(port=8000, debug=False, use_reloader=False)
    except KeyboardInterrupt:
        cleanup()
    finally:
        cleanup()