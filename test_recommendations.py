import requests
import time
import json
import math

url_recommendations = "http://localhost:5082/api/recommendations/7558250/transfers?limit=10"
url_squad = "http://localhost:5082/api/fpl/team/7558250/squad"

print("Fetching squad...")
squad_resp = requests.get(url_squad)
squad_data = squad_resp.json()
print("Squad loaded successfully.")

# Save squad information
squad_players = squad_data["picks"]
squad_by_id = {p["playerId"]: p for p in squad_players}

print(f"Squad contains {len(squad_players)} players.")

# We need to retry querying the transfers endpoint for up to 300 seconds if it fails or returns error
start_time = time.time()
transfers_data = None
time_total = None

while time.time() - start_time < 300:
    try:
        req_start = time.time()
        print("Sending request to recommendations API...")
        resp = requests.get(url_recommendations, timeout=120)
        req_end = time.time()
        time_total = req_end - req_start
        print(f"Request took {time_total:.4f} seconds. Status code: {resp.status_code}")
        if resp.status_code == 200:
            transfers_data = resp.json()
            break
        else:
            print(f"Status code {resp.status_code}. Retrying in 10 seconds...")
            # If server is restarting or initializing, wait and retry
    except Exception as e:
        print(f"Error connecting: {e}. Retrying in 10 seconds...")
    time.sleep(10)

if not transfers_data:
    print("Failed to get recommendations within 300 seconds.")
    # Read backend logs
    import subprocess
    logs = subprocess.check_output(["docker", "logs", "--tail", "100", "fpl-recommendation-backend-1"], stderr=subprocess.STDOUT)
    print("Backend Logs:")
    print(logs.decode("utf-8"))
    exit(1)

print("Recommendations retrieved successfully.")
print(json.dumps(transfers_data, indent=2)[:1000])

