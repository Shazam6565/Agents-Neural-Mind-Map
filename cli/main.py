import asyncio
import json
import random
import time
from datetime import datetime

# Mock data generator for now
def generate_mock_trace():
    trace_types = ["reasoning", "decision", "tool_call", "code_edit"]
    
    event = {
        "id": f"evt_{int(time.time()*1000)}",
        "timestamp": datetime.now().isoformat(),
        "type": random.choice(trace_types),
        "content": "Simulated agent activity...",
        "metadata": {
            "confidence": random.random(),
            "file": "main.py" if random.random() > 0.5 else "utils.py"
        }
    }
    return event

async def main():
    print("Starting AI Agent Mind Map CLI Wrapper...")
    print("Waiting for dashboard connection... (Mocking for now)")
    
    while True:
        event = generate_mock_trace()
        print(json.dumps(event))
        await asyncio.sleep(2)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopping CLI Wrapper.")
