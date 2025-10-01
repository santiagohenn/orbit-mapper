let group, staticObjects, camera, renderer, pointsMaterial;

const cesiumContainer = document.getElementById('cesiumContainer');
const currentSatelliteCoordinates = document.getElementById('currentSatelliteCoordinates');
const propagateFromTLE = document.getElementById('propagateFromTLE');
const propagateFromElements = document.getElementById('propagateFromElements');
const clearButton = document.getElementById('clearButton');
const eqButton = document.getElementById('eqButton');
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
const access = document.getElementById('access');

import { buildLine1, buildLine2 } from './tle.js';

const picker = new easepick.create({
    element: "#datepicker",
    css: [
        "https://cdn.jsdelivr.net/npm/@easepick/bundle@1.2.1/dist/index.css",
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
      updateDates();
      console.log("Date changed");
    });
    }
});

var viewer, scene, time;
let timestepInSeconds, iso8601Start, iso8601End;

document.addEventListener('DOMContentLoaded', function() {
    initCesiumRender();
    setDefaultDates();
    // setDefaultTLE();
    renderCesium();
});

function setDefaultTLE() {
    const url = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=46265&FORMAT=TLE';
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('Unable to fetch TLE');
        }
        return response.text();
      })
      .then(data => {
        tleText.value = data;
      })
      .catch(error => {
        console.error('There was a problem with the fetch operation: ', error);
      });
}

function setDefaultDates() {
    const DateTime = easepick.DateTime;
    const today = new DateTime();
    const todayPlus = today.clone().add(1, 'day');
    picker.setStartDate(today);
    picker.setEndDate(todayPlus);
    updateDates();
}

function updateDates() {
    iso8601Start = picker.getStartDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    iso8601End = picker.getEndDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
}

function addEQPlane() {
    const eqWall = viewer.entities.add({
      name: "Celestial EQ",
      id: "eqCelestial",
      show: false,
      wall: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          -180.0,0.0,0.0,
          -90.0,0.0,0.0,
          0.0,0.0,0.0,
          90.0,0.0,0.0,
          180.0,0.0,0.0,
        ]),
        minimumHeights: [6000000.0, 6000000.0, 6000000.0, 6000000.0, 6000000.0],
        material: Cesium.Color.YELLOW.withAlpha(0.4),
      },
    });
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
      baseLayerPicker: false, 
      geocoder: false, 
      homeButton: true, 
      infoBox: false,
      navigationHelpButton: false, 
      sceneModePicker: true
    });

    scene = viewer.scene;
    time = viewer.time;

    // const scene = viewer.scene;
    const globe = scene.globe;
    const baseLayer = scene.imageryLayers.get(0);

    scene.screenSpaceCameraController.enableCollisionDetection = false;
    globe.translucency.enabled = true;
    globe.undergroundColor = Cesium.Color.BLACK;
    globe.translucency.frontFaceAlpha = 1;

    addEQPlane();

}

