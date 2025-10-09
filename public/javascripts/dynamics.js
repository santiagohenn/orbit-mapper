let group, staticObjects, camera, renderer, pointsMaterial;

const cesiumContainer = document.getElementById('cesiumContainer');
const propagateFromTLE = document.getElementById('propagateFromTLE');
const propagateFromElements = document.getElementById('propagateFromElements');
const clearButton = document.getElementById('clearButton');
const satCoordinatesJSON = document.getElementById('satCoordinatesJSON');
const tleText = document.getElementById('tleTextArea');
const eciCoordinates = document.getElementById('eciCoordinates');
const ecefCoordinates = document.getElementById('ecefCoordinates');
const jsonEciCoordinates = document.getElementById('jsonECI');
const datePicker = document.getElementById('datepicker');
const timestepInSecondsField = document.getElementById('timestepInSeconds');
const addStation = document.getElementById('addStation');
const observerCoordinates = document.getElementById('observerCoordinates');
const computeAccess = document.getElementById('computeAccess');
const accessTextArea = document.getElementById('accessTextArea');
const colorTextArea = document.getElementById('color-picker');

const showSunlightCheckbox = document.getElementById('showSunlight');
const showEQPlaneCheckbox = document.getElementById('showEQPlane');
const showLabelsCheckbox = document.getElementById('showLabels');
const showIconsCheckbox = document.getElementById('showIcons');

const takeSnapshotButton = document.getElementById('takeSnapshot');
const populateWalkerDeltaButton = document.getElementById('populateWalkerDelta');

let satelliteStack = [];
let satellitePaths = [];
let satelliteIcons = [];
let satelliteLabels = [];
let currentSat = "";

import { buildLine1, buildLine2 } from './tle.js';
import { randomName, addSecondsToIso8601, getOrbitalPeriodMinutes } from './propagatorUtils.js';

const picker = new easepick.create({
    element: "#datepicker",
    css: [
        "/stylesheets/index.css",
        '/stylesheets/datepicker.css',
    ],
    zIndex: 10,
    format: "YYYY-MM-DDTHH:mm:ss.sss",
    TimePlugin: {
        seconds: true
    },
    plugins: [
        "RangePlugin",
        "TimePlugin"
    ],
    setup(picker) {
        picker.on('select', (e) => {
            updateGlobalDates();
            console.log("Date changed");
        });
    }
});

// DEBUG INSTRUMENTATION - Add these functions for temporary debugging
function addWalkerDebugConsole() {
    console.log("=== WALKER DEBUG INSTRUMENTATION ACTIVE ===");

    // Monitor clock changes
    const originalSetClock = function (startTime, stopTime, currentTime) {
        console.log(`[CLOCK] Setting: start=${startTime}, stop=${stopTime}, current=${currentTime}`);
    };

    // Monitor entity creation
    let entityCount = 0;
    const originalAddEntity = viewer.entities.add.bind(viewer.entities);
    viewer.entities.add = function (entity) {
        entityCount++;
        console.log(`[ENTITY] Added #${entityCount}: ${entity.id || 'unnamed'} (type: ${entity.billboard ? 'billboard' : entity.point ? 'point' : entity.label ? 'label' : entity.polyline ? 'polyline' : 'other'})`);
        return originalAddEntity(entity);
    };

    // Monitor position property creation and sampling
    setInterval(() => {
        const currentTime = viewer.clock.currentTime;
        const entities = viewer.entities.values;
        let activeCount = 0;
        let frozenCount = 0;
        let precisionIssues = [];

        for (let entity of entities) {
            if (entity.position && typeof entity.position.getValue === 'function') {
                const pos = entity.position.getValue(currentTime);
                if (pos) {
                    activeCount++;
                } else {
                    frozenCount++;

                    // ENHANCED PRECISION DEBUGGING: Try to find nearby valid times
                    let nearestValidTime = null;
                    let minTimeDiff = Infinity;

                    // Check if this is a SampledPositionProperty with timing issues
                    if (entity.position._property && entity.position._property._times) {
                        const sampleTimes = entity.position._property._times;
                        for (let sampleTime of sampleTimes) {
                            const timeDiff = Math.abs(Cesium.JulianDate.secondsDifference(currentTime, sampleTime));
                            if (timeDiff < minTimeDiff) {
                                minTimeDiff = timeDiff;
                                nearestValidTime = sampleTime;
                            }
                        }
                    }

                    precisionIssues.push({
                        entityId: entity.id,
                        currentTimeIso: Cesium.JulianDate.toIso8601(currentTime),
                        nearestSampleDiff: minTimeDiff,
                        clockStartDiff: Cesium.JulianDate.secondsDifference(currentTime, viewer.clock.startTime),
                        clockStopDiff: Cesium.JulianDate.secondsDifference(viewer.clock.stopTime, currentTime)
                    });

                    if (precisionIssues.length <= 3) { // Limit spam
                        console.warn(`[FROZEN] Entity ${entity.id} has no position at current time`);
                        console.warn(`[PRECISION] Current: ${Cesium.JulianDate.toIso8601(currentTime)}`);
                        console.warn(`[PRECISION] Nearest sample: ${minTimeDiff.toFixed(6)}s away`);
                        console.warn(`[PRECISION] Clock range: ${Cesium.JulianDate.secondsDifference(currentTime, viewer.clock.startTime).toFixed(3)}s from start`);
                    }
                }
            }
        }

        if (frozenCount > 0) {
            console.log(`[STATUS] Active: ${activeCount}, Frozen: ${frozenCount}, Clock: ${Cesium.JulianDate.toIso8601(currentTime)}`);

            // Suggest precision fixes if consistent patterns found
            const avgTimeDiff = precisionIssues.reduce((sum, issue) => sum + issue.nearestSampleDiff, 0) / precisionIssues.length;
            if (avgTimeDiff < 1.0 && avgTimeDiff > 0.001) {
                console.log(`[PRECISION] Suggestion: Average sample time diff is ${avgTimeDiff.toFixed(6)}s - this indicates floating point precision issues`);
            }
        }
    }, 5000);
}

