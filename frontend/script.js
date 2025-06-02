
let map;
let plottedObjects = [];
let geocodingQueue = [];

function checkAuth() {
    const user = localStorage.getItem("user");
    if (!user) {
        openTab(null, "login");
    } else {
        openTab(null, "dashboard");
    }
}

function openTab(evt, tabName) {
    const tabs = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].style.display = "none";
    }

    document.getElementById(tabName).style.display = "block";

    if (tabName === 'map' && !map) initMap();
    if (tabName === 'dashboard') loadSavedDrivers();
    if (tabName === 'heatmap') initHeatmap();
    if (tabName === 'schedule') fetchAssignments();
}

function initMap() {
    ymaps.ready(() => {
        map = new ymaps.Map('yandex-map', {
            center: [41.0130, 28.9784],
            zoom: 11
        });
    });
}

function addRowToTable(table, rowData = []) {
    const newRow = table.insertRow();
    newRow.marker = null;

    const fields = [
        { value: "", type: "checkbox" },
        { value: rowData[0] || "", type: "text" },
        { value: rowData[1] || "", type: "text" },
        { value: rowData[2] || "", type: "text" },
        { value: rowData[3] || "", type: "text" },
        { value: rowData[4] || "Morning", type: "select", options: ["Morning", "Evening", "Night"] },
        { value: rowData[5] || "Available", type: "select", options: ["Available", "On Job", "Break"] },
        { value: "Edit", button: "editRow(this)", style: "background:#007BFF;color:white;" },
    ];

    fields.forEach((field, index) => {
        const cell = newRow.insertCell();
        if (field.type === "checkbox") {
            cell.innerHTML = "<input type='checkbox' class='row-checkbox'>";
        } else if (field.type === "select") {
            let html = "<select onchange='updateMapWithAddress(this)'>";
            field.options.forEach(opt => {
                html += `<option ${opt === field.value ? "selected" : ""}>${opt}</option>`;
            });
            html += "</select>";
            cell.innerHTML = html;
        } else if (field.button) {
            cell.innerHTML = `<button onclick='${field.button}' style='${field.style || ""}'>${field.value}</button>`;
        } else {
            cell.innerHTML = `<input type='text' value='${field.value}' onchange='updateMapWithAddress(this)' readonly>`;
        }
    });

    setTimeout(() => {
        const addressInput = newRow.cells[4]?.children[0];
        if (addressInput && addressInput.value.trim()) {
            updateMapWithAddress(addressInput);
        }
    }, 100);
}

function updateMapWithAddress(inputCell) {
    const row = inputCell.closest("tr");

    const plateInput = row.cells[1]?.children[0];
    const nameInput = row.cells[2]?.children[0];
    const phoneInput = row.cells[3]?.children[0];
    const addressInput = inputCell;

    const plate = plateInput?.value.trim() || "";
    const name = nameInput?.value.trim() || "";
    const phone = phoneInput?.value.trim() || "";
    const address = addressInput?.value.trim() || "";

    if (!map || !address) return;

    const fullAddress = address + ", Istanbul, Turkey";

    if (row.marker) {
        map.geoObjects.remove(row.marker);
        delete row.marker;
    }

    ymaps.geocode(fullAddress).then(res => {
        const coords = res.geoObjects.get(0).geometry.getCoordinates();

        const placemark = new ymaps.Placemark(coords, {
            balloonContent: `
                <b>Driver:</b> ${name}<br>
                <b>Plate:</b> ${plate}<br>
                <b>Phone:</b> ${phone}<br>
                <b>Address:</b> ${fullAddress}
            `
        }, {
            preset: 'islands#circleIcon',
            iconColor: '#E63E6D'
        });

        map.geoObjects.add(placemark);
        row.marker = placemark;

        map.setBounds(map.geoObjects.getBounds(), { checkZoomRange: true });
    }).catch(err => {
        console.error("Geocoding failed:", err);
    });
}

// Load saved drivers from backend
function loadSavedDrivers() {
    const table = document.getElementById("fleetTable").getElementsByTagName("tbody")[0];
    table.innerHTML = "";

    fetch("/api/trucks")
        .then(res => res.json())
        .then(data => {
            data.forEach(rowData => {
                addRowToTable(table, rowData);
            });
        });
}

// Parse and plot CSV jobs with routing
function parseAndPlotCSV(csvData) {
    const rows = csvData.split(/\r\n|\n/);
    const headers = rows[0].split(',');
    const requestIndex = headers.indexOf('request_location');
    const workshopIndex = headers.indexOf('workshop_location');

    if (requestIndex === -1 || workshopIndex === -1) {
        alert("CSV must contain 'request_location' and 'workshop_location'");
        return;
    }

    geocodingQueue = [];

    fetch("/api/trucks")
        .then(res => res.json())
        .then(drivers => {
            for (let i = 1; i < rows.length; i++) {
                const cols = rows[i].split(',');
                if (cols.length <= Math.max(requestIndex, workshopIndex)) continue;

                const driver = drivers.find(d => d[1] === cols[1]); // match by driver name
                const homeAddress = driver ? driver[3] : cols[1]; // fallback to default address
                const requestLocation = cols[requestIndex].trim();
                const workshopLocation = cols[workshopIndex].trim();

                geocodingQueue.push({
                    type: 'pair',
                    home_address: homeAddress,
                    requestAddress: requestLocation,
                    workshopAddress: workshopLocation
                });
            }

            processNextGeocodePair();
        });
}

