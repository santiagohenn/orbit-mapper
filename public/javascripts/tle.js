const MAX_NUMERIC_SATNUM = 99999;
const ALPHA5_SCALING = 10000;
const GM = 398600.4418; // Earth's gravitational constant (km^3/s^2)

export function buildLine1(satelliteNumber, classification, timestamp, launchYear, launchPiece, launchNumber, meanMotionFirstDerivative, meanMotionSecondDerivative, bStar, elementNumber, ephemerisType) {

    const buffer = [];

    buffer.push('1');
    buffer.push(' ');
    buffer.push(buildSatelliteNumber(satelliteNumber, "satelliteNumber-1"));
    buffer.push(classification);

    buffer.push(' ');
    buffer.push(addPadding("launchYear", launchYear % 100, '0', 2, true, satelliteNumber));
    buffer.push(addPadding("launchNumber", launchNumber, '0', 3, true, satelliteNumber));
    buffer.push(addPadding("launchPiece", launchPiece, ' ', 3, false, satelliteNumber));
    buffer.push(' ');

    buffer.push(dateToJulianDate(timestamp));

    /*
    const dtc = epoch.getComponents(utc);
    buffer.push(addPadding("year", year % 100, '0', 2, true, satelliteNumber));
    buffer.push(addPadding("day", dayOfYear, '0', 3, true, satelliteNumber));
    buffer.push('.');
    const fraction = Math.round(31250 * dtc.getTime().getSecondsInUTCDay() / 27.0);
    buffer.push(addPadding("fraction", fraction, '0', 8, true, satelliteNumber));*/

    buffer.push(' ');
    const n1 = meanMotionFirstDerivative * 1.86624e9 / Math.PI;
    const sn1 = addPadding("meanMotionFirstDerivative",
                                     n1.toFixed(8),
                                     ' ', 10, true, satelliteNumber);
    buffer.push(sn1);

    buffer.push(' ');
    const n2 = meanMotionSecondDerivative * 5.3747712e13 / Math.PI;
    buffer.push(formatExponentMarkerFree("meanMotionSecondDerivative", n2, 5, ' ', 8, true, satelliteNumber));

    buffer.push(' ');
    buffer.push(formatExponentMarkerFree("B*", bStar, 5, ' ', 8, true, satelliteNumber));

    buffer.push(' ');
    buffer.push(ephemerisType);

    buffer.push(' ');
    buffer.push(addPadding("elementNumber", elementNumber, ' ', 4, true, satelliteNumber));

    buffer.push(checksum(buffer.join('')));

    return buffer.join('');

}

export function buildLine2(satelliteNumber, semiMajorAxis, eccentricity, inclination, raan, pa, meanAnomaly, revolutionNumberAtEpoch) {


    semiMajorAxis = Math.max(semiMajorAxis, 6571);
    eccentricity = Math.min(eccentricity, 1 - (6571 / semiMajorAxis));
    eccentricity = Math.max(eccentricity, 0);
    eccentricity = Math.min(eccentricity, 0.999);
    semiMajorAxis = Math.max(semiMajorAxis, 6900);
    inclination = Math.min(inclination, 180);
    inclination = Math.max(inclination, 0);


    const buffer = [];
    const f34 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    const f211 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 });

    buffer.push('2');
    buffer.push(' ');
    buffer.push(buildSatelliteNumber(satelliteNumber, "satelliteNumber-2"));

    buffer.push(' ');
    buffer.push(addPadding(inclination, f34.format(inclination), ' ', 8, true, satelliteNumber));
    buffer.push(' ');
    buffer.push(addPadding("raan", f34.format(raan), ' ', 8, true, satelliteNumber));
    buffer.push(' ');
    buffer.push(addPadding(eccentricity, Math.round(eccentricity * 1.0e7), '0', 7, true, satelliteNumber));
    buffer.push(' ');
    buffer.push(addPadding("pa", f34.format(pa), ' ', 8, true, satelliteNumber));
    buffer.push(' ');
    buffer.push(addPadding("meanAnomaly", f34.format(meanAnomaly), ' ', 8, true, satelliteNumber));

    const meanMotion = Math.sqrt(GM / Math.pow(semiMajorAxis, 3.0)); // in radians/s

    buffer.push(' ');
    buffer.push(addPadding("meanMotion", f211.format(meanMotion * 43200.0 / Math.PI), ' ', 11, true, satelliteNumber));
    buffer.push(addPadding("revolutionNumberAtEpoch", revolutionNumberAtEpoch, ' ', 5, true, satelliteNumber));

    buffer.push(checksum(buffer.join('')));

    return buffer.join('');

}