// PRECISION TESTING UTILITIES
function testTimePrecision() {
    console.log("=== TESTING TIME PRECISION ===");

    const now = new Date();
    now.setMilliseconds(0); // Remove milliseconds

    const julianNow = Cesium.JulianDate.fromDate(now);
    const iso8601 = Cesium.JulianDate.toIso8601(julianNow);
    const parsedBack = Cesium.JulianDate.fromIso8601(iso8601);

    const diff = Cesium.JulianDate.secondsDifference(parsedBack, julianNow);

    console.log("Original Date:", now.toISOString());
    console.log("Julian Date:", julianNow);
    console.log("ISO8601:", iso8601);
    console.log("Parsed Back:", parsedBack);
    console.log("Difference (seconds):", diff);

    if (Math.abs(diff) < 0.000001) {
        console.log("✅ Time precision is good");
    } else {
        console.log("❌ Time precision issue detected");
    }

    // Test addSeconds precision
    const future = Cesium.JulianDate.addSeconds(julianNow, 60, new Cesium.JulianDate());
    const diff60 = Cesium.JulianDate.secondsDifference(future, julianNow);
    console.log("60-second addition test:", diff60 === 60 ? "✅ Exact" : `❌ Off by ${Math.abs(diff60 - 60)} seconds`);

    return Math.abs(diff) < 0.000001;
}

function diagnosePrecisionIssues() {
    console.log("=== DIAGNOSING PRECISION ISSUES ===");

    const currentTime = viewer.clock.currentTime;
    const startTime = viewer.clock.startTime;
    const stopTime = viewer.clock.stopTime;

    console.log("Clock Start:", Cesium.JulianDate.toIso8601(startTime));
    console.log("Clock Current:", Cesium.JulianDate.toIso8601(currentTime));
    console.log("Clock Stop:", Cesium.JulianDate.toIso8601(stopTime));

    const entities = viewer.entities.values;
    let sampledProperties = 0;
    let workingProperties = 0;
    let brokenProperties = 0;

    for (let entity of entities) {
        if (entity.position && entity.position._property && entity.position._property._times) {
            sampledProperties++;
            const pos = entity.position.getValue(currentTime);
            if (pos) {
                workingProperties++;
            } else {
                brokenProperties++;
                const times = entity.position._property._times;

                console.log(`[BROKEN] ${entity.id}:`);
                console.log(`  Sample count: ${times.length}`);
                if (times.length > 0) {
                    console.log(`  First sample: ${Cesium.JulianDate.toIso8601(times[0])}`);
                    console.log(`  Last sample: ${Cesium.JulianDate.toIso8601(times[times.length - 1])}`);

                    // Find closest sample
                    let closestTime = times[0];
                    let minDiff = Math.abs(Cesium.JulianDate.secondsDifference(currentTime, times[0]));

                    for (let sampleTime of times) {
                        const diff = Math.abs(Cesium.JulianDate.secondsDifference(currentTime, sampleTime));
                        if (diff < minDiff) {
                            minDiff = diff;
                            closestTime = sampleTime;
                        }
                    }

                    console.log(`  Closest sample: ${Cesium.JulianDate.toIso8601(closestTime)} (${minDiff.toFixed(6)}s away)`);
                }
            }
        }
    }

    console.log(`Summary: ${sampledProperties} sampled properties, ${workingProperties} working, ${brokenProperties} broken`);

    if (brokenProperties > 0) {
        console.log("🔧 Recommendation: The precision fixes in propagateWalkerConstellation should resolve these issues");
    }
}

// MINIMAL TEST HARNESS - Copy-paste these functions for testing
function testWalkerConstellation() {
    console.log("=== TESTING WALKER CONSTELLATION ===");

    // Test time precision first
    testTimePrecision();

    // Set test parameters (6 satellites, 3 planes, phase factor 1)
    document.getElementById('semiMajorAxis').value = '7000';    // km
    document.getElementById('inclination').value = '53';       // degrees
    document.getElementById('rightAscension').value = '0';     // degrees
    document.getElementById('argumentOfPerigee').value = '0';  // degrees
    document.getElementById('anomaly').value = '0';            // degrees
    document.getElementById('nOfPlanes').value = '3';          // planes
    document.getElementById('nOfSats').value = '6';            // total satellites
    document.getElementById('phaseOffset').value = '1';        // phase factor
    document.getElementById('timestepInSeconds').value = '60'; // 1 minute steps

    console.log("Test parameters set. Expected result:");
    console.log("- 6 satellites total (2 per plane)");
    console.log("- 3 orbital planes separated by 120° in RAAN");
    console.log("- Phase offset: f=1 -> Δθ = 1×360/6 = 60° between equivalent satellites in adjacent planes");
    console.log("- Satellites should move continuously in their orbits");

    // Run the constellation
    populateWalkerDelta().then(() => {
        console.log("Test constellation created. Monitor the satellites for continuous motion.");

        // Run precision diagnostics immediately
        setTimeout(() => {
            diagnosePrecisionIssues();
        }, 2000);

        // Verify animation after 10 seconds
        setTimeout(() => {
            const entities = viewer.entities.values;
            const iconEntities = entities.filter(e => e.id && e.id.includes('_icon'));
            console.log(`Created ${iconEntities.length} satellite icons`);

            if (iconEntities.length === 6) {
                console.log("✅ Correct number of satellites created");
            } else {
                console.error("❌ Expected 6 satellites, got " + iconEntities.length);
            }

            // Check if satellites are moving
            const currentTime = viewer.clock.currentTime;
            const testTime = Cesium.JulianDate.addSeconds(currentTime, 300, new Cesium.JulianDate()); // +5 minutes

            let movingCount = 0;
            let frozenCount = 0;
            for (let entity of iconEntities) {
                const pos1 = entity.position.getValue(currentTime);
                const pos2 = entity.position.getValue(testTime);

                if (pos1 && pos2) {
                    const distance = Cesium.Cartesian3.distance(pos1, pos2);
                    if (distance > 1000) { // More than 1km difference
                        movingCount++;
                        console.log(`${entity.id}: ✅ Moving ${(distance / 1000).toFixed(1)}km over 5min`);
                    } else {
                        frozenCount++;
                        console.log(`${entity.id}: ❌ Static (${(distance / 1000).toFixed(1)}km over 5min)`);
                    }
                } else {
                    frozenCount++;
                    console.log(`${entity.id}: ❌ No position data (pos1=${!!pos1}, pos2=${!!pos2})`);
                }
            }

            if (movingCount === iconEntities.length) {
                console.log("✅ All satellites are properly moving");
            } else {
                console.error(`❌ Only ${movingCount}/${iconEntities.length} satellites are moving, ${frozenCount} are frozen`);
                console.log("🔧 Running additional diagnostics...");
                diagnosePrecisionIssues();
            }

        }, 10000);
    }).catch(error => {
        console.error("Test failed:", error);
    });
}

