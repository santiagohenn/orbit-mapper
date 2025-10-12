const express = require('express');
const app = express();
const path = require('path');
// Load environment variables from both files
require('dotenv').config({ path: './KEYS.env' });
require('dotenv').config({ path: './.env' });
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'node_modules/cesium/Build/Cesium/Workers',
          to: 'Cesium/Workers',
        },
        {
          from: 'node_modules/cesium/Build/Cesium/ThirdParty',
          to: 'Cesium/ThirdParty',
        },
        {
          from: 'node_modules/cesium/Build/Cesium/Assets',
          to: 'Cesium/Assets',
        },
        {
          from: 'node_modules/cesium/Build/Cesium/Widgets',
          to: 'Cesium/Widgets',
        },
      ],
    }),
  ],
    entry: './public/javascripts/tle.js',
    output: {
        filename: 'tle.js'
    }
};

// Get Cesium API key from either environment variable name
const cesiumApiKey = process.env.CESIUM_ION_ACCESS_TOKEN || process.env.CESIUM_API_KEY;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/get-cesium-config', (req, res) => {
  const cesiumConfig = {
    apiKey: cesiumApiKey,
  };
  res.json(cesiumConfig);
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

const { exec } = require('child_process');

app.get('/api/access/old/:param1/:param2/:param3/:param4/:param5/:param6/:param7', (req, res) => {

    const tle1 = req.params.param1;
    const tle2 = req.params.param2;
    const position = req.params.param3;
    const startDate = req.params.param4;
    const endDate = req.params.param5;
    const timeStep = req.params.param6;
    const th = req.params.param7;

    let response;

    exec(`java -cp ${path.join(__dirname, 'java/satellite-tools.jar')} satellite.tools.Simulation "${tle1}" "${tle2}" "${position}" "${startDate}" "${endDate}" "${timeStep}" "${th}"`, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error}`);
        return;
    }
        response = JSON.parse(stdout);
        res.json(response); 
    });
    
});

app.get('/api/access/:param1/:param2/:param3/:param4/:param5/:param6/:param7', (req, res) => {

    const api = "https://satellite-access-3-hwfyof24la-tl.a.run.app/api/access/";
    const uri = [];

    const tle1 = req.params.param1;
    const tle2 = req.params.param2;
    const position = req.params.param3;
    const startDate = req.params.param4;
    const endDate = req.params.param5;
    const timeStep = req.params.param6;
    const th = req.params.param7;

    uri.push(tle1);
    uri.push(tle2);
    uri.push(position);
    uri.push(startDate);
    uri.push(endDate);
    uri.push(timeStep);
    uri.push(th);

    const encodedArray = uri.map(element => encodeURIComponent(element));
    const request = encodedArray.join('/');

    fetch(api + request)
    .then(response => {
      console.log("Fetched access intervals: OK");
      return response.json();
    })
    .then(jsonObject => {
      res.json(jsonObject);
    })
    .catch(error => {
      console.error('Error computing access intervals:', error);
      res.status(500).json({ error: 'An error occurred while fetching data' });
    });
    
});