// Process next pair with routing
function processNextGeocodePair() {
    if (geocodingQueue.length === 0) {
        alert("All jobs plotted with routes!");
        return;
    }

    const item = geocodingQueue.shift();

    Promise.all([
        geocodeAddress(item.home_address + ", Istanbul, Turkey"),
        geocodeAddress(item.requestAddress + ", Istanbul, Turkey"),
        geocodeAddress(item.workshopAddress + ", Istanbul, Turkey")
    ]).then(([homeCoords, jobCoords, workshopCoords]) => {

        // Route: Home → Job
        ymaps.route([homeCoords, jobCoords]).then(route => {
            const distance = (route.getLength() / 1000).toFixed(1);
            const time = Math.round(route.getTime() / 60);

            const routePolyline = new ymaps.Polyline(
                [homeCoords, jobCoords], {}, {
                    strokeColor: '#FF0000',
                    strokeWidth: 4,
                    strokeOpacity: 0.8
                }
            );

            map.geoObjects.add(routePolyline);
            plottedObjects.push(routePolyline);

            const jobPlacemark = new ymaps.Placemark(jobCoords, {
                balloonContent: `
                    <b>Route: Home → Job</b><br>
                    <b>Distance:</b> ${distance} km<br>
                    <b>Time:</b> ${time} min
                `
            }, {
                preset: 'islands#blueIcon'
            });

            map.geoObjects.add(jobPlacemark);
            plottedObjects.push(jobPlacemark);
        });

        // Route: Job → Workshop
        ymaps.route([jobCoords, workshopCoords]).then(route => {
            const distance = (route.getLength() / 1000).toFixed(1);
            const time = Math.round(route.getTime() / 60);

            const routePolyline = new ymaps.Polyline(
                [jobCoords, workshopCoords], {}, {
                    strokeColor: '#00FF00',
                    strokeWidth: 4,
                    strokeOpacity: 0.8
                }
            );

            map.geoObjects.add(routePolyline);
            plottedObjects.push(routePolyline);

            const workshopPlacemark = new ymaps.Placemark(workshopCoords, {
                balloonContent: `
                    <b>Route: Job → Workshop</b><br>
                    <b>Distance:</b> ${distance} km<br>
                    <b>Time:</b> ${time} min
                `
            }, {
                preset: 'islands#greenIcon'
            });

            map.geoObjects.add(workshopPlacemark);
            plottedObjects.push(workshopPlacemark);
        });

        processNextGeocodePair();
    }).catch(err => {
        console.error("Failed to geocode one or more addresses:", err);
        processNextGeocodePair();
    });
}

function geocodeAddress(address) {
    return ymaps.geocode(address).then(res => {
        return res.geoObjects.get(0).geometry.getCoordinates();
    });
}

function uploadCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    if (!file) {
        alert("Please select a CSV file.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        parseAndPlotCSV(text);
    };
    reader.readAsText(file);
}

function initHeatmap() {
    plottedObjects.forEach(obj => map.geoObjects.remove(obj));
    plottedObjects = [];

    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];

    if (!file) {
        alert("No CSV uploaded yet.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const csvData = e.target.result;
        parseCSVForHeatmap(csvData);
    };
    reader.readAsText(file);
}

function parseCSVForHeatmap(csvData) {
    const rows = csvData.split(/\r\n|\n/);
    const headers = rows[0].split(',');
    const requestIndex = headers.indexOf('request_location');

    if (requestIndex === -1) {
        alert("CSV must contain 'request_location' column.");
        return;
    }

    const requestLocations = [];

    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split(',');
        if (cols.length <= requestIndex) continue;

        const requestLocation = cols[requestIndex].trim();
        requestLocations.push(requestLocation + ", Istanbul, Turkey");
    }

    createHeatmap(requestLocations);
}

function createHeatmap(requestLocations) {
    const promises = requestLocations.map(addr => {
        return ymaps.geocode(addr).then(res => {
            return res.geoObjects.get(0).geometry.getCoordinates();
        }).catch(() => null);
    });

    Promise.all(promises).then(coordsList => {
        const validCoords = coordsList.filter(coord => coord !== null);

        if (!heatmapLayer) {
            heatmapLayer = new ymaps.heat.Map(map, validCoords, {
                radius: 15,
                dissipating: false,
                opacity: 0.6,
                colorScheme: 'hot'
            });
        } else {
            heatmapLayer.setPoints(validCoords);
        }

        map.setBounds(heatmapLayer.getBounds(), { checkZoomRange: true });
    });
}

function fetchAssignments() {
    fetch("/api/assign_jobs")
        .then(res => res.json())
        .then(data => {
            let html = "<ul>";
            data.forEach(assign => {
                html += `
                    <li>
                        Job ${assign.job_id} → Assigned to Driver ${assign.driver_id + 1} (${assign.assigned_to}), 
                        ${assign.distance_km} km away
                    </li>
                `;
            });
            html += "</ul>";
            document.getElementById("scheduleOutput").innerHTML = html;
        })
        .catch(err => {
            document.getElementById("scheduleOutput").innerHTML = "<p>Error fetching assignments.</p>";
            console.error("Assignment error:", err);
        });
}

function login() {
    const user = document.getElementById("loginUser").value;
    const pass = document.getElementById("loginPass").value;

    if (user === "admin" && pass === "admin") {
        localStorage.setItem("user", JSON.stringify({ role: "admin" }));
        alert("Logged in as admin");
        openTab(null, "dashboard");
    } else {
        document.getElementById("loginStatus").innerText = "Invalid credentials.";
    }
}

function checkAuth() {
    const user = localStorage.getItem("user");
    if (!user) {
        openTab(null, "login");
    } else {
        openTab(null, "dashboard");
    }
}