function testSingleSatellite() {
    console.log("=== TESTING SINGLE SATELLITE (BASELINE) ===");

    // Test with existing single satellite functionality
    document.getElementById('semiMajorAxis').value = '7000';
    document.getElementById('inclination').value = '53';
    document.getElementById('rightAscension').value = '0';
    document.getElementById('argumentOfPerigee').value = '0';
    document.getElementById('anomaly').value = '0';
    document.getElementById('timestepInSeconds').value = '60';

    const testTle = elements2TLE("TEST_SAT", Date.now(), 7000, 0.0001, 53, 0, 0, 0);
    const startTime = picker.getStartDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    const endTime = picker.getEndDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");

    propagateAndRender(testTle, 60, startTime, endTime).then(() => {
        console.log("Single satellite test completed. It should be moving normally.");
    });
}

function resetTestEnvironment() {
    removeAllEntities();
    console.log("Test environment reset.");
}

// To run tests, uncomment these lines:
// testSingleSatellite();  // Test baseline first
// resetTestEnvironment(); // Clear 
// testWalkerConstellation(); // Test constellation

let viewer, scene, time;
let timestepInSeconds, iso8601Start, iso8601End;
let icrfEnabled = true; // Track ICRF state

document.addEventListener('DOMContentLoaded', function () {
    initCesiumRender();
    setDefaultDates();
    const randomTle = randomizeSatellite();
    propagateAndRender(randomTle, 60.0, iso8601Start, iso8601End);

    // Debugging:
    // addWalkerDebugConsole();
    // testWalkerConstellation();

});

async function setDefaultDates() {
    const today = new Date();
    today.setMilliseconds(0);
    today.setSeconds(0);
    picker.setStartDate(today);
    picker.setEndDate(shiftDateByMinutes(today, 120));
    await updateGlobalDates();
}

async function updateGlobalDates() {
    iso8601Start = picker.getStartDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    iso8601End = picker.getEndDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
}

function shiftDateByMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}

function initCesiumRender() {

    /*
    fetch('/get-cesium-config')
      .then(response => response.json())
      .then(cesiumConfig => {
        Cesium.Ion.defaultAccessToken = cesiumConfig.apiKey;
      })
      .catch(error => {
        console.error('Error obtaining or setting Cesium API key:', error);
      });
      */

    // Optimized for offline usage:
    viewer = new Cesium.Viewer("cesiumContainer", {
        baseLayer: Cesium.ImageryLayer.fromProviderAsync(
            Cesium.TileMapServiceImageryProvider.fromUrl(
                Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
            )
        ),
        orderIndependentTranslucency: false,
        baseLayerPicker: true,
        geocoder: false,
        homeButton: true,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        infoBox: false,
        scene3DOnly: true,
    });

    const scene = viewer.scene;
    const controller = scene.screenSpaceCameraController;

    // Minimum zoom distance to prevent going underground
    controller.minimumZoomDistance = 50000.0; // km
    controller.maximumZoomDistance = 5.0e8;   // ~500,000 km

    // Rotation controls (slower = smoother)
    controller._maximumRotateRate = 0.2;  // default 1.77
    controller._minimumRotateRate = 0.01; // default 0.02

    // Zoom controls
    controller.zoomFactor = 1.0;         // default 5.0; smaller = smoother zoom steps
    controller.wheelZoomFactor = 0.005;   // fine control on mouse wheel

    // Translation (panning)
    controller.translateFactor = 1.0;    // leave close to default for stability

    // Inertia (smooth continuation)
    controller.inertiaSpin = 0.95;       // default 0.9
    controller.inertiaTranslate = 0.95;  // default 0.9
    controller.inertiaZoom = 0.85;       // default 0.8

    // Globe detail level: smaller error = sharper but heavier
    scene.globe.maximumScreenSpaceError = 2; // default 2; 1 = sharper but heavier

    // Optional: better lighting feel
    scene.globe.enableLighting = true;

    const camera = new Cesium.Camera(scene);
    camera.defaultZoomAmount = 50000;

    // Add camera distance monitoring for ICRF control
    viewer.scene.camera.changed.addEventListener(function () {
        const camera = viewer.scene.camera;
        const cameraPos = camera.positionWC;
        const globeCenter = Cesium.Cartesian3.ZERO;
        const distance = Cesium.Cartesian3.distance(cameraPos, globeCenter);

        // Disable ICRF when zoomed in close (better for detailed navigation)
        // Enable ICRF when zoomed out (better for orbital mechanics view)
        const icrfThreshold = 15000000; // ~15,000 km from Earth center

        if (distance < icrfThreshold && icrfEnabled) {
            // Zoomed in - disable ICRF for smooth local navigation
            icrfEnabled = false;
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            console.log("ICRF disabled - close navigation mode");
        } else if (distance >= icrfThreshold && !icrfEnabled) {
            // Zoomed out - re-enable ICRF for orbital view
            icrfEnabled = true;
            console.log("ICRF enabled - orbital view mode");
        }
    });

}