function renderCesium() {

    if (viewer.entities.getById("SAOCOM-DEFAULT") !== undefined) {
        removeAllEntities();
    }

    updateDates();

    // This causes a bug on android, see: https://github.com/CesiumGS/cesium/issues/7871
    viewer.scene.globe.enableLighting = true;

    if (timestepInSeconds === null || timestepInSeconds === undefined) {
        timestepInSeconds = 30;
    } else if (timestepInSeconds < 1) {
        timestepInSeconds = 1;
    }

    // default to SAOCOM :D
    let satName = "SAOCOM-DEFAULT";
    let tle1 = "1 46265U 20059A   23219.44152368  .00000647  00000-0  87861-4 0  9990";
    let tle2 = "2 46265  97.8904  44.2657 0001383  88.6861 271.4511 14.82150595158748";

    let tleArray = tleText.value.split('\n');
    let start = Cesium.JulianDate.fromIso8601(iso8601Start);
    let stop = Cesium.JulianDate.fromIso8601(iso8601End);
    let totalSeconds = Cesium.JulianDate.secondsDifference(stop, start);

    if (totalSeconds > 604800) { // Replace with Math.min
        totalSeconds = 604800;
        console.log("Defaulting to 1 week");
    }

    if (tleArray.length == 2) {
        tle1 = tleArray[0];
        tle2 = tleArray[1];
        satName = tle1.substring(2,5);
    } else if (tleArray.length == 3) {
        satName = tleArray[0];
        tle1 = tleArray[1];
        tle2 = tleArray[2];
    } else {
        totalSeconds = 102 * 60;
        console.log("TLE invalid or empty");
    }

    let satrec = satellite.twoline2satrec(tle1.trim(), tle2.trim());

    if (totalSeconds <= 0) {
        console.log("Timespan must be greater than zero: " + totalSeconds);
        return;
    }

    console.log("start: " + start);
    console.log("end: " + stop);
    console.log("secondsDifference: " + totalSeconds);

    //const start = Cesium.JulianDate.fromDate(new Date());
    stop = Cesium.JulianDate.addSeconds(start, totalSeconds, new Cesium.JulianDate());
    viewer.clock.startTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.currentTime = start.clone();
    viewer.timeline.zoomTo(start, stop);
    viewer.clock.multiplier = 40;
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;

    let ecefPositionsOverTime = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.FIXED);
    let eciPositionsOverTime = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.INERTIAL);

    let eciPositions = [];
    let ecefPositions = [];
    let positionsToPlot = [];
    let normalizedPositions = [];

    for (let i = 0; i <= totalSeconds; i+= timestepInSeconds) {

        const timeStamp = Cesium.JulianDate.addSeconds(start, i, new Cesium.JulianDate());
        const jsDate = Cesium.JulianDate.toDate(timeStamp);
        const sgp4ECIPos = satellite.propagate(satrec, jsDate);
        const gmst = satellite.gstime(jsDate);
        const geodeticPos   = satellite.eciToGeodetic(sgp4ECIPos.position, gmst);
        const ecefPos = satellite.eciToEcf(sgp4ECIPos.position, gmst);

        const sspPos = Cesium.Cartesian3.fromRadians(geodeticPos.longitude, geodeticPos.latitude, geodeticPos.height * 1000);

        /*
        const eciPosition = new Cesium.Cartesian3(sgp4ECIPos.position.x * 1000, 
                                                   sgp4ECIPos.position.y * 1000, 
                                                   sgp4ECIPos.position.z * 1000); */

        const eciPosition = Cesium.Cartesian3.fromElements(sgp4ECIPos.position.x * 1000, 
                                                     sgp4ECIPos.position.y * 1000, 
                                                     sgp4ECIPos.position.z * 1000);

        const ecefPosition = new Cesium.Cartesian3(ecefPos.x * 1000, 
                                                   ecefPos.y * 1000, 
                                                   ecefPos.z * 1000);

        positionsToPlot.push(ecefPosition);
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
            position: [ecefPosition.x, ecefPosition.y, ecefPosition.z,(180 / Math.PI) * geodeticPos.latitude,(180 / Math.PI) * geodeticPos.longitude]
        };
        ecefPositions.push(jsonPositionECEF);

        // Normalized position
        // let positionNormalized = new Cesium.Cartesian3;
        // Cesium.Cartesian3.normalize(eciPosition, positionNormalized);
        const jsonPosition = {
            time: jsDate,
            position: [eciPosition.x, eciPosition.y, eciPosition.z]
        };
        normalizedPositions.push(jsonPosition);

    }

    // Convert the ecefPosition to JSON
    const jsonECI = JSON.stringify(eciPositions, null, 2);
    const jsonNorm = JSON.stringify(normalizedPositions, null, 2);

    // output the coordinates
    let csvRows = eciPositions.map(obj => Object.values(obj).join(','));
    let csvHeader = "Date[UTCG],x[m],y[m],z[m]" + '\r\n';
    let csvData = csvHeader + csvRows.join('\r\n');
    eciCoordinates.value = csvData;

    csvRows = ecefPositions.map(obj => Object.values(obj).join(','));
    csvHeader = "Date[UTCG],x[m],y[m],z[m],SSP latitude[deg],SSP longitude[deg]" + '\r\n';
    csvData = csvHeader + csvRows.join('\r\n');
    ecefCoordinates.value = csvData;

    // Output the JSON containing time and coordinates of each sample
    jsonEciCoordinates.value = jsonNorm;
    
    let satellitePoint = new Cesium.Entity();
    viewer.entities.removeById(satName);

    var color = getRandomColor(0.5);

    console.log(eciPositionsOverTime);

    // Visualize the satellite with a red dot.
    if (viewer.entities.getById(satName) === undefined) {
        satellitePoint = viewer.entities.add({
            position: eciPositionsOverTime,
            point: { pixelSize: 0, color: Cesium.Color.RED },
            outlineColor: Cesium.Color.BLACK,
            billboard: {
                image: "../images/satellite.png",
                scale: 1,
            },
            id: satName
        });
    } else {
        console.log("The scenario already contains this satellite");
    }

