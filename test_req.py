import sys
import traceback
from app import app, db

# Setup test client
client = app.test_client()

print("Sending request to /api/auth/request-registration...")
try:
    response = client.post('/api/auth/request-registration', json={'email': 'testuser123@google.com'})
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.get_json()}")
except Exception as e:
    print("Exception occurred during request:")
    traceback.print_exc()
