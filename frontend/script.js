
let map;
let plottedMarkers = [];

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

// Add new row
function addRow() {
    const table = document.getElementById("fleetTable").getElementsByTagName("tbody")[0];
    const newRow = table.insertRow();

    newRow.innerHTML = `
        <td><input type="checkbox" class="row-checkbox"></td>
        <td><input type="text" onchange="updateMapWithAddress(this)" readonly></td>
        <td><input type="text" onchange="updateMapWithAddress(this)" readonly></td>
        <td><input type="text" readonly></td>
        <td><input type="text" onchange="updateMapWithAddress(this)" readonly></td>
        <td>
            <select onchange="updateMapWithAddress(this)" disabled>
                <option>Morning</option>
                <option>Evening</option>
                <option>Night</option>
            </select>
        </td>
        <td>
            <select disabled>
                <option>Available</option>
                <option>On Job</option>
                <option>Break</option>
            </select>
        </td>
        <td><button onclick="editRow(this)">Edit</button></td>
    `;
}

// Edit selected row
function editRow(btn) {
    const row = btn.closest("tr");
    const inputs = row.querySelectorAll("input, select");

    inputs.forEach(input => {
        input.readOnly = false;
        input.disabled = false;
        input.style.backgroundColor = "#fff";
    });

    const cell = btn.parentNode;
    cell.innerHTML = '<button onclick="saveRow(this)">Save</button>';
}

// Save edited row
function saveRow(btn) {
    const row = btn.closest("tr");
    const cells = row.getElementsByTagName("td");

    const data = {
        plate: cells[1]?.children[0].value.trim(),
        driver_name: cells[2]?.children[0].value.trim(),
        phone: cells[3]?.children[0].value.trim(),
        home_address: cells[4]?.children[0].value.trim(),
        shift: cells[5]?.children[0].value,
        status: cells[6]?.children[0].value
    };

    fetch("/api/trucks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }).then(res => res.json())
      .then(() => {
          const inputs = row.querySelectorAll("input, select");
          inputs.forEach(input => {
              input.readOnly = true;
              input.disabled = true;
              input.style.backgroundColor = "#f9f9f9";
          });

          const cell = btn.parentNode;
          cell.innerHTML = '<button onclick="editRow(this)">Edit</button>';

          updateMapWithAddress(cells[4]?.children[0]);
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

// Plot marker based on home address
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

// Delete selected rows
function deleteSelectedRows() {
    const table = document.getElementById("fleetTable").getElementsByTagName("tbody")[0];
    const rows = table.getElementsByTagName("tr");

    for (let i = rows.length - 1; i >= 0; i--) {
        const checkbox = rows[i].cells[0]?.querySelector("input[type='checkbox']");
        if (checkbox?.checked) {
            if (rows[i].marker) {
                map.geoObjects.remove(rows[i].marker);
            }
            table.deleteRow(i);
        }
    }
}

// Upload CSV
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

    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split(',');
        if (cols.length <= Math.max(requestIndex, workshopIndex)) continue;

        const requestLocation = cols[requestIndex].trim();
        const workshopLocation = cols[workshopIndex].trim();

        geocodingQueue.push({
            type: 'pair',
            requestAddress: requestLocation,
            workshopAddress: workshopLocation
        });
    }

    processNextGeocodePair();
}

function processNextGeocodePair() {
    if (geocodingQueue.length === 0) {
        alert("All locations have been plotted!");
        return;
    }

    const item = geocodingQueue.shift();

    let requestCoordsPromise = geocodeAddress(item.requestAddress + ", Istanbul, Turkey");
    let workshopCoordsPromise = geocodeAddress(item.workshopAddress + ", Istanbul, Turkey");

    Promise.all([requestCoordsPromise, workshopCoordsPromise])
        .then(([requestCoords, workshopCoords]) => {
            const requestMarker = new ymaps.Placemark(requestCoords, {
                balloonContent: "Request: " + item.requestAddress
            }, {
                preset: 'islands#blueIcon'
            });
            map.geoObjects.add(requestMarker);
            plottedObjects.push(requestMarker);

            const workshopMarker = new ymaps.Placemark(workshopCoords, {
                balloonContent: "Workshop: " + item.workshopAddress
            }, {
                preset: 'islands#greenIcon'
            });
            map.geoObjects.add(workshopMarker);
            plottedObjects.push(workshopMarker);

            setTimeout(() => {
                map.setBounds(map.geoObjects.getBounds(), { checkZoomRange: true });
            }, 500);

            processNextGeocodePair();
        })
        .catch(err => {
            console.error("Failed to geocode pair:", err);
            processNextGeocodePair();
        });
}

function geocodeAddress(address) {
    return ymaps.geocode(address).then(res => {
        return res.geoObjects.get(0).geometry.getCoordinates();
    });
}

// Login logic
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