/*
    for (let i = 0; i <= totalSeconds; i+= timestepInSeconds) {

        const timeStamp = Cesium.JulianDate.addSeconds(start, i, new Cesium.JulianDate());
        const transform = Cesium.Transforms.computeFixedToIcrfMatrix(timeStamp, new Cesium.Matrix3());
        let point = eciPositionsOverTime.getValueInReferenceFrame(timeStamp, Cesium.ReferenceFrame.INERTIAL, new Cesium.Cartesian3());
        // let pointInInertial = new Cesium.Cartesian3();
        console.log(point);
        console.log(transform.toString());
        
        // Cesium.Matrix3.multiplyByVector(transform, point, pointInInertial);
        const icrfVector = Cesium.Matrix3.multiplyByVector(transform, point, new Cesium.Cartesian3());

        console.log(icrfVector);

        viewer.entities.add({
            position: point,
            point: { pixelSize: 2, color: Cesium.Color.RED.withAlpha(0.5) },
        });
    } */

    let orbit = new Cesium.Entity();
    orbit = viewer.entities.add({
        polyline: {
            positions: positionsToPlot,
            width: 2,
            material: color,
        },
        billboard: undefined,
    });
 
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

function viewInICRF() {
  viewer.camera.flyHome(0);
  scene.postUpdate.addEventListener(icrf);
  scene.globe.enableLighting = true;
}

function icrf(scene, time) {

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
    addEQPlane();
}

// Add an event listener to the submit button
propagateFromTLE.addEventListener('click', function() {
    propagateAndPlot();
});

function propagateAndPlot() {
    console.log("Propagating from TLE");
    timestepInSeconds = parseFloat(timestepInSecondsField.value);
    renderCesium();
}

propagateFromElements.addEventListener('click', function() {

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

    elements2TLE(timestamp, semiMajorAxis, eccentricity, inclination, rightAscension, argumentOfPerigee, meanAnomaly);
    propagateAndPlot();
});

clearButton.addEventListener('click', function() {
    removeAllEntities();
});

eqButton.addEventListener('click', function() {
    const eqPlane = viewer.entities.getById('eqCelestial');
    if (eqPlane.isShowing) {
        eqPlane.show = false;
    } else {
        eqPlane.show = true;
    }
});

addStation.addEventListener('click', function() {
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

computeAccess.addEventListener('click', function() {

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
    renderCesium();

    const coordinates = observerCoordinates.value;
    if (coordinates.split(',').length < 2) {
        console.log("Coordinates invalid");
        return;
    }
    uriData.push(coordinates);
    uriData.push(iso8601Start);
    uriData.push(iso8601End);
    uriData.push(timestepInSecondsField.value);
    uriData.push("5");

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
        const header = "start[iso8601],end[iso8601],duration[s]";
        csvRows.push(header);
        jsonObject.forEach(obj => {
            console.log(obj);
            const [value1, value2, value3] = obj.split(",");
            //const startDateISO = toISOString(obj.start);
            //const endDateISO = toISOString(obj.end);
            const row = `${value1},${value2},${value3}`;
            csvRows.push(row);
        });
        access.value = csvRows.join("\n");
      })
      .catch(error => {
        console.error('Error computing access intervals:', error);
        // access.value = error;
      });
      computeAccess.disabled = false;
      computeAccess.textContent = "Compute access intervals";

});

function elements2TLE(timestamp, semiMajorAxis, eccentricity, inclination, rightAscension, argumentOfPerigee, meanAnomaly) {

    // satelliteNumber, classification, timestamp, launchYear, launchPiece, launchNumber, meanMotionFirstDerivative, meanMotionSecondDerivative, bStar, elementNumber, ephemerisType
    const tleLine1 = buildLine1(1, 'U', new Date(timestamp), 2023, 'A', 92, 0, 0, 0, 123, 0);
    
    // satelliteNumber, semiMajorAxis, eccentricity, inclination, raan, pa, meanAnomaly, revolutionNumberAtEpoch
    const tleLine2 = buildLine2(1, semiMajorAxis, eccentricity, inclination, rightAscension, argumentOfPerigee, meanAnomaly, 12345);
    tleText.value = randomName() + '\r\n' + tleLine1 + '\r\n' + tleLine2;

}

function randomName() {

    const array1 = ["Messi", "Dibu", "Fake", "Alfajor", "Coffee", "Mate", "SAR", "Moria"];
    const array2 = ["-SAT", " Sat", " X", " 1A", " 1B", " 2"];

    const randomIndex1 = Math.floor(Math.random() * array1.length);
    const randomIndex2 = Math.floor(Math.random() * array2.length);

    return array1[randomIndex1] + array2[randomIndex2];
}

function formatValue(value, decimalPlaces) {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value.toFixed(decimalPlaces);
  } else {
    return 'INVALID';
  }
}

function getRandomColor(alpha) {
    const red = Math.random();
    const green = Math.random();
    const blue = Math.random();
    return new Cesium.Color(red, green, blue, alpha);
}

function toISOString(unixTimestamp) {
    const date = new Date(unixTimestamp); // Convert to milliseconds
    return date.toISOString();
}