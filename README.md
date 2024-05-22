# orbit-mapper
A set of tools to propagate and visualize orbits, and obtain access intervals for satellites and ground stations. Based on [satellite-tools](https://github.com/santiagohenn/satellite-tools), [Orekit](https://www.orekit.org) and [Cesium](https://cesium.com).

## Usage:

Just deploy the server:

```bash
node server.js
```

And access the service in your browser. It defaults to:

```bash
http://localhost:3000
```

You should see the following interface:

![image](https://firebasestorage.googleapis.com/v0/b/personal-projects-e5b8b.appspot.com/o/app_overview.jpg?alt=media&token=d96fdf08-09ed-40d7-b8ce-22ab592da47b)

### Propagate orbits:

Just paste the TLE on the textarea, or insert the 6 classical orbital elements and press "Propagate from TLE" or "Propagate from Elements" accordingly. Use the true anomaly for the 6th element. Propagation time-span defaults to the present day, you can change it using the [ISO8601](https://en.wikipedia.org/wiki/ISO_8601) format. Propagation step determines the interval for the coordinates you will obtain. Minimum is 1 second.

![image](https://firebasestorage.googleapis.com/v0/b/personal-projects-e5b8b.appspot.com/o/coordinates_overview.jpg?alt=media&token=6a6efee4-833f-4166-9621-0e4e5edff811)

Display coordinates are:
* ECI: Earth Centered Inertial coordinates on UTC-GMT, in CSV format
* ECEF: Earth Centered Earth Fixed coordinates on UTC-GMT, in CSV format
* JSON-ECI: Earth Centered Inertial coordinates on JSON format

### Access Intervals:

You can obtain access intervals from a station to a satellite, just add the station using the following format:

```csv
Latitude (in degrees), Longitude (in degrees), height (in meters)
```

On the designated space. Then press "Compute access intervals". After some time, depending on your configurations, you should see the output on the tab Access intervals, in CSV format:

![image](https://firebasestorage.googleapis.com/v0/b/personal-projects-e5b8b.appspot.com/o/image_2024-05-22_135825452.png?alt=media&token=90e4c01e-60df-430c-bdf6-e2253b7c8c53)

