#import necessary libraries
from fastapi import FastAPI, WebSocket
import pybullet as p
import pybullet_data
import json
import threading
import asyncio
import time

from fastapi.middleware.cors import CORSMiddleware

# Initialize FastAPI app
app = FastAPI()

# Configure CORS middleware
# This allows the frontend to communicate with the backend without CORS issues
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Start PyBullet in GUI mode on the main thread- set gravity and load the plane
physicsClient = p.connect(p.GUI)
p.setAdditionalSearchPath(pybullet_data.getDataPath())
p.setGravity(0, 0, -9.8)
p.loadURDF("plane.urdf")

# List to keep track of created object IDs
# This will be used to send updates to the frontend
object_ids = []

# Simulation loop (running in background thread)
def run_pybullet_loop():
    while True:
        p.stepSimulation()
        time.sleep(1 / 240)  # simulation is run every ~4.17 ms per step (240 Hz)

# Start the PyBullet simulation loop in a separate thread
# This allows the FastAPI server to handle WebSocket connections without blocking, 
# daemon threads die automatically when the program is killed.
threading.Thread(target=run_pybullet_loop, daemon=True).start()


#websocket part of the fastapi code
@app.websocket("/ws") 
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
#sending updates to the frontend
    print("WebSocket connection established")
    async def send_updates():
        while True:
            for idx, obj_id in enumerate(object_ids):
                try: 
                    pos, orn = p.getLinkState(obj_id, 0)[:2]
                    msg = {
                        "id": idx,
                        "position": {"x": pos[0], "y": pos[1], "z": pos[2]},
                        "quaternion": {"x": orn[0], "y": orn[1], "z": orn[2], "w": orn[3]}
                    }
                    await websocket.send_text(json.dumps(msg))
                except Exception as e:
                    print(f"Error getting link state for ID {obj_id}: {e}")
            await asyncio.sleep(1 / 30)


    send_task = asyncio.create_task(send_updates()) # This task sends updates to the frontend at 30 FPS

# Handle incoming messages from the frontend
    try:
        while True:
            msg = await websocket.receive_text()

            if msg.type == 'mesh':

                obj = json.loads(msg.payload)

                if obj["type"] == "cylinder":
                    # Step 1: Extract parameters from frontend
                    radius = max(obj["radiusTop"], obj["radiusBottom"])
                    height = obj["height"]
                    base_pos = [obj["position"]["x"], obj["position"]["y"], obj["position"]["z"]]
                    base_orn_euler = [obj["rotation"]["x"], obj["rotation"]["y"], obj["rotation"]["z"]]
                    base_orn = p.getQuaternionFromEuler(base_orn_euler)

                    # Step 2: Create collision and visual shape (optional)
                    collision_shape = p.createCollisionShape(p.GEOM_CYLINDER, radius=radius, height=height)
                    visual_shape = -1  # You can use createVisualShape if needed

                    # Step 3: Create the multibody with the cylinder as a link
                    cylinder_id = p.createMultiBody(
                        baseMass=0,  # Fixed base
                        baseCollisionShapeIndex=-1,
                        baseVisualShapeIndex=-1,
                        basePosition=base_pos,
                        baseOrientation=base_orn,
                        linkMasses=[1],
                        linkCollisionShapeIndices=[collision_shape],
                        linkVisualShapeIndices=[visual_shape],
                        linkPositions=[[0, 0, 0]],
                        linkOrientations=[[0, 0, 0, 1]],
                        linkInertialFramePositions=[[0, 0, 0]],
                        linkInertialFrameOrientations=[[0, 0, 0, 1]],
                        linkParentIndices=[0],
                        linkJointTypes=[p.JOINT_REVOLUTE],
                        linkJointAxis=[[0, 0, 1]]  # Revolute joint around Z-axis
                    )

                    p.setJointMotorControl2(
                        bodyUniqueId=cylinder_id,
                        jointIndex=0,
                        controlMode=p.VELOCITY_CONTROL,
                        targetVelocity=1.0,
                        force=10
                    )

                    # Step 4: Append to object list for frontend update
                    object_ids.append(cylinder_id)
                    print(f"Created cylinder (as link with revolute joint) with ID: {cylinder_id}")

                    await websocket.send_text(json.dumps({
                        "status": "cylinder_created",
                        "id": cylinder_id # Adjust ID for frontend compatibility
                    }))

    except Exception as e:
        print(f"WebSocket disconnected: {e}")
        send_task.cancel()
