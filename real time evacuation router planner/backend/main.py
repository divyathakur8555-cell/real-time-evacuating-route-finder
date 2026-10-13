import os

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

API_KEY = os.getenv("ORS_API_KEY")

app = FastAPI(title="Disaster Evacuation Route Planner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://disasterplanner.local"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

class Coordinate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)

class RouteRequest(BaseModel):
    start: Coordinate
    destination: Coordinate

@app.get("/")
def home():
    return {
        "status": "online",
        "routing": "OpenRouteService",
        "emergency_verified": False
    }

@app.post("/api/route")
async def calculate_route(request: RouteRequest):
    if not API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Routing API key is not configured."
        )

    url = (
        "https://api.openrouteservice.org/"
        "v2/directions/driving-car/geojson"
    )

    payload = {
        "coordinates": [
            [request.start.lon, request.start.lat],
            [request.destination.lon, request.destination.lat]
        ]
    }

    headers = {
        "Authorization": API_KEY,
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                url,
                json=payload,
                headers=headers
            )

        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="Routing service could not calculate the route."
            )

        data = response.json()
        routes = data.get("features", [])

        if not routes:
            raise HTTPException(
                status_code=404,
                detail="No route was found."
            )

        feature = routes[0]
        summary = feature["properties"]["summary"]

        return {
            "status": "route_calculated",
            "emergency_verified": False,
            "warning": (
                "This route has not been verified against live "
                "hazards, road closures, or official evacuation orders."
            ),
            "distance_km": round(summary["distance"] / 1000, 2),
            "estimated_minutes": round(summary["duration"] / 60, 1),
            "geometry": feature["geometry"]
        }

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Routing service timed out. Try again."
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Routing service is temporarily unreachable."
        )