async function propagateAndRender(tle, timestepInSeconds, iso8601Start, iso8601End) {

    if (tle === "") {
        alert("TLE field is empty. Cannot propagate.");
        return;
    }

    if (timestepInSeconds === null || timestepInSeconds === undefined) {
        console.log("Timestep is not defined. Using default value of 30 seconds.");
        timestepInSeconds = 30;
    } else if (timestepInSeconds < 1) {
        console.log("Timestep cannot be less than 1 second. Defaulting to 1 second.");
        timestepInSeconds = 1;
    }

    let tleArray = tle.split('\n');
    let start = Cesium.JulianDate.fromIso8601(iso8601Start);
    let stop = Cesium.JulianDate.fromIso8601(iso8601End);
    let totalSeconds = Cesium.JulianDate.secondsDifference(stop, start);

    totalSeconds = Math.min(totalSeconds, 604800);
    if (totalSeconds === 604800) {
        console.log("Warning: Defaulting to 1 week");
    }
    if (totalSeconds <= 0) {
        console.log("Timespan must be greater than zero: " + totalSeconds);
        return;
    }

    let satName, tle1, tle2;

    if (tleArray.length == 2) {
        tle1 = tleArray[0];
        tle2 = tleArray[1];
        satName = tle1.substring(2, 5);
    } else if (tleArray.length == 3) {
        satName = tleArray[0];
        tle1 = tleArray[1];
        tle2 = tleArray[2];
    } else {
        tleArray = randomizeSatellite().split('\n');
        tle1 = tleArray[1];
        tle2 = tleArray[2];
        satName = tleArray[0];
        // TODO use the satellite's orbital period
        totalSeconds = 120 * 60;
        console.log("TLE invalid.");
    }

    updateViewerClock(start, totalSeconds);

    let trajectory = await propagateSGP4(tle1, tle2, start, totalSeconds, timestepInSeconds);

    outputCoordinatesToGUI(trajectory.eciPositions, trajectory.ecefPositions);

    // TODO: Fix present satellite test
    if (viewer.entities.getById(satName) !== undefined) {
        console.log("The scenario already contains this satellite");
        return;
    }

    currentSat = satName; // TODO: Now it takes the last satellite populated, replace with combo box selection
    satelliteStack.push(satName);
    satellitePaths.push(satName + "_path");
    satelliteIcons.push(satName + "_icon");
    satelliteLabels.push(satName + "_label");

    

    addSatelliteIcon(satName, trajectory.eciPositionsOverTime);
    addSatelliteLabel(satName, trajectory.eciPositionsOverTime);
    addSatellitePath(satName, trajectory.positionsToPlotECI, getSelectedColor());
    addSatellitePoint(satName, trajectory.eciPositionsOverTime, getSelectedColor());

    let initialized = false;

    viewer.scene.globe.tileLoadProgressEvent.addEventListener(() => {
        if (!initialized && viewer.scene.globe.tilesLoaded === true) {
            viewer.clock.shouldAnimate = true;
            initialized = true;
            viewer.scene.camera.zoomOut(7000000);
        }
    });

    viewInICRF();
}

async function propagateSGP4(tleLine1, tleLine2, start, totalSeconds, timestepInSeconds) {

    let satrec = satellite.twoline2satrec(tleLine1.trim(), tleLine2.trim());

    let ecefPositionsOverTime = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.FIXED);
    let eciPositionsOverTime = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.INERTIAL);
    let eciPositions = [];
    let ecefPositions = [];
    // let positionsToPlotECEF = [];
    let positionsToPlotECI = [];

    console.log("Propagating for: " + totalSeconds + " seconds at " + timestepInSeconds + " second intervals.");

    for (let i = 0; i <= totalSeconds; i += timestepInSeconds) {

        const timeStamp = Cesium.JulianDate.addSeconds(start, i, new Cesium.JulianDate());
        const jsDate = Cesium.JulianDate.toDate(timeStamp);
        const sgp4ECIPos = await satellite.propagate(satrec, jsDate);
        const gmst = satellite.gstime(jsDate);
        const geodeticPos = satellite.eciToGeodetic(sgp4ECIPos.position, gmst);
        const ecefPos = satellite.eciToEcf(sgp4ECIPos.position, gmst);

        const eciPosition = Cesium.Cartesian3.fromElements(sgp4ECIPos.position.x * 1000,
            sgp4ECIPos.position.y * 1000,
            sgp4ECIPos.position.z * 1000);

        const ecefPosition = new Cesium.Cartesian3(ecefPos.x * 1000,
            ecefPos.y * 1000,
            ecefPos.z * 1000);

        // positionsToPlotECEF.push(ecefPosition);
        positionsToPlotECI.push(eciPosition);
        ecefPositionsOverTime.addSample(timeStamp, ecefPosition);
        eciPositionsOverTime.addSample(timeStamp, eciPosition);

        // JSON output objects:
        const jsonPositionECI = {
            time: timeStamp,
            pos: [eciPosition.x, eciPosition.y, eciPosition.z]
        };
        eciPositions.push(jsonPositionECI);

        const jsonPositionECEF = {
            time: timeStamp,
            position: [ecefPosition.x, ecefPosition.y, ecefPosition.z, (180 / Math.PI) * geodeticPos.latitude, (180 / Math.PI) * geodeticPos.longitude]
        };
        ecefPositions.push(jsonPositionECEF);

    }

    return { eciPositionsOverTime, ecefPositionsOverTime, eciPositions, ecefPositions, positionsToPlotECI };

}

function updateViewerClock(start, totalSeconds) {
    //const start = Cesium.JulianDate.fromDate(new Date());
    let stop = Cesium.JulianDate.addSeconds(start, totalSeconds, new Cesium.JulianDate());
    viewer.clock.startTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.currentTime = start.clone();
    viewer.timeline.zoomTo(start, stop);
    viewer.clock.multiplier = 20;
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
}

function outputCoordinatesToGUI(eciPositions, ecefPositions) { 
    
    let csvRows = eciPositions.slice(1).map(obj =>
        [obj.time, ...obj.pos.map(num => num.toFixed(3))].join('\t')
    );
    let csvHeader = "Date[UTCG]\t\tx[m]\t\ty[m]\t\tz[m]" + '\r\n';
    let csvData = csvHeader + csvRows.join('\r\n');
    eciCoordinates.value = csvData;

    csvRows = ecefPositions.slice(1).map(obj =>
        [obj.time, ...obj.position.map(num => num.toFixed(3))].join('\t')
    );
    csvHeader = "Date[UTCG]\t\tx[m]\t\ty[m]\t\tz[m]\t\tlat[deg] lon[deg]" + '\r\n';
    csvData = csvHeader + csvRows.join('\r\n');
    ecefCoordinates.value = csvData;

    // Output the JSON containing time and coordinates of each sample
    jsonEciCoordinates.value = JSON.stringify(eciPositions, null, 2);

}

function addSatellitePoint(satName, positionsOverTime, color = Cesium.Color.RED) {
    viewer.entities.add({
        position: new Cesium.CallbackProperty(function (time, result) {
            // Get satellite position at current time
            const satPos = positionsOverTime.getValue(time);
            return satPos;
        }, false),
        point: {
            pixelSize: 5,
            color: (() => {
                const c = color;
                return new Cesium.Color(c.red, c.green, c.blue, 1.0); // Force solid color
            })(),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.NONE
        },
        id: satName + "_point",
        show: true
    });
}

