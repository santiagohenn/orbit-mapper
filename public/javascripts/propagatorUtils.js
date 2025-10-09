export function randomName() {
    const array1 = ["Messi", "Dibu", "Fake", "Alfajor", "Coffee", "Mate", "SAR", "Moria", "ISE", "Gulich", "CBA"];
    const array2 = ["-SAT", " Sat", " X", " 1A", " 1B", " 2"];
    const randomIndex1 = Math.floor(Math.random() * array1.length);
    const randomIndex2 = Math.floor(Math.random() * array2.length);
    const randomIndex3 = Math.floor(Math.random() * 99);
    return array1[randomIndex1] + array2[randomIndex2] + randomIndex3;
}

export function getRandomColor(alpha) {
    const red = Math.random();
    const green = Math.random();
    const blue = Math.random();
    return new Cesium.Color(red, green, blue, alpha);
}

/**
 * Adds a number of seconds to an ISO8601 date string and returns the result in the same format.
 * @param {string} isoString - ISO8601 date string ("YYYY-MM-DDTHH:mm:ss.sssZ")
 * @param {number} secondsToAdd - Number of seconds to add
 * @returns {string} - New ISO8601 date string with seconds added
 */
export function addSecondsToIso8601(isoString, secondsToAdd) {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
        throw new Error("Invalid ISO8601 date string");
    }
    date.setSeconds(date.getSeconds() + secondsToAdd);
    // Format to "YYYY-MM-DDTHH:mm:ss.sssZ"
    return date.toISOString().replace('Z', '') + 'Z';
}

function toISOString(unixTimestamp) {
    const date = new Date(unixTimestamp); // Convert to milliseconds
    return date.toISOString();
}

export function getOrbitalPeriodMinutes(semiMajorAxisInKm) {
    // semiMajorAxis in km
    const mu = 398600.4418; // Earth's gravitational parameter, km^3/s^2
    const periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxisInKm, 3) / mu);
    return periodSeconds / 60; // convert to minutes
}


/* DEPRECATED */

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



/*
viewer.scene.camera.changed.addEventListener(function () {
    const camera = viewer.scene.camera;
    // Get distance from camera to globe center
    const cameraPos = camera.positionWC;
    const globeCenter = Cesium.Cartesian3.ZERO;
    const distance = Cesium.Cartesian3.distance(cameraPos, globeCenter);

    // Adjust these values as needed
    const minRate = 0.01; // slowest rotation when zoomed in
    const maxRate = 1.0;  // fastest rotation when zoomed out
    const minDist = 6371000; // distance at which rotation is slowest
    const maxDist = 7000000; // distance at which rotation is fastest

    // Linear interpolation between minRate and maxRate
    let rate;
    if (distance <= minDist) {
        rate = minRate;
    } else if (distance >= maxDist) {
        rate = maxRate;
    } else {
        rate = minRate + (maxRate - minRate) * ((distance - minDist) / (maxDist - minDist));
    }

    viewer.scene.screenSpaceCameraController._maximumRotateRate = rate;
});
*/
