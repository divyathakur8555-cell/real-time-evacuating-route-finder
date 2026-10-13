"use strict";

// ========================================
// SAFEROUTE — APPLICATION CONFIGURATION
// ========================================

const API_URL = "http://disasterplanner.local:8000";

const elements = {
    start: document.getElementById("start"),
    destination: document.getElementById("destination"),
    routeButton: document.getElementById("routeButton"),
    result: document.getElementById("result"),
    roadSelect: document.getElementById("roadSelect"),
    closeButton: document.getElementById("closeButton"),
    openButton: document.getElementById("openButton"),
    status: document.getElementById("status"),
    shelterList: document.getElementById("shelterList"),
    locationList: document.getElementById("locationList")
};

let mapData = null;
let roadLayers = [];
let markerLayers = [];
let routeLayer = null;
let requestInProgress = false;


// ========================================
// INITIALIZE THE LEAFLET MAP
// ========================================

const map = L.map("map").setView([28.894, 76.610], 13);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }
).addTo(map);


// ========================================
// HELPER: SEND API REQUESTS
// ========================================

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        let message = `Request failed (${response.status})`;

        try {
            const errorData = await response.json();
            message = errorData.detail || message;
        } catch {
            // Keep the default error message.
        }

        throw new Error(message);
    }

    return response.json();
}


// ========================================
// HELPER: DISPLAY MESSAGES
// ========================================

function showRouteMessage(message, type = "") {
    elements.result.textContent = message;
    elements.result.className = "result-box";

    if (type === "success") {
        elements.result.classList.add("route-found");
    }

    if (type === "error") {
        elements.result.classList.add("route-error");
    }
}

function showStatus(message) {
    elements.status.textContent = message;
}


// ========================================
// LOAD MAP DATA
// ========================================

async function loadMapData() {
    try {
        showStatus("Connecting to the evacuation network...");

        const data = await apiRequest("/api/map");

        if (
            !Array.isArray(data.locations) ||
            !Array.isArray(data.roads) ||
            !Array.isArray(data.shelters)
        ) {
            throw new Error("The backend returned invalid map data.");
        }

        mapData = data;

        populateDropdowns();
        displayLocations();
        displayShelters();
        renderMap();

        showStatus(
            `Network ready: ${data.locations.length} locations, ` +
            `${data.roads.length} roads, and ` +
            `${data.shelters.length} shelters.`
        );

    } catch (error) {
        console.error("Map loading error:", error);

        showStatus(
            `Unable to load the map: ${error.message}. ` +
            "Check that the backend is running."
        );
    }
}


// ========================================
// POPULATE LOCATION AND ROAD SELECTORS
// ========================================

function populateDropdowns() {
    elements.start.replaceChildren();
    elements.destination.replaceChildren();
    elements.roadSelect.replaceChildren();

    mapData.locations.forEach(location => {
        const label = `${location.id} — ${location.name}`;

        elements.start.add(
            new Option(label, location.id)
        );

        elements.destination.add(
            new Option(label, location.id)
        );
    });

    // Select different starting and ending locations.
    if (elements.destination.options.length > 1) {
        elements.destination.selectedIndex =
            elements.destination.options.length - 1;
    }

    mapData.roads.forEach((road, index) => {
        const label = `${road.from} ↔ ${road.to}`;

        elements.roadSelect.add(
            new Option(label, String(index))
        );
    });
}


// ========================================
// DISPLAY LOCATION LIST
// ========================================

function displayLocations() {
    elements.locationList.replaceChildren();

    mapData.locations.forEach(location => {
        const item = document.createElement("li");

        item.textContent = `${location.id} — ${location.name}`;

        elements.locationList.appendChild(item);
    });
}


// ========================================
// DISPLAY SHELTER INFORMATION
// ========================================

function displayShelters() {
    elements.shelterList.replaceChildren();

    if (mapData.shelters.length === 0) {
        const item = document.createElement("li");
        item.textContent = "No shelters are currently listed.";
        elements.shelterList.appendChild(item);
        return;
    }

    mapData.shelters.forEach(shelter => {
        const item = document.createElement("li");

        item.textContent =
            `${shelter.name} — Capacity: ${shelter.capacity}`;

        elements.shelterList.appendChild(item);
    });
}


// ========================================
// RENDER ROADS AND MAP MARKERS
// ========================================

function renderMap() {
    if (!mapData) return;

    // Remove previously drawn roads.
    roadLayers.forEach(layer => map.removeLayer(layer));
    roadLayers = [];

    // Remove previous location and shelter markers.
    markerLayers.forEach(layer => map.removeLayer(layer));
    markerLayers = [];

    // Remove any old highlighted route.
    clearRoute();

    const locationsById = Object.fromEntries(
        mapData.locations.map(location => [
            location.id,
            location
        ])
    );

    // Draw the road network.
    mapData.roads.forEach(road => {
        const from = locationsById[road.from];
        const to = locationsById[road.to];

        if (!from || !to) return;

        const isOpen = road.open !== false;

        const line = L.polyline(
            [
                [from.lat, from.lon],
                [to.lat, to.lon]
            ],
            {
                color: isOpen ? "#64748b" : "#dc2626",
                weight: 4,
                opacity: 0.9,
                dashArray: isOpen ? null : "8, 8"
            }
        ).addTo(map);

        line.bindPopup(
            `<strong>Road ${road.from} ↔ ${road.to}</strong><br>` +
            `Travel time: ${road.travel_time} minutes<br>` +
            `Status: ${isOpen ? "Open" : "Closed"}`
        );

        roadLayers.push(line);
    });

    // Draw location markers.
    mapData.locations.forEach(location => {
        const marker = L.marker([
            location.lat,
            location.lon
        ]).addTo(map);

        marker.bindPopup(
            `<strong>${location.name}</strong><br>` +
            `Location ID: ${location.id}`
        );

        markerLayers.push(marker);
    });

    // Draw evacuation shelter markers.
    mapData.shelters.forEach(shelter => {
        const marker = L.circleMarker(
            [shelter.lat, shelter.lon],
            {
                radius: 9,
                color: "#15803d",
                weight: 2,
                fillColor: "#22c55e",
                fillOpacity: 0.95
            }
        ).addTo(map);

        marker.bindPopup(
            `<strong>${shelter.name}</strong><br>` +
            `Capacity: ${shelter.capacity}`
        );

        markerLayers.push(marker);
    });
}


// ========================================
// CLEAR THE HIGHLIGHTED ROUTE
// ========================================

function clearRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
}


// ========================================
// CALCULATE THE BEST AVAILABLE ROUTE
// ========================================

async function calculateRoute() {
    if (requestInProgress) return;

    const start = elements.start.value;
    const destination = elements.destination.value;

    if (!start || !destination) {
        showRouteMessage(
            "Please select a starting location and destination.",
            "error"
        );
        return;
    }

    if (start === destination) {
        showRouteMessage(
            "Choose two different locations to plan a route.",
            "error"
        );
        return;
    }

    requestInProgress = true;
    elements.routeButton.disabled = true;
    elements.routeButton.textContent = "Calculating route...";

    showRouteMessage("Finding the shortest available route...");
    clearRoute();

    try {
        const data = await apiRequest("/api/routes", {
            method: "POST",
            body: JSON.stringify({
                start,
                destination
            })
        });

        if (
            data.status !== "route_found" ||
            !Array.isArray(data.path) ||
            data.path.length === 0
        ) {
            showRouteMessage(
                "No open route is available. Try another destination " +
                "or reopen a road.",
                "error"
            );
            return;
        }

        showRouteMessage(
            `Recommended route\n` +
            `${data.path.join(" → ")}\n\n` +
            `Estimated travel time: ` +
            `${data.estimated_travel_time} minutes`,
            "success"
        );

        drawRoute(data.path);

        showStatus("Route calculated successfully.");

    } catch (error) {
        console.error("Route calculation error:", error);

        showRouteMessage(
            `Route calculation failed: ${error.message}`,
            "error"
        );

        showStatus("Unable to calculate a route.");
    } finally {
        requestInProgress = false;
        elements.routeButton.disabled = false;
        elements.routeButton.textContent = "➤ Find Best Route";
    }
}


// ========================================
// DRAW THE ROUTE IN BLUE
// ========================================

function drawRoute(path) {
    clearRoute();

    const locationsById = Object.fromEntries(
        mapData.locations.map(location => [
            location.id,
            location
        ])
    );

    const coordinates = path
        .map(id => locationsById[id])
        .filter(Boolean)
        .map(location => [
            location.lat,
            location.lon
        ]);

    if (coordinates.length < 2) return;

    routeLayer = L.polyline(coordinates, {
        color: "#2563eb",
        weight: 7,
        opacity: 1,
        lineCap: "round",
        lineJoin: "round"
    }).addTo(map);

    routeLayer.bindPopup(
        `<strong>Recommended evacuation route</strong><br>` +
        `${path.join(" → ")}`
    );

    map.fitBounds(routeLayer.getBounds(), {
        padding: [35, 35],
        maxZoom: 15
    });
}


// ========================================
// CLOSE OR REOPEN A ROAD
// ========================================

async function updateRoad(action) {
    const selectedIndex = elements.roadSelect.value;

    if (selectedIndex === "") {
        showStatus("Please select a road first.");
        return;
    }

    const roadIndex = Number(selectedIndex);
    const road = mapData?.roads[roadIndex];

    if (!road) {
        showStatus("The selected road could not be found.");
        return;
    }

    const actionLabel = action === "close" ? "close" : "reopen";

    const button =
        action === "close"
            ? elements.closeButton
            : elements.openButton;

    button.disabled = true;
    showStatus(`Attempting to ${actionLabel} road...`);

    try {
        const data = await apiRequest(
            `/api/roads/${roadIndex}/${action}`,
            { method: "POST" }
        );

        showStatus(
            data.message ||
            `Road ${road.from} ↔ ${road.to} updated.`
        );

        // Reload current road states.
        await loadMapData();

        // Recalculate using the updated network.
        await calculateRoute();

    } catch (error) {
        console.error("Road update error:", error);

        showStatus(
            `Could not ${actionLabel} the road: ${error.message}`
        );
    } finally {
        button.disabled = false;
    }
}


// ========================================
// CONNECT THE HTML BUTTONS
// ========================================

elements.routeButton.addEventListener(
    "click",
    calculateRoute
);

elements.closeButton.addEventListener(
    "click",
    () => updateRoad("close")
);

elements.openButton.addEventListener(
    "click",
    () => updateRoad("open")
);


// ========================================
// START THE APPLICATION
// ========================================

loadMapData();