function addSatellitePath(satName, positionsOverTime, color, widthInPixels = 2) {
    viewer.entities.add({
        polyline: {
            positions: new Cesium.CallbackProperty(function (time, result) {
                // Get the ICRF to FIXED transform for the current time
                const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);
                if (!Cesium.defined(icrfToFixed)) {
                    // Fallback: just show ECI positions
                    return positionsOverTime;
                }
                // Transform each ECI position to ECEF for display
                return positionsOverTime.map(function (eciPos) {
                    return Cesium.Matrix3.multiplyByVector(icrfToFixed, eciPos, new Cesium.Cartesian3());
                });
            }, false),
            width: widthInPixels,
            material: color,
        },
        billboard: undefined,
        id: satName + "_path",
    });
}

function addSatelliteLabel(satName, positionsOverTime, sizeInPx = 16) {
    viewer.entities.add({
        position: new Cesium.CallbackProperty(function (time, result) {
            const satPos = positionsOverTime.getValue(time);
            return satPos;
        }, false),
        label: {
            text: satName,
            font: `${sizeInPx}px sans-serif`,
            fillColor: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -20)
        },
        id: satName + "_label"
    });
}

function addSatelliteIcon(satName, positionsOverTime) {
    viewer.entities.add({
        position: new Cesium.CallbackProperty(function (time, result) {
            // Get satellite position at current time
            const satPos = positionsOverTime.getValue(time);
            return satPos;
        }, false),
        //point: { pixelSize: 0, color: Cesium.Color.RED },
        outlineColor: Cesium.Color.BLACK,
        billboard: {
            image: "../images/satellite.png",
            scale: 1,
        },
        id: satName + "_icon", // TODO: Remove orientation if not needed
        orientation: new Cesium.CallbackProperty(function (time, result) {
            // Get satellite position at current time
            const satPos = positionsOverTime.getValue(time);
            if (!satPos) return Cesium.Quaternion.IDENTITY;

            // Nadir direction: from satellite to Earth's center
            const nadir = Cesium.Cartesian3.negate(satPos, new Cesium.Cartesian3());
            Cesium.Cartesian3.normalize(nadir, nadir);

            // Default "up" for cylinder is +Z, so rotate Z to nadir
            const up = Cesium.Cartesian3.UNIT_Z;
            const axis = Cesium.Cartesian3.cross(up, nadir, new Cesium.Cartesian3());
            const angle = Cesium.Cartesian3.angleBetween(up, nadir);
            if (Cesium.Cartesian3.equalsEpsilon(axis, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON6)) {
                // Already aligned
                return Cesium.Quaternion.IDENTITY;
            }
            Cesium.Cartesian3.normalize(axis, axis);
            return Cesium.Quaternion.fromAxisAngle(axis, angle);
        }, false)
    });
}

function addSatelliteSensor(satName, positionsOverTime) {
    viewer.entities.add({
        position: new Cesium.CallbackProperty(function (time, result) {
            // Get satellite position at current time
            const satPos = positionsOverTime.getValue(time);
            if (!satPos) return satPos;

            // Nadir direction: from satellite to Earth's center
            const nadir = Cesium.Cartesian3.negate(satPos, new Cesium.Cartesian3());
            Cesium.Cartesian3.normalize(nadir, nadir);

            // Offset cone center by -length/2 along nadir direction
            const length = 800000; // must match cylinder.length
            const offset = Cesium.Cartesian3.multiplyByScalar(nadir, length / 2, new Cesium.Cartesian3());
            // Offset the cone center by -length/2 along nadir direction
            // In Cesium, the cylinder is centered at its midpoint, so to have the base at the satellite position,
            // we need to offset the position by -length/2 * nadir direction.
            return Cesium.Cartesian3.add(satPos, offset, new Cesium.Cartesian3());
        }, false),
        outlineColor: Cesium.Color.BLACK,
        id: satName + "_sensor",
        cylinder: {
            length: 800000, // Sensor range (height of cone, meters)
            topRadius: 2000000, // Field of view radius at ground (meters)
            bottomRadius: 0.0,
            material: color,
            outline: false,
        },
        show: true,
        orientation: new Cesium.CallbackProperty(function (time, result) {
            // Get satellite position at current time
            const satPos = positionsOverTime.getValue(time);
            if (!satPos) return Cesium.Quaternion.IDENTITY;

            // Nadir direction: from satellite to Earth's center
            const nadir = Cesium.Cartesian3.negate(satPos, new Cesium.Cartesian3());
            Cesium.Cartesian3.normalize(nadir, nadir);

            // Default "up" for cylinder is +Z, so rotate Z to nadir
            const up = Cesium.Cartesian3.UNIT_Z;
            const axis = Cesium.Cartesian3.cross(up, nadir, new Cesium.Cartesian3());
            const angle = Cesium.Cartesian3.angleBetween(up, nadir);
            if (Cesium.Cartesian3.equalsEpsilon(axis, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON6)) {
                // Already aligned
                return Cesium.Quaternion.IDENTITY;
            }
            Cesium.Cartesian3.normalize(axis, axis);
            return Cesium.Quaternion.fromAxisAngle(axis, angle);
        }, false)
    });
}

function viewInICRF() {
    viewer.camera.flyHome(0);
    viewer.scene.postUpdate.addEventListener(icrf);
    viewer.scene.globe.enableLighting = true;
}

function icrf(scene, time) {
    // Only apply ICRF transform when enabled (zoomed out)
    if (!icrfEnabled) {
        return;
    }

    if (scene.mode !== Cesium.SceneMode.SCENE3D) {
        return;
    }

    var icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);

    if (Cesium.defined(icrfToFixed)) {
        var camera = viewer.camera;
        var offset = Cesium.Cartesian3.clone(camera.position);
        var transform = Cesium.Matrix4.fromRotationTranslation(icrfToFixed);
        camera.lookAtTransform(transform, offset);
    }

}

function removeAllEntities() {
    viewer.entities.removeAll();
}

// Add an event listener to the submit button
propagateFromTLE.addEventListener('click', function () {
    iso8601Start = picker.getStartDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    iso8601End = picker.getEndDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    propagateAndRender(tleText.value, timestepInSecondsField.value, iso8601Start, iso8601End);
});

