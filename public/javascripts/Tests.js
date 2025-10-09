
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