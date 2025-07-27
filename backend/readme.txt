                         ┌──────────────────────┐
                         │   FastAPI Startup    │
                         └────────┬─────────────┘
                                  │
                                  ▼
                      ┌──────────────────────────┐
                      │ Initialize PyBullet GUI  │
                      │ - Gravity                │
                      │ - Plane URDF             │
                      └────────┬─────────────────┘
                               │
        ┌──────────────────────┼────────────────────────────┐
        │                      │                            │
        ▼                      ▼                            ▼
┌──────────────┐    ┌──────────────────────┐      ┌─────────────────────────┐
│ Main Thread  │    │ Simulation Thread    │      │ WebSocket Thread (each) │
│              │    │                      │      │                         │
│ CORS setup   │    │ while True:          │      │ On /ws connect:         │
│ FastAPI App  │    │   p.stepSimulation() │      │   websocket.accept()    │
│              │    │   sleep(1/240)       │      │                         │
└─────┬────────┘    └─────────┬────────────┘      └─────────────┬──────────┘
      │                      Shared: object_ids                │
      ▼                                                        ▼
Create object from frontend                             Start `send_updates()` task
  - parse cylinder props                                 - loop every 1/30s
  - createCollisionShape                                 - send obj positions
  - createMultiBody                                      - uses object_ids
  - append to object_ids
      │                                                        │
      ▼                                                        ▼
Send confirmation to frontend                       Terminate on exception
      │                                                        │
      └──────────────────────────────┬─────────────────────────┘
                                     ▼
                           ┌────────────────────┐
                           │ Shared Variables   │
                           │ - object_ids       │
                           │ - physicsClient    │
                           └────────────────────┘