function takeSnapshot() {
    const tmpH = cesiumContainer.style.height;
    const tmpW = cesiumContainer.style.width;

    // resize for screenshot
    cesiumContainer.style.height = "600px";
    cesiumContainer.style.width = "800px";
    viewer.resize();
    viewer.render();

    // chrome blocks opening data urls directly, add an image to a new window instead
    // https://stackoverflow.com/questions/45778720/window-open-opens-a-blank-screen-in-chrome
    const win = window.open();
    win.document.write(`<img src="${viewer.canvas.toDataURL("image/png")}" />`);
    // stop the browser from trying to load "nothing" forever
    win.stop();

    // reset viewer size
    cesiumContainer.style.height = tmpH;
    cesiumContainer.style.width = tmpW;
    viewer.resize();
    viewer.render();
}

propagateFromElements.addEventListener('click', function () {

    iso8601Start = picker.getStartDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    iso8601End = picker.getEndDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");

    const semiMajorAxisInput = document.getElementById('semiMajorAxis');
    const eccentricityInput = document.getElementById('eccentricity');
    const inclinationInput = document.getElementById('inclination');
    const rightAscensionInput = document.getElementById('rightAscension');
    const argumentOfPerigeeInput = document.getElementById('argumentOfPerigee');
    const meanAnomalyInput = document.getElementById('anomaly');

    if (!iso8601Start) {
        console.error("Start date is empty.");
        return;
    }

    if (!semiMajorAxisInput.value) {
        console.error("Semi-major axis is empty.");
        return;
    }

    if (!eccentricityInput.value) {
        console.error("Eccentricity is empty.");
        return;
    }

    if (!inclinationInput.value) {
        console.error("Inclination is empty.");
        return;
    }

    if (!rightAscensionInput.value) {
        console.error("Right ascension is empty.");
        return;
    }

    if (!argumentOfPerigeeInput.value) {
        console.error("Argument of perigee is empty.");
        return;
    }

    if (!meanAnomalyInput.value) {
        console.error("Mean anomaly is empty.");
        return;
    }

    const timestamp = new Date(iso8601Start).getTime();
    const semiMajorAxis = parseFloat(semiMajorAxisInput.value);
    const eccentricity = parseFloat(eccentricityInput.value);
    const inclination = parseFloat(inclinationInput.value);
    const rightAscension = parseFloat(rightAscensionInput.value);
    const argumentOfPerigee = parseFloat(argumentOfPerigeeInput.value);
    const meanAnomaly = parseFloat(meanAnomalyInput.value);

    let tle = elements2TLE("", timestamp, semiMajorAxis, eccentricity, inclination, rightAscension, argumentOfPerigee, meanAnomaly);
    let timestepInSeconds = parseFloat(timestepInSecondsField.value);

    tleText.value = tle;

    propagateAndRender(tle, timestepInSeconds, iso8601Start, iso8601End);

});

function randomizeSatellite() {

    const timestamp = new Date(iso8601Start).getTime();
    const semiMajorAxis = Math.floor(Math.random() * (8000 - 6678)) + 6678; // km
    const eccentricity = Math.random() * (0.01 - 0.0001) + 0.0001;
    const inclination = Math.floor(Math.random() * (98 - 40)) + 40;
    const rightAscension = Math.floor(Math.random() * 360);
    const argumentOfPerigee = Math.floor(Math.random() * 360);
    const meanAnomaly = Math.floor(Math.random() * 360);
    /*
        document.getElementById('semiMajorAxis').value = semiMajorAxis.toFixed(3);
        document.getElementById('eccentricity').value = eccentricity.toFixed(6);
        document.getElementById('inclination').value = inclination.toFixed(3);
        document.getElementById('rightAscension').value = rightAscension.toFixed(3);
        document.getElementById('argumentOfPerigee').value = argumentOfPerigee.toFixed(3);
        document.getElementById('anomaly').value = meanAnomaly.toFixed(3);
    */
    return elements2TLE("", timestamp, semiMajorAxis, eccentricity, inclination, rightAscension, argumentOfPerigee, meanAnomaly);

}

clearButton.addEventListener('click', function () {
    removeAllEntities();
});

addStation.addEventListener('click', function () {
    addFacility();
});

function addFacility() {
    const coordinates = observerCoordinates.value.split(',');
    let lat, lon, height = 0.0;

    if (coordinates.length < 2) {
        console.log("Not enough arguments!");
        return undefined;
    } else {
        lat = coordinates[0];
        lon = coordinates[1];
        if (coordinates.length === 3) {
            height = coordinates[2];
        }
    }

    const position = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    viewer.entities.add({
        id: randomName(),
        position: position,
        billboard: {
            image: "../images/facility.png",
            scale: 1,
        },
        label: {
            text: `Station`,
            show: false,
        },
    });
}

computeAccess.addEventListener('click', function () {

    accessTextArea.value = "Computing access intervals... please wait.\n";

    removeAllEntities();
    let uriData = [];
    let tleArray = tleText.value.split('\n');
    // let start = Cesium.JulianDate.fromIso8601(iso8601Start);
    // let stop = Cesium.JulianDate.fromIso8601(iso8601End);

    if (tleArray.length == 2) {
        uriData.push(tleArray[0]);
        uriData.push(tleArray[1]);
    } else if (tleArray.length == 3) {
        uriData.push(tleArray[1]);
        uriData.push(tleArray[2]);
    } else {
        console.log("TLE invalid or empty");
        return;
    }

    addFacility();

    // TODO: Add check if already propagated
    propagateAndRender(tleText.value, timestepInSeconds.value, iso8601Start, iso8601End);

    const coordinates = observerCoordinates.value;
    if (coordinates.split(',').length < 2) {
        console.log("Coordinates invalid");
        return;
    }
    uriData.push(coordinates);
    uriData.push(iso8601Start);
    uriData.push(iso8601End);
    uriData.push(timestepInSecondsField.value);

    let visibilityThresold = 0;
    if (document.getElementById("visibilityThreshold").value !== "") {
        visibilityThresold = parseFloat(document.getElementById("visibilityThreshold").value);
    }

    uriData.push(visibilityThresold);

    const uriReq = uriData.map(item => encodeURIComponent(item)).join('/');

    computeAccess.textContent = "Computing...";
    computeAccess.disabled = true;
    console.log("API req: /api/access/" + uriReq);

    fetch("/api/access/" + uriReq)
        .then(response => {
            return response.json();
        })
        .then(jsonObject => {
            //console.log(jsonObject);
            //const data = JSON.parse(response.json());
            const csvRows = [];
            csvRows.push("Access report to " + coordinates + "\n");
            csvRows.push("start[iso8601],end[iso8601],duration[s]");
            jsonObject.forEach(obj => {
                console.log(obj);
                const [value1, value2, value3] = obj.split(",");
                //const startDateISO = toISOString(obj.start);
                //const endDateISO = toISOString(obj.end);
                const row = `${value1},${value2},${formatValue(Number(value3), 3)}`;
                csvRows.push(row);
            });
            accessTextArea.value = csvRows.join("\n");
        })
        .catch(error => {
            console.error('Error computing access intervals:', error);
            // access.value = error;
        });
    computeAccess.disabled = false;
    computeAccess.textContent = "Compute access intervals";

});

