import os, json, requests

BASE_URL = os.getenv("PRIVORA_API", "http://localhost:4000")

def submit_proof(payload: dict):
    """Submit proof to Privora API and return response JSON."""
    resp = requests.post(f"{BASE_URL}/submit", json={"payload": payload})
    resp.raise_for_status()
    return resp.json()
