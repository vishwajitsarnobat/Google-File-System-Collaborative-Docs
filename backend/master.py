import sys
import os
import time
import threading
import sqlite3
import requests
import hashlib
import uuid
import statistics
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- Configuration ---
TIMEOUT = 2.0
HEARTBEAT_INTERVAL = 5
LEASE_DURATION = 60  # Seconds

class MasterNode:
    request_count = 0
    def __init__(self, port, peers):
        self.port = port
        self.peers = peers
        self.id = port
        
        # Election State
        self.leader_id = None
        self.election_in_progress = False
        
        # GFS State
        self.active_chunkservers = {}  # {port: last_seen_timestamp}
        self.chunkserver_clocks = {}   # {port: simulated_time}
        self.leases = {}               # {chunk_handle: {'primary': port, 'expires': timestamp}}
        
        self.db_name = f"master_{port}.db"

        # Flask App Setup
        self.app = Flask(__name__)
        CORS(self.app)
        self.setup_routes()
        self.init_db()

    # --- Database Management ---
    def init_db(self):
        conn = sqlite3.connect(self.db_name)
        c = conn.cursor()
        # Metadata Tables
        c.execute('''CREATE TABLE IF NOT EXISTS files 
                     (file_id TEXT PRIMARY KEY, filename TEXT, size INT, owner_id TEXT)''')
        c.execute('''CREATE TABLE IF NOT EXISTS chunk_mapping 
                     (chunk_handle TEXT, file_id TEXT, sequence INT, primary_loc TEXT, locations TEXT)''')
        # User & Auth Tables
        c.execute('''CREATE TABLE IF NOT EXISTS users 
                     (user_id TEXT PRIMARY KEY, username TEXT, password_hash TEXT)''')
        # Permissions: status = 'PENDING' | 'APPROVED' | 'REJECTED'
        c.execute('''CREATE TABLE IF NOT EXISTS permissions 
                     (req_id TEXT PRIMARY KEY, file_id TEXT, user_id TEXT, access_type TEXT, status TEXT)''')
        conn.commit()
        conn.close()

    def run_query(self, query, params=(), commit=False):
        """Executes a SQL query on the local SQLite DB."""
        conn = sqlite3.connect(self.db_name)
        c = conn.cursor()
        try:
            c.execute(query, params)
            if commit:
                conn.commit()
            return c.fetchall()
        except Exception as e:
            print(f"[DB Error] {e}")
            raise e
        finally:
            conn.close()

    def replicate_to_peers(self, query, params):
        """
        FAULT TOLERANCE:
        Broadcasts state changes (Metadata updates) to all other Masters.
        This ensures if the Leader dies, followers have the latest User/File lists.
        """
        for peer in self.peers:
            try:
                requests.post(f"http://localhost:{peer}/system/replicate", 
                              json={"query": query, "params": params}, 
                              timeout=0.5)
            except:
                pass  # Best-effort replication (Eventual Consistency)

    # --- Berkeley Algorithm (Clock Sync) ---
    def sync_clocks(self):
        """
        Runs periodically on the Leader.
        1. Polls Chunkservers for their simulated time.
        2. Calculates average time difference.
        3. Sends adjustments to align everyone.
        """
        while True:
            time.sleep(10)
            if self.leader_id != self.port:
                continue  # Only Leader acts as Time Daemon
            
            # Find live chunkservers
            now = time.time()
            active_ports = [p for p, t in self.active_chunkservers.items() if now - t < 10]
            if not active_ports:
                continue

            server_offsets = []
            my_time = time.time()
            valid_ports = []

            # 1. Poll
            for port in active_ports:
                try:
                    r = requests.get(f"http://localhost:{port}/admin/clock", timeout=1)
                    data = r.json()
                    # Calculate diff: (Their Time - My Time)
                    diff = data['simulated_time'] - my_time
                    server_offsets.append(diff)
                    valid_ports.append(port)
                except:
                    pass
            
            if not server_offsets:
                continue

            # 2. Average the differences
            avg_diff = statistics.mean(server_offsets)
            
            # 3. Adjust
            # If a server is +10s ahead, and avg is +5s ahead.
            # Adjustment = Avg - Current = 5 - 10 = -5s.
            for i, port in enumerate(valid_ports):
                adjustment = avg_diff - server_offsets[i]
                try:
                    requests.post(f"http://localhost:{port}/admin/adjust-clock", 
                                  json={"offset": adjustment}, timeout=0.5)
                except:
                    pass

    # --- Lease Management ---
    def grant_lease(self, chunk_handle, replicas):
        """
        GFS CONSISTENCY:
        Ensures one replica holds a valid lease to act as Primary for mutations.
        """
        now = time.time()
        
        # Check existing lease
        if chunk_handle in self.leases:
            lease = self.leases[chunk_handle]
            # If lease is valid and the primary is still in the replica list
            if lease['expires'] > now and lease['primary'] in replicas:
                return lease['primary']
        
        # Grant new lease
        if not replicas:
            return None
            
        primary = replicas[0]  # Simple strategy: Pick first
        self.leases[chunk_handle] = {
            'primary': primary,
            'expires': now + LEASE_DURATION
        }
        print(f"[Lease] Granted lease for {chunk_handle} to Node {primary}")
        return primary

    # --- Bully Election Algorithm ---
    def start_election(self):
        print(f"[Node-{self.port}] Starting Election...")
        self.election_in_progress = True
        higher_nodes = [p for p in self.peers if p > self.port]
        
        if not higher_nodes:
            self.declare_victory()
            return

        found_higher = False
        for p in higher_nodes:
            try:
                requests.post(f"http://localhost:{p}/election/msg", 
                              json={"type": "ELECTION", "sender": self.port}, 
                              timeout=1)
                found_higher = True
            except:
                continue
        
        if not found_higher:
            self.declare_victory()

    def declare_victory(self):
        print(f"[Node-{self.port}] I am the LEADER!")
        self.leader_id = self.port
        self.election_in_progress = False
        
        # Start Clock Sync thread
        if not any(t.name == 'ClockSync' for t in threading.enumerate()):
            t = threading.Thread(target=self.sync_clocks, name='ClockSync', daemon=True)
            t.start()

        for p in self.peers:
            try:
                requests.post(f"http://localhost:{p}/election/msg", 
                              json={"type": "COORDINATOR", "sender": self.port}, 
                              timeout=0.5)
            except:
                pass

    def monitor_leader(self):
        """Daemon thread to check if the leader is alive."""
        while True:
            time.sleep(3)
            if self.leader_id == self.port:
                continue

            if self.leader_id is None:
                self.start_election()
                continue

            try:
                requests.get(f"http://localhost:{self.leader_id}/health", timeout=1)
            except:
                print(f"[Node-{self.port}] Leader {self.leader_id} is dead.")
                self.leader_id = None
                self.start_election()

    # --- API Routes ---
    def setup_routes(self):
        @self.app.before_request
        def count_requests():
            self.request_count += 1

        @self.app.route('/health', methods=['GET'])
        def health():
            return jsonify({
                "status": "alive", 
                "role": "leader" if self.leader_id == self.port else "follower"
            })

        @self.app.route('/election/msg', methods=['POST'])
        def election_msg():
            data = request.json
            msg_type = data.get("type")
            sender = data.get("sender")

            if msg_type == "ELECTION":
                # If I am higher or same, I should take over, but Bully says send OK and hold election
                if not self.election_in_progress and self.leader_id != self.port:
                     threading.Thread(target=self.start_election).start()
                return jsonify({"status": "OK"})
            
            elif msg_type == "COORDINATOR":
                self.leader_id = sender
                self.election_in_progress = False
                print(f"[Node-{self.port}] Acknowledged Leader: {sender}")
                return jsonify({"status": "Ack"})
            
            return jsonify({}), 400

        @self.app.route('/heartbeat', methods=['POST'])
        def heartbeat():
            data = request.json
            self.active_chunkservers[data.get('port')] = time.time()
            return jsonify({"status": "ok"})
        
        @self.app.route('/system/status', methods=['GET'])
        def system_status():
            return jsonify({
                "node_id": self.port,
                "leader_id": self.leader_id,
                "is_leader": self.leader_id == self.port,
                "active_chunkservers": list(self.active_chunkservers.keys()),
                # --- NEW METRICS ---
                "algo_status": {
                    "election_state": "VOTING" if self.election_in_progress else "IDLE",
                    "active_threads": threading.active_count(),
                    "total_requests": self.request_count,
                    "clock_sync_role": "DAEMON" if self.leader_id == self.port else "CLIENT"
                }
            })

        @self.app.route('/system/replicate', methods=['POST'])
        def replicate():
            """Used by followers to apply DB updates from Leader."""
            data = request.json
            try:
                self.run_query(data['query'], data['params'], commit=True)
                return jsonify({"status": "synced"})
            except:
                return jsonify({"error": "Replication failed"}), 500

        # --- AUTHENTICATION ---
        @self.app.route('/auth/register', methods=['POST'])
        def register():
            if self.leader_id != self.port: return jsonify({"error": "Not Leader"}), 400
            data = request.json
            user_id = str(uuid.uuid4())
            pwd_hash = hashlib.sha256(data['password'].encode()).hexdigest()
            
            q = "INSERT INTO users (user_id, username, password_hash) VALUES (?, ?, ?)"
            p = (user_id, data['username'], pwd_hash)
            
            try:
                self.run_query(q, p, commit=True)
                self.replicate_to_peers(q, p)
                return jsonify({"user_id": user_id, "username": data['username']})
            except:
                return jsonify({"error": "Username exists"}), 400

        @self.app.route('/auth/login', methods=['POST'])
        def login():
            data = request.json
            pwd_hash = hashlib.sha256(data['password'].encode()).hexdigest()
            rows = self.run_query("SELECT user_id, username FROM users WHERE username=? AND password_hash=?", 
                                  (data['username'], pwd_hash))
            if rows:
                return jsonify({"user_id": rows[0][0], "username": rows[0][1]})
            return jsonify({"error": "Invalid credentials"}), 401

        # --- FILE & GFS LOGIC ---
        @self.app.route('/file/create', methods=['POST'])
        def create_file():
            if self.leader_id != self.port: return jsonify({"error": "Not Leader"}), 400
            data = request.json
            filename = data.get('filename')
            owner_id = data.get('user_id')
            file_id = f"file_{int(time.time())}"
            chunk_handle = f"chunk_{file_id}_0"
            
            # Warm-up: Check if we need to wait for heartbeats (startup race condition)
            retries = 8 
            while not self.active_chunkservers and retries > 0:
                time.sleep(0.5)
                retries -= 1

            # Load Balancing: Pick active nodes
            now = time.time()
            live_nodes = [p for p, t in self.active_chunkservers.items() if now - t < 10]
            
            if not live_nodes: 
                print("[GFS] Create failed: No live chunkservers.")
                return jsonify({"error": "No Chunkservers Available"}), 503

            # Select 3 replicas (or fewer if not enough nodes)
            replicas = live_nodes[:3]
            
            # Lease Management
            primary = self.grant_lease(chunk_handle, replicas)

            # 1. Metadata
            q1 = "INSERT INTO files (file_id, filename, size, owner_id) VALUES (?, ?, ?, ?)"
            p1 = (file_id, filename, 0, owner_id)
            self.run_query(q1, p1, commit=True)
            self.replicate_to_peers(q1, p1)

            # 2. Chunk Mapping
            q2 = "INSERT INTO chunk_mapping VALUES (?, ?, ?, ?, ?)"
            p2 = (chunk_handle, file_id, 0, primary, ",".join(map(str, replicas)))
            self.run_query(q2, p2, commit=True)
            self.replicate_to_peers(q2, p2)

            return jsonify({
                "file_id": file_id, 
                "chunk_handle": chunk_handle, 
                "replicas": replicas, 
                "primary": primary
            })

        @self.app.route('/file/lookup/<file_id>', methods=['POST'])
        def lookup_file(file_id):
            data = request.json
            user_id = data.get('user_id')
            
            # 1. Verify Existence
            file_row = self.run_query("SELECT owner_id FROM files WHERE file_id=?", (file_id,))
            if not file_row: return jsonify({"error": "Not found"}), 404
            owner = file_row[0][0]

            # 2. ACL Check
            if owner != user_id:
                perm = self.run_query("SELECT status FROM permissions WHERE file_id=? AND user_id=?", (file_id, user_id))
                if not perm or perm[0][0] != 'APPROVED':
                    return jsonify({"error": "Permission Denied"}), 403
            
            # 3. Retrieve Locations
            rows = self.run_query("SELECT chunk_handle, primary_loc, locations FROM chunk_mapping WHERE file_id=?", (file_id,))
            chunks = []
            for r in rows:
                handle, db_primary, locs_str = r
                replicas = [int(x) for x in locs_str.split(",")]
                
                # If I am leader, ensure active lease
                current_primary = db_primary
                if self.leader_id == self.port:
                    # Refresh or re-elect primary if needed
                    current_primary = self.grant_lease(handle, replicas)

                chunks.append({
                    "handle": handle,
                    "primary": current_primary,
                    "replicas": replicas
                })

            return jsonify({"chunks": chunks})

        @self.app.route('/file/list/<user_id>', methods=['GET'])
        def list_files(user_id):
            # Owned files
            owned = self.run_query("SELECT file_id, filename, owner_id FROM files WHERE owner_id=?", (user_id,))
            # Shared files
            shared = self.run_query('''
                SELECT f.file_id, f.filename, f.owner_id 
                FROM files f 
                JOIN permissions p ON f.file_id = p.file_id 
                WHERE p.user_id=? AND p.status='APPROVED'
            ''', (user_id,))
            
            res = []
            for r in owned: res.append({"id": r[0], "name": r[1], "owner": "Me", "access": "OWNER"})
            for r in shared: res.append({"id": r[0], "name": r[1], "owner": r[2], "access": "SHARED"})
            return jsonify({"files": res})

        # --- PERMISSIONS ---
        @self.app.route('/access/request', methods=['POST'])
        def request_access():
            if self.leader_id != self.port: return jsonify({"error": "Not Leader"}), 400
            data = request.json
            req_id = str(uuid.uuid4())
            
            # Check file exists
            f = self.run_query("SELECT owner_id FROM files WHERE file_id=?", (data['file_id'],))
            if not f: return jsonify({"error": "File not found"}), 404
            
            q = "INSERT INTO permissions VALUES (?, ?, ?, ?, 'PENDING')"
            p = (req_id, data['file_id'], data['user_id'], data['access_type'])
            try:
                self.run_query(q, p, commit=True)
                self.replicate_to_peers(q, p)
                return jsonify({"status": "requested"})
            except:
                return jsonify({"error": "Request pending"}), 400

        @self.app.route('/access/pending/<user_id>', methods=['GET'])
        def get_pending_requests(user_id):
            rows = self.run_query('''
                SELECT p.req_id, p.file_id, f.filename, p.user_id, u.username, p.access_type
                FROM permissions p
                JOIN files f ON p.file_id = f.file_id
                JOIN users u ON p.user_id = u.user_id
                WHERE f.owner_id=? AND p.status='PENDING'
            ''', (user_id,))
            
            return jsonify([{"req_id": r[0], "file_id": r[1], "filename": r[2], 
                             "requestor_id": r[3], "requestor_name": r[4], "type": r[5]} for r in rows])

        @self.app.route('/access/approve', methods=['POST'])
        def approve_access():
            if self.leader_id != self.port: return jsonify({"error": "Not Leader"}), 400
            data = request.json
            q = "UPDATE permissions SET status=? WHERE req_id=?"
            p = (data['action'], data['req_id'])
            self.run_query(q, p, commit=True)
            self.replicate_to_peers(q, p)
            return jsonify({"status": "updated"})

        # --- ADMIN / FAULT INJECTION ---
        @self.app.route('/admin/kill', methods=['POST'])
        def kill_node():
            def shutdown():
                time.sleep(0.5) # Wait for response to send
                print(f"[Node-{self.port}] KILLED BY ADMIN")
                os._exit(0)
            threading.Thread(target=shutdown).start()
            return jsonify({"status": "killed"})

    def run(self):
        # Start monitoring in background
        threading.Thread(target=self.monitor_leader, daemon=True).start()
        print(f"[Node-{self.port}] Master Node running (DB: {self.db_name})")
        self.app.run(port=self.port, debug=False)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python master.py <PORT> <PEER_PORTS_COMMA_SEP>")
        sys.exit(1)
    
    my_port = int(sys.argv[1])
    try:
        peer_ports = [int(p) for p in sys.argv[2].split(",")]
    except ValueError:
        peer_ports = []

    node = MasterNode(my_port, peer_ports)
    node.run()