function elements2TLE(name, timestamp, semiMajorAxis, eccentricity, inclination, rightAscension, argumentOfPerigee, meanAnomaly) {

    // satelliteNumber, classification, timestamp, launchYear, launchPiece, launchNumber, meanMotionFirstDerivative, meanMotionSecondDerivative, bStar, elementNumber, ephemerisType
    const tleLine1 = buildLine1(1, 'U', new Date(timestamp), 2023, 'A', 92, 0, 0, 0, 123, 0);

    // satelliteNumber, semiMajorAxis, eccentricity, inclination, raan, pa, meanAnomaly, revolutionNumberAtEpoch
    const tleLine2 = buildLine2(1, semiMajorAxis, eccentricity, inclination, rightAscension, argumentOfPerigee, meanAnomaly, 12345);

    if (name === "") {
        name = randomName();
    }

    return name + '\r\n' + tleLine1 + '\r\n' + tleLine2;

}

function formatValue(value, decimalPlaces) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
        return value.toFixed(decimalPlaces);
    } else {
        return 'INVALID';
    }
}

function getSelectedColor() {
    const hexColor = colorTextArea.value;
    let color = Cesium.Color.fromCssColorString(hexColor)
    return color
}

colorTextArea.addEventListener('change', function () {
    viewer.entities.getById(currentSat + "_path").polyline.material = getSelectedColor();
    viewer.entities.getById(currentSat + "_point").point.color = getSelectedColor();
});


function toggleSunlight() {
    if (viewer.scene.globe.enableLighting === true) {
        viewer.scene.globe.enableLighting = false;
    } else {
        viewer.scene.globe.enableLighting = true;
    }
}

function toggleEQPlane() {

    if (viewer.entities.getById('eqLine') !== undefined) {
        if (viewer.entities.getById('eqLine').show) {
            viewer.entities.getById('eqLine').show = false;
            viewer.entities.getById('eqPlane').show = false;
            return;
        }
        viewer.entities.getById('eqLine').show = true;
        viewer.entities.getById('eqPlane').show = true;
        return;
    }

    viewer.entities.add({
        name: "Equatorial Line",
        id: "eqLine",
        show: true,
        polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(
                Array.from({ length: 361 }, (_, i) => [i - 180, 0]).flat()
            ),
            width: 1.5,
            material: Cesium.Color.YELLOW.withAlpha(0.5)
        }
    });

    // Use maximum possible height for the equatorial wall
    viewer.entities.add({
        name: "Celestial EQ",
        id: "eqPlane",
        show: true,
        wall: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                -180.0, 0.0, 0.0,
                -90.0, 0.0, 0.0,
                0.0, 0.0, 0.0,
                90.0, 0.0, 0.0,
                180.0, 0.0, 0.0,
            ]),
            minimumHeights: [6000000, 6000000, 6000000, 6000000, 6000000],
            material: new Cesium.ImageMaterialProperty({
                image: "../images/gradient_yellow_fade.png",
                transparent: true,
                repeat: new Cesium.Cartesian2(1.0, 1.0)
            }),
        },
    });

}

function toggleLabels() {
    satelliteStack.forEach(element => {
        const label = viewer.entities.getById(element + "_label");
        if (label) {
            label.show = !label.show;
        }
    });
}

function toggleIcons() {
    satelliteStack.forEach(element => {
        const icon = viewer.entities.getById(element + "_icon");
        const point = viewer.entities.getById(element + "_point");
        if (icon) {
            icon.show = !icon.show;
            point.show = !point.show;
        }
    });
}

