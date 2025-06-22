from fastapi import FastAPI
from api_v1.endpoints import router
from storage import init_storage_dir

app = FastAPI()

# Initialize trade data folder
init_storage_dir()

# Mount the API endpoints
app.include_router(router)
