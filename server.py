import json
import time
from http.server import SimpleHTTPRequestHandler, HTTPServer

class MultiplayerServer(SimpleHTTPRequestHandler):
    players = {}

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-type")
        self.end_headers()

    def do_POST(self):
        if self.path == '/update':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data)
                player_id = data.get('id')
                if player_id:
                    data['last_seen'] = time.time()
                    self.players[player_id] = data
                
                # Cleanup stale players (not seen for 5 seconds)
                current_time = time.time()
                active_players = {pid: p for pid, p in self.players.items() if current_time - p['last_seen'] < 5}
                
                # We need to assign it to the class level dictionary, but we can just clear and update
                MultiplayerServer.players = active_players
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                # Send back all players except the one requesting
                response_data = {pid: p for pid, p in MultiplayerServer.players.items() if pid != player_id}
                self.wfile.write(json.dumps(response_data).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    server_address = ('', 8000)
    httpd = HTTPServer(server_address, MultiplayerServer)
    print("Multiplayer Server running on port 8000...")
    httpd.serve_forever()