async function populateWalkerDelta() {

    removeAllEntities();

    // Get input elements and their values
    const semiMajorAxisElement = document.getElementById('semiMajorAxis');
    const inclinationElement = document.getElementById('inclination');
    const rightAscensionElement = document.getElementById('rightAscension');
    const argumentOfPerigeeElement = document.getElementById('argumentOfPerigee');
    const meanAnomalyElement = document.getElementById('anomaly');
    const nOfPlanesElement = document.getElementById('nOfPlanes');
    const nOfSatsElement = document.getElementById('nOfSats');
    const phaseOffsetElement = document.getElementById('phaseOffset');

    // Check if all required elements exist
    if (!semiMajorAxisElement || !inclinationElement || !nOfPlanesElement || !nOfSatsElement || !phaseOffsetElement) {
        console.error("One or more required input elements not found in the DOM");
        alert("Error: Missing required input fields for Walker Delta constellation.");
        return;
    }

    // Get values and validate they're not empty
    const semiMajorAxisInput = semiMajorAxisElement.value.trim();
    const inclinationInput = inclinationElement.value.trim();
    const rightAscensionInput = rightAscensionElement.value.trim();
    const argumentOfPerigeeInput = argumentOfPerigeeElement.value.trim();
    const meanAnomalyInput = meanAnomalyElement.value.trim();
    const nOfPlanesInput = nOfPlanesElement.value.trim();
    const nOfSatsInput = nOfSatsElement.value.trim();
    const phaseOffsetInput = phaseOffsetElement.value.trim();

    // Check for empty fields
    if (!semiMajorAxisInput || !inclinationInput || !rightAscensionInput ||
        !argumentOfPerigeeInput || !meanAnomalyInput || !nOfPlanesInput || !nOfSatsInput || !phaseOffsetInput) {
        console.error("One or more required fields are empty");
        alert("Error: Please fill in all orbital element fields and constellation parameters.");
        return;
    }

    // Parse and validate numeric values
    let semiMajorAxis = parseFloat(semiMajorAxisInput);
    let inclination = parseFloat(inclinationInput);
    let rightAscension = parseFloat(rightAscensionInput);
    let argumentOfPerigee = parseFloat(argumentOfPerigeeInput);
    let meanAnomaly = parseFloat(meanAnomalyInput);
    let nOfPlanes = parseInt(nOfPlanesInput);
    let nOfSats = parseInt(nOfSatsInput);
    let phaseOffset = parseFloat(phaseOffsetInput);

    // Assuming you meant LEO heights
    if (semiMajorAxis < 2000) {
        semiMajorAxis = 6378 + semiMajorAxis;
        console.warn("Converted altitude to semi-major axis: " + semiMajorAxis + " km");
    }

    if (inclination < 0 || inclination > 180) {
        console.error("Invalid inclination: " + inclination);
        alert("Error: Inclination must be between 0 and 180 degrees.");
        return;
    }

    if (rightAscension < 0 || rightAscension >= 360) {
        while (rightAscension < 0) {
            rightAscension += 360;
        }
        while (rightAscension >= 360) {
            rightAscension -= 360;
        }
    }

    if (argumentOfPerigee < 0 || argumentOfPerigee >= 360 || isNaN(argumentOfPerigee)) {
        console.error("Invalid argument of perigee: " + argumentOfPerigee);
        alert("Error: Argument of perigee must be between 0 and 360 degrees.");
        return;
    }

    if (meanAnomaly < 0 || meanAnomaly >= 360) {
        console.error("Invalid mean anomaly: " + meanAnomaly);
        alert("Error: Mean anomaly must be between 0 and 360 degrees.");
        return;
    }

    // Validate constellation parameters
    if (nOfPlanes < 1 || nOfPlanes > 100) {
        console.error("Invalid number of planes: " + nOfPlanes);
        alert("Error: Number of planes must be between 1 and 100.");
        return;
    }

    if (nOfSats < 1 || nOfSats > 10000) {
        console.error("Invalid number of satellites: " + nOfSats);
        alert("Error: Total number of satellites must be between 1 and 10,000.");
        return;
    }

    if (nOfSats % nOfPlanes !== 0) {
        console.error("Satellites per plane not an integer: " + nOfSats + "/" + nOfPlanes);
        alert("Error: Total satellites must be evenly divisible by number of planes.");
        return;
    }

    const satsPerPlane = nOfSats / nOfPlanes;

    if (satsPerPlane < 1) {
        console.error("Too few satellites per plane: " + satsPerPlane);
        alert("Error: Must have at least 1 satellite per plane.");
        return;
    }

    console.log("Generating Walker Delta constellation: " + nOfSats + "/" + nOfPlanes + "/" + phaseOffset);

    let orbitalPeriodMinutes = getOrbitalPeriodMinutes(semiMajorAxis);
    console.log("Orbital period (minutes): " + orbitalPeriodMinutes.toFixed(2));

    // Calculate phasing within each plane (satellites evenly spaced)
    let phasing = 360 / satsPerPlane;

    // Calculate Walker Delta phase offset: Δθ = f × 360 / t
    // This is the phase difference between equivalent satellites in adjacent planes
    let walkerPhaseOffset = (phaseOffset * 360) / nOfSats;
    console.log("Walker Delta phase offset per plane: " + walkerPhaseOffset.toFixed(2) + " degrees");

    // Set consistent time window for entire constellation
    const today = new Date();
    today.setMilliseconds(0);
    today.setSeconds(0);
    picker.setStartDate(today);
    picker.setEndDate(shiftDateByMinutes(today, Math.ceil(orbitalPeriodMinutes)));
    await updateGlobalDates();

    // Lock down the time window before any propagation
    const constellationStartTime = picker.getStartDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    const constellationEndTime = picker.getEndDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");

    console.log("Constellation propagation window (UTC): " + constellationStartTime + " to " + constellationEndTime);
    tleText.value = "";

    const timestamp = new Date(constellationStartTime).getTime();

    // Generate all TLEs first to avoid clock interference
    const satelliteTLEs = [];

    for (let plane = 0; plane < nOfPlanes; plane++) {
        // RAAN: evenly distribute planes around the equator
        let raan = (plane * (360 / nOfPlanes) + rightAscension) % 360;

        // Apply Walker Delta phase offset to this plane
        // Each plane is offset by plane_index × walkerPhaseOffset in mean anomaly
        let planePhaseOffset = (plane * walkerPhaseOffset) % 360;

        console.log(`[WALKER] Plane ${plane}: RAAN=${raan.toFixed(2)}°, PhaseOffset=${planePhaseOffset.toFixed(2)}°`);

        for (let sat = 0; sat < satsPerPlane; sat++) {
            // Mean anomaly: base + satellite spacing within plane + Walker Delta phase offset
            let anomaly = (meanAnomaly + sat * phasing + planePhaseOffset) % 360;
            const satName = `P${plane}_S${sat}`;
            let tle = elements2TLE(satName, timestamp, semiMajorAxis, 0.0001, inclination, raan, argumentOfPerigee, anomaly);

            satelliteTLEs.push({
                name: satName,
                tle: tle,
                plane: plane,
                sat: sat,
                anomaly: anomaly
            });
        }
    }

    for (let satData of satelliteTLEs) {

        console.log(`[CONSTELLATION] Processing ${satData.name}...`);

        // propagateAndRender(tle, timestepInSeconds, iso8601Start, iso8601End) 
        await propagateAndRender(satData.tle, timestepInSeconds, iso8601Start, iso8601End);

        console.log(`[CONSTELLATION] Added ${satData.name} (Plane ${satData.plane}, Sat ${satData.sat}, MA ${satData.anomaly.toFixed(1)}°)`);
    }

}

showEQPlaneCheckbox.addEventListener('change', toggleEQPlane);

showSunlightCheckbox.addEventListener('change', toggleSunlight);

showIconsCheckbox.addEventListener('change', toggleIcons);

showLabelsCheckbox.addEventListener('change', toggleLabels);

takeSnapshotButton.addEventListener('click', takeSnapshot);

populateWalkerDeltaButton.addEventListener('click', async function () {
    try {
        await populateWalkerDelta();
    } catch (error) {
        console.error("Error in populateWalkerDelta:", error);
        alert("Error generating Walker Delta constellation: " + error.message);
    }
});