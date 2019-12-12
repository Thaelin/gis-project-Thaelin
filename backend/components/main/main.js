const express = require('express');
var bodyParser = require('body-parser');
const http = require('http');
const Logger = require('../../components/logger/logger.js');
const Database = require('../../components/database/database.js');
const path = require('path');
const config = require('../../config.json');

class Main {
    constructor() {
        console.log('Smart cycling application is starting');
        this.app = express();
        this.initLoggerComponent();
        this.initDatabaseComponent();
        this.initApi();
        this.initWeatherActualize();
        require('../swagger/swagger')(this.app, this.logger);
    }

    initLoggerComponent() {
        this.logger = new Logger();
        this.logger.info('Logger component has been initialized');
    }

    initDatabaseComponent() {
        if (this.logger) {
            this.db = new Database(this.logger);
        }
        else {
            throw 'Database component can not be initialised without initialising Logger component first';
        }
    }

    initApi() {
        if (this.logger && this.db) {
            this.app.use( bodyParser.json() ); 
            this.app.use(express.urlencoded({
                extended: true
            }));

            this.app.get('/', (req, res) => {
                console.log(req.params);
                res.sendFile(path.join(__dirname, '../../../frontend/index.html'));
            });

            // API route for getting specific route's weather points
            this.app.get('/api/weatherPoints/:routeId', (req, res) => {
                if (isNaN(req.params.routeId)) {
                    this.logger.warn(`Received /api/weatherPoints/:routeId with invalid parameter: ${req.params.routeid} - is not a number`);
                    res.status(400).json({
                        errorCode: 'PARAMETER_NAN',
                        errorMsg: `Received /api/weatherPoints/:routeId with invalid parameter: ${req.params.routeid} - is not a number`
                    });
                }
                else {
                    this.db.getRouteMilestonesByRouteId(req.params.routeId, (error, data) => {
                        if (error) {
                            this.logger.error(error);
                            throw new Error;
                        }
                        else {
                            if (data.rows) {
                                let points = this.preparePoints(data.rows[0]);

                                this.db.getRouteWeather(req.params.routeId, (error, data) => {
                                    if (error) {
                                        this.logger.error(error);
                                        throw new Error;
                                    }
                                    else {
                                        if (data.rows) {
                                            // here will be weather data mapped to route milestones - points
                                            points.forEach(point => {
                                                let weatherData = data.rows.find(weatherData => {
                                                    return point.type === weatherData.point_type;
                                                });

                                                if (weatherData && weatherData.weather) {
                                                    let strippedWeather = weatherData.weather.replace('(', '').replace(')', '').replace(/"/g, '');
                                                    let weatherValues = strippedWeather.split(',');

                                                    point.data.weather = {
                                                        temperature: Number(weatherValues[0]),
                                                        humidity: Number(weatherValues[1]),
                                                        pressure: Number(weatherValues[2]),
                                                        icon: weatherValues[3],
                                                        description: weatherValues[4],
                                                        index: Number(weatherValues[5])
                                                    };
                                                    point.data.measureDate = weatherData.measure_date;
                                                }
                                            });
                                            res.json(points);
                                        }
                                    }
                                    
                                });
                            }
                            else {
                                this.logger.warning(`Select for route weather points for routeId ${req.params.routeId} returned 0 rows`);
                                res.status(500).json({
                                    errorCode: 'NO_DATA',
                                    errorMsg: `Select for route weather points for routeId ${req.params.routeId} returned 0 rows`
                                });
                            }
                        }
                    });
                }
            });

            this.app.get('/api/shortestPath/:lat/:lon/:region/:minTemp/:maxTemp', (req, res) => {
                if (isNaN(req.params.lat) || isNaN(req.params.lon)) {
                    this.logger.warn(`Received /api/shortestPath/:lat/:lon with invalid parameters`);
                    res.status(400).json({
                        errorCode: 'PARAMETER_NAN',
                        errorMsg: `Received /api/shortestPath/:lat/:lon with invalid parameters - is not a number`
                    });
                }
                this.db.getShortestPath(req.params.lat, req.params.lon, req.params.region, req.params.minTemp, req.params.maxTemp, (error, data) => {
                    if (error) {
                        console.log(error);
                        this.logger.error(error);
                        //throw new Error;
                    }
                    else {
                        res.json(data.rows);
                    }
                });
            });

            this.app.get('/api/getMapParts', (req, res) => {
                this.db.getMapParts((error, data) => {
                    if (error) {
                        console.log(error);
                        this.logger.error(error);
                    }
                    else {
                        res.json(data.rows);
                    }
                });
            });

            this.app.get('/api/cyclingRoutesFilter/:region/:minTemp/:maxTemp', (req, res) => {
                if (req.params.region && req.params.minTemp && req.params.maxTemp) {
                    this.db.cyclingRoutesFiltered(
                        req.params.region, req.params.minTemp, req.params.maxTemp, 
                        (error, data) => {
                            if (error) {
                                console.log(error);
                                this.logger.error(error);
                            }
                            else {
                                let parsedData = [];

                                // parse data to JSON
                                data.rows.forEach((route) => {
                                    parsedData.push({
                                        fid: route.fid,
                                        name: route.name,
                                        route: JSON.parse(route.route),
                                        length: route.length
                                    });
                                });

                                console.log(parsedData);

                                res.json(parsedData);
                            }
                        }
                    );
                }
                else {
                    this.logger.warn(`Received /api/cyclingRoutesFilter/:route/:minTemp/:maxTemp with invalid parameters`);
                    res.status(400).json({
                        errorCode: 'PARAMETER_EMPTY',
                        errorMsg: `Received /api/cyclingRoutesFilter/:route/:minTemp/:maxTemp with invalid parameters - is empty`
                    });
                }
            });

            this.app.use(express.static(path.join(__dirname, '../../../frontend')));

            this.app.listen(config.webserver.port);
        }
        else {
            throw 'Api can not be initialised without initialising Logger and Database component first';
        }
    }

    initWeatherActualize() {
        if (this.logger && this.db) {
            if (config.weather.apiToken != "undefined") {
                setInterval(this.actualizeWeather.bind(this), config.weather.actualizationTimerMs | 300000);
                //this.actualizeWeather();
            }
            else {
                throw 'Weather actualizer can not start because Dark Sky API token was not provided in config.json';
            }
        }
        else {
            throw 'Weather actualize can not be initialised without initialising Logger and Database component first';
        }
    }

    actualizeWeather() {
        var requestUrl = 'http://api.openweathermap.org/data/2.5/weather?';
        
        this.db.getAllRouteMilestones((err, res) => {
            if (err) {
                this.logger.error('Error while selecting cycling route milestones');
                throw 'Error while selecting cycling route milestones';
            }
            else {
                if (res) {
                    res.rows.forEach((item) => {
                        let points = this.preparePoints(item);

                        points.forEach(point => {
                            http.get(
                                `${requestUrl}lat=${point.data.coordinates[1]}&lon=${point.data.coordinates[0]}&APPID=${config.weather.apiToken}&units=metric`
                                , 
                                response => {
                                    let data = '';
                            
                                    // a chunk of data has been received
                                    response.on('data', (chunk) => {
                                        data += chunk;
                                    });
                        
                                    // the whole response has been received
                                    response.on('end', () => {
                                        let apiResponse = JSON.parse(data);
                                        if (apiResponse.cod === 200) {
                                            this.logger.info('Received weather data from OpenWeatherMap API: ' + apiResponse);
    
                                            console.log(apiResponse);
                                            let sensors= {
                                                temperature: apiResponse.main.temp,
                                                humidity: apiResponse.main.humidity,
                                                pressure: apiResponse.main.pressure,
                                            };
                                            let weather = {
                                                icon: apiResponse.weather.length > 0 ? apiResponse.weather[0].icon : undefined,
                                                description: apiResponse.weather.length > 0 ? apiResponse.weather[0].description : undefined,
                                                index: 1
                                            };
                                            // here will be DB insert
                                            this.db.saveWeatherData(item.fid, point.type, sensors, weather, (error, response) => {
                                                if (error) {
                                                    this.logger.error('Error while saving weather data for track points: ' + error);
                                                    console.log(error);
                                                }
                                                else {
                                                    this.logger.info('Weather data for track points were saved successfully, DB response: ' + response);
                                                }
                                            });
                                        }
                                        else if (apiResponse.cod === 500) {
                                            this.logger.warn('OpenWeather API server error: ' + apiResponse.message);
                                        }
                                        
                                    });
                                }
                            ).on('error', error => {
                                this.logger.error('Error occured while getting actual weather data: ' + error);
                            });
                        });
                        
                    });
                }
            }
        });
        
        
    }

    preparePoints(data) {
        // these weather points are essential for all routes
        let points = [
            {
                type: 'START',
                data: JSON.parse(data.route_start)
            },
            {
                type: 'FINISH',
                data: JSON.parse(data.route_finish)
            }
        ];
        // routes longer than 30 km will have also a middle weather point
        if (data.length > 30) {
            points.push({
                type: 'MIDDLE',
                data: JSON.parse(data.route_middle)
            });
        }
        // routes longer than 100km will also have a first and third quarter weather points
        if (data.length > 100) {
            points.push(
                {
                    type: 'FIRSTQUARTER',
                    data: JSON.parse(data.route_first_quarter)
                },
                {
                    type: 'THIRDQUARTER',
                    data: JSON.parse(data.route_third_quarter)
                }
            );
        }

        return points;
    }
}

module.exports = Main;