function buildSatelliteNumber(satelliteNumber, name) {

    if (satelliteNumber > MAX_NUMERIC_SATNUM) {
        const highDigits = Math.floor(satelliteNumber / ALPHA5_SCALING);
        const lowDigits = satelliteNumber - highDigits * ALPHA5_SCALING;
        const alpha = 'U';
        return alpha + addPadding(name, lowDigits, '0', 4, true, satelliteNumber);
    } else {
        return addPadding(name, satelliteNumber, '0', 5, true, satelliteNumber);
    }
    
}

function addPadding(name, string, c, size, rightJustified, satelliteNumber) {

    if (string.length > size) {
        console.log("Error building the TLE for sattelite number " + satelliteNumber);
    }

    const padding = c.repeat(size);

    if (rightJustified) {
        const concatenated = padding + string;
        const l = concatenated.length;
        return concatenated.substring(l - size, l);
    }

    return (string + padding).substring(0, size);

}

function formatExponentMarkerFree(name, d, mantissaSize, c, size, rightJustified, satelliteNumber) {
    const dAbs = Math.abs(d);
    let exponent = (dAbs < 1.0e-9) ? -9 : Math.ceil(Math.log10(dAbs));
    let mantissa = Math.round(dAbs * Math.pow(10.0, mantissaSize - exponent));
    if (mantissa === 0) {
        exponent = 0;
    } else if (mantissa > (Math.pow(10, mantissaSize) - 1)) {
        exponent++;
        mantissa = Math.round(dAbs * Math.pow(10.0, mantissaSize - exponent));
    }
    const sMantissa = addPadding(name, mantissa, '0', mantissaSize, true, satelliteNumber);
    const sExponent = Math.abs(exponent).toString();
    const formatted = (d < 0 ? '-' : ' ') + sMantissa + (exponent <= 0 ? '-' : '+') + sExponent;

    return addPadding(name, formatted, c, size, rightJustified, satelliteNumber);
}

function checksum(line) {
    let sum = 0;
    for (let j = 0; j < line.length && j < 68; j++) {
        let charCode = line.charCodeAt(j);
        if (!isNaN(charCode)) {
            sum += charCode;
        } else if (line[j] === '-') {
            sum++;
        }
    }
    return sum % 10;
}


function dateToJulianDate(timestamp) {

    const dtc = new Date(timestamp);
    const year = dtc.getUTCFullYear() % 100;
    const dayOfYear = Math.floor((dtc - new Date(dtc.getUTCFullYear(), 0, 1)) / (24 * 60 * 60 * 1000)) + 1;

    const secondsInUTCDay = dtc.getUTCHours() * 3600 + dtc.getUTCMinutes() * 60 + dtc.getUTCSeconds() + dtc.getUTCMilliseconds() / 1000;
    const fraction = Math.round(31250 * secondsInUTCDay / 27.0);

    const yearPadded = addPadding("year",year % 100, '0', 2, true, 0);
    const dayPadded = addPadding("day",  dayOfYear,  '0', 3, true, 0);
    const fractionPadded = addPadding("fraction", fraction,  '0', 8, true, 0);

    return `${yearPadded}${dayPadded}.${fractionPadded}`;

}

function toDegrees(radians) {
    return radians * (180 / Math.PI);
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

