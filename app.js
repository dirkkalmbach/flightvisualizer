const AIRPORT_COORDS = {
    PVG: [121.8052, 31.1443],
    PEK: [116.5880, 40.0799],
    TPE: [121.2332, 25.0777],
    SHA: [121.3362, 31.1979],
    ICN: [126.4505, 37.4602],
    GMP: [126.7906, 37.5583],
    HKG: [113.9145, 22.3080],
    DXB: [55.3644, 25.2528],
    FRA: [8.5706, 50.0333],
    PMI: [2.7388, 39.5517],
    CJU: [126.4928, 33.5104],
    DLU: [100.3190, 25.6490],
    SIN: [103.9894, 1.3644],
    KUL: [101.7099, 2.7456],
    BKK: [100.7501, 13.6900],
    DPS: [115.1672, -8.7482],
    KIX: [135.2440, 34.4347],
    LAX: [-118.4085, 33.9425],
    TSA: [121.5519, 25.0694]
};

let svg, projection, pathGen, gMap, gRoutes, gAirports;
let flights = [];
let visibleAirports = new Set();
let routeCounts = {};
let routePaths = {};
let routeLabels = {};
let index = 0;
let playing = false;
let speed = 1500;
let timer = null;
let totalDistance = 0;
let totalCO2 = 0;

function parseFlightDate(f) {
    return new Date(f.Date + " " + f.Year);
}

function initMap() {
    svg = d3.select("svg");
    const w = window.innerWidth;
    const h = window.innerHeight;

    projection = d3.geoNaturalEarth1()
        .scale(w / 5.5)
        .translate([w / 2, h / 2]);

    pathGen = d3.geoPath().projection(projection);

    gMap = svg.append("g").attr("class", "map-layer");
    gRoutes = svg.append("g").attr("class", "routes-layer");
    gAirports = svg.append("g").attr("class", "airports-layer");

    const zoom = d3.zoom()
        .scaleExtent([1, 12])
        .on("zoom", (e) => {
            gMap.attr("transform", e.transform);
            gRoutes.attr("transform", e.transform);
            gAirports.attr("transform", e.transform);
        });

    svg.call(zoom);
}

function loadData() {
    return Promise.all([
        d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
        d3.csv("data/flugdaten_alt.csv")
    ]).then(([world, data]) => {
        flights = data.sort((a, b) => parseFlightDate(a) - parseFlightDate(b));

        const countries = topojson.feature(world, world.objects.countries);
        gMap.selectAll("path")
            .data(countries.features)
            .enter()
            .append("path")
            .attr("class", "country")
            .attr("d", pathGen);

        return flights;
    });
}

function showAirport(code, name) {
    if (visibleAirports.has(code)) return;
    if (!AIRPORT_COORDS[code]) return;
    visibleAirports.add(code);

    const [x, y] = projection(AIRPORT_COORDS[code]);

    gAirports.append("circle")
        .attr("class", "airport-dot")
        .attr("data-code", code)
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", 3)
        .transition()
        .duration(400)
        .style("opacity", 0.9);

    gAirports.append("text")
        .attr("class", "airport-label")
        .attr("x", x + 6)
        .attr("y", y + 3)
        .text(code)
        .transition()
        .duration(400)
        .style("opacity", 1);
}

function makeRoute(fromCode, toCode) {
    const from = AIRPORT_COORDS[fromCode];
    const to = AIRPORT_COORDS[toCode];
    if (!from || !to) return null;
    return {
        type: "LineString",
        coordinates: [from, to]
    };
}

function routeKey(a, b) {
    return [a, b].sort().join("-");
}

function drawFlight(f, i) {
    const geo = makeRoute(f.FromCode, f.ToCode);
    if (!geo) return;

    showAirport(f.FromCode, f.From);
    showAirport(f.ToCode, f.To);

    const key = routeKey(f.FromCode, f.ToCode);
    const isBusiness = f.Class === "Business";

    if (routeCounts[key]) {
        routeCounts[key]++;
        const count = routeCounts[key];
        const existingPath = routePaths[key];

        const newWidth = 1.4 + (count - 1) * 0.8;
        existingPath
            .transition("pulse")
            .duration(200)
            .style("opacity", 1)
            .attr("stroke-width", newWidth + 1.5)
            .transition()
            .duration(500)
            .style("opacity", 0.7)
            .attr("stroke-width", newWidth);

        if (isBusiness) existingPath.classed("route-business", true);

        const from = AIRPORT_COORDS[f.FromCode];
        const to = AIRPORT_COORDS[f.ToCode];
        const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
        const [mx, my] = projection(mid);

        if (routeLabels[key]) {
            routeLabels[key]
                .text("×" + count)
                .attr("x", mx)
                .attr("y", my - 6)
                .transition().duration(200)
                .style("opacity", 1)
                .attr("font-size", Math.min(9 + count, 14) + "px");
        } else {
            const label = gRoutes.append("text")
                .attr("class", "route-count")
                .attr("data-key", key)
                .attr("x", mx)
                .attr("y", my - 6)
                .text("×" + count)
                .style("opacity", 0);
            label.transition().duration(400).style("opacity", 1);
            routeLabels[key] = label;
        }
    } else {
        routeCounts[key] = 1;

        const routePath = gRoutes.append("path")
            .datum(geo)
            .attr("class", "route" + (isBusiness ? " route-business" : ""))
            .attr("data-key", key)
            .attr("d", pathGen(geo));

        const totalLen = routePath.node().getTotalLength();

        routePath
            .attr("stroke-dasharray", totalLen)
            .attr("stroke-dashoffset", totalLen)
            .transition()
            .duration(speed * 0.7)
            .ease(d3.easeQuadOut)
            .attr("stroke-dashoffset", 0)
            .style("opacity", 0.7);

        routePaths[key] = routePath;
    }

    const dist = +f.Distance || 0;
    const co2 = +f.CO2 || 0;
    totalDistance += dist;
    totalCO2 += co2;

    const date = parseFlightDate(f);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    d3.select("#year-display")
        .text(date.getFullYear());

    d3.select("#flight-info").html(
        `<div class="route-label">${f.From} → ${f.To}</div>` +
        `${f.Airline} · ${f.Flight} · ${f.Class}` +
        (dist ? ` · ${dist.toLocaleString()} km` : "")
    );

    d3.select("#stats")
        .style("opacity", 1)
        .html(
            `<div><span class="stat-value">${i + 1}</span></div>` +
            `<div class="stat-label">Flights</div>` +
            `<div style="margin-top:8px"><span class="stat-value">${totalDistance.toLocaleString()}</span></div>` +
            `<div class="stat-label">Total km</div>` +
            `<div style="margin-top:8px"><span class="stat-value">${totalCO2.toLocaleString()}</span></div>` +
            `<div class="stat-label">Total CO₂ kg</div>` +
            `<div style="margin-top:8px"><span class="stat-value">${visibleAirports.size}</span></div>` +
            `<div class="stat-label">Airports</div>`
        );

    d3.select("#progress")
        .style("width", ((i + 1) / flights.length * 100) + "%");
}

function step() {
    if (!playing) return;
    if (index >= flights.length) {
        playing = false;
        d3.select("#btn-play").classed("active", false);
        return;
    }

    drawFlight(flights[index], index);
    index++;
    timer = setTimeout(step, speed);
}

function play() {
    if (playing) return;
    if (index >= flights.length) reset();
    playing = true;
    d3.select("#btn-play").classed("active", true);
    step();
}

function pause() {
    playing = false;
    clearTimeout(timer);
    d3.select("#btn-play").classed("active", false);
}

function reset() {
    pause();
    index = 0;
    totalDistance = 0;
    totalCO2 = 0;
    visibleAirports.clear();
    routeCounts = {};
    routePaths = {};
    routeLabels = {};
    gRoutes.selectAll(".route, .route-count").remove();
    gAirports.selectAll(".airport-dot, .airport-label").remove();
    d3.select("#year-display").text("----");
    d3.select("#flight-info").html("");
    d3.select("#stats").style("opacity", 0);
    d3.select("#progress").style("width", "0%");
}

function setSpeed(v) {
    speed = +v;
}

function showAll() {
    pause();
    while (index < flights.length) {
        drawFlight(flights[index], index);
        index++;
    }
}

function intro() {
    setTimeout(() => {
        const el = document.getElementById("intro");
        el.style.opacity = "0";
        setTimeout(() => {
            el.remove();
            play();
        }, 1500);
    }, 800);
}

document.addEventListener("DOMContentLoaded", () => {
    initMap();
    loadData().then(() => intro());

    document.getElementById("btn-play").addEventListener("click", play);
    document.getElementById("btn-pause").addEventListener("click", pause);
    document.getElementById("btn-reset").addEventListener("click", reset);
    document.getElementById("btn-all").addEventListener("click", showAll);
    document.getElementById("speed").addEventListener("change", function () {
        setSpeed(this.value);
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === " ") { e.preventDefault(); playing ? pause() : play(); }
        if (e.key === "r") reset();
    });

    window.addEventListener("resize", () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        projection.scale(w / 5.5).translate([w / 2, h / 2]);
        gMap.selectAll("path").attr("d", pathGen);
        gRoutes.selectAll(".route").attr("d", d => pathGen(d));
        gRoutes.selectAll(".route-count").each(function () {
            const el = d3.select(this);
            const key = el.attr("data-key");
            if (!key) return;
            const codes = key.split("-");
            const from = AIRPORT_COORDS[codes[0]];
            const to = AIRPORT_COORDS[codes[1]];
            if (from && to) {
                const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
                const [mx, my] = projection(mid);
                el.attr("x", mx).attr("y", my - 6);
            }
        });
        gAirports.selectAll(".airport-dot").each(function () {
            const el = d3.select(this);
            const code = el.attr("data-code");
            if (code && AIRPORT_COORDS[code]) {
                const [x, y] = projection(AIRPORT_COORDS[code]);
                el.attr("cx", x).attr("cy", y);
            }
        });
        gAirports.selectAll(".airport-label").each(function () {
            const el = d3.select(this);
            const code = el.text();
            if (AIRPORT_COORDS[code]) {
                const [x, y] = projection(AIRPORT_COORDS[code]);
                el.attr("x", x + 6).attr("y", y + 3);
            }
        });
    });
});
