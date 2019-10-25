const { Pool } = require('pg');
const config = require('../../config.json');

class Database {
    constructor(logger) {
        this.logger = logger;

        try {
            this.pool = new Pool(config.db);
            this.version();
        }
        catch (error) {
            this.logger.error('Database pool could not be initialized: ' + error);
        }
    }

    version() {
        if (this.pool) {
            this.pool.query('SELECT version()', (err, res) => {
                if (!err) {
                    this.logger.info('PostgreSQL version is: ' + res.rows[0].version);
                }
                else {
                    this.logger.error(err);
                    throw err;
                }
            });
        }
        else {
            this.logger.error('Database pool is not initialized');
        }
    }

    allCyclingRoutes(callback) {
        this.pool.query('SELECT fid, name, ST_AsGeoJSON(ST_LineMerge(route)) AS route, ST_Length(route::geography)/1000 as length FROM cycling_routes', callback);
    }

    getCyclingRoutesByLength(minLength, maxLength, callback) {
        if (minLength && maxLength) {
            this.pool.query(
                `
                SELECT fid, name, ST_AsGeoJSON(ST_LineMerge(route)) AS route, ST_Length(route::geography)/1000 as length FROM cycling_routes
                WHERE ST_Length(route::geography)/1000 BETWEEN $1 AND $2
                `, 
                [ minLength, maxLength ],
                callback
            );
        }
        else if (minLength) {
            this.pool.query(
                `
                SELECT fid, name, ST_AsGeoJSON(ST_LineMerge(route)) AS route, ST_Length(route::geography)/1000 as length FROM cycling_routes
                WHERE ST_Length(route::geography)/1000 >= $1
                `, 
                [ minLength ],
                callback
            );
        }
        else if (maxLength) {
            this.pool.query(
                `
                SELECT fid, name, ST_AsGeoJSON(ST_LineMerge(route)) AS route, ST_Length(route::geography)/1000 as length FROM cycling_routes
                WHERE ST_Length(route::geography)/1000 <= $1
                `, 
                [ maxLength ],
                callback
            );
        }
    }

    getCyclingRoutesByWeather(minTemp, maxHumidity, callback) {
        if (minTemp && maxHumidity) {
            this.pool.query(
                `
                SELECT fid, name, ST_AsGeoJSON(route) AS route, ST_Length(route::geography)/1000 as length FROM cycling_routes
                JOIN (
                    SELECT cycling_route_id, 
                    AVG((weather).temperature) AS avg_temperature, 
                    AVG((weather).humidity) AS avg_humidity FROM (
                        SELECT cycling_route_id, weather, 
                        rank() OVER (
                            PARTITION BY point_type, cycling_route_id ORDER BY measure_date DESC
                        ) 
                        FROM cycling_routes_weather
                    ) actual_weather
                    WHERE rank = 1
                    GROUP BY cycling_route_id
                ) temp ON fid = cycling_route_id
                WHERE avg_temperature >= $1 AND avg_humidity <= $2
                `, 
                [ minTemp, maxHumidity ],
                callback
            );
        }
        else if (minTemp) {
            this.pool.query(
                `
                SELECT fid, name, ST_AsGeoJSON(route) AS route, ST_Length(route::geography)/1000 as length FROM cycling_routes
                JOIN (
                    SELECT cycling_route_id, 
                    AVG((weather).temperature) AS avg_temperature, 
                    AVG((weather).humidity) AS avg_humidity FROM (
                        SELECT cycling_route_id, weather, 
                        rank() OVER (
                            PARTITION BY point_type, cycling_route_id ORDER BY measure_date DESC
                        ) 
                        FROM cycling_routes_weather
                    ) actual_weather
                    WHERE rank = 1
                    GROUP BY cycling_route_id
                ) temp ON fid = cycling_route_id
                WHERE avg_temperature >= $1
                `, 
                [ minTemp ],
                callback
            );
        }
        else if (maxHumidity) {
            this.pool.query(
                `
                SELECT fid, name, ST_AsGeoJSON(route) AS route, ST_Length(route::geography)/1000 as length FROM cycling_routes
                JOIN (
                    SELECT cycling_route_id, 
                    AVG((weather).temperature) AS avg_temperature, 
                    AVG((weather).humidity) AS avg_humidity FROM (
                        SELECT cycling_route_id, weather, 
                        rank() OVER (
                            PARTITION BY point_type, cycling_route_id ORDER BY measure_date DESC
                        ) 
                        FROM cycling_routes_weather
                    ) actual_weather
                    WHERE rank = 1
                    GROUP BY cycling_route_id
                ) temp ON fid = cycling_route_id
                WHERE avg_humidity <= $1
                `, 
                [ maxHumidity ],
                callback
            );
        }
    }

    getAllRouteMilestones(callback) {
        this.pool.query(
            `
            SELECT 
                fid,
                ST_Length(route::geography)/1000 as length,
                ST_AsGeoJSON(ST_StartPoint(ST_LineMerge(route))) AS route_start,
                ST_AsGeoJSON(ST_Line_Interpolate_Point(ST_LineMerge(route), 0.25)) AS route_first_quarter,
                ST_AsGeoJSON(ST_Line_Interpolate_Point(ST_LineMerge(route), 0.5)) AS route_middle,
                ST_AsGeoJSON(ST_Line_Interpolate_Point(ST_LineMerge(route), 0.75)) AS route_third_quarter,
                ST_AsGeoJSON(ST_EndPoint(ST_LineMerge(route))) AS route_finish
            FROM cycling_routes
            `,
            callback
        );
    }

    getRouteMilestonesByRouteId(routeId, callback) {
        this.pool.query(
            `
            SELECT 
                fid,
                ST_Length(route::geography)/1000 as length,
                ST_AsGeoJSON(ST_StartPoint(ST_LineMerge(route))) AS route_start,
                ST_AsGeoJSON(ST_Line_Interpolate_Point(ST_LineMerge(route), 0.25)) AS route_first_quarter,
                ST_AsGeoJSON(ST_Line_Interpolate_Point(ST_LineMerge(route), 0.5)) AS route_middle,
                ST_AsGeoJSON(ST_Line_Interpolate_Point(ST_LineMerge(route), 0.75)) AS route_third_quarter,
                ST_AsGeoJSON(ST_EndPoint(ST_LineMerge(route))) AS route_finish
            FROM cycling_routes
            WHERE fid = $1
            `,
            [ routeId ],
            callback
        );
    }

    saveWeatherData(routeId, pointType, sensors, weather, callback) {
        this.pool.query(
            `
            INSERT INTO cycling_routes_weather (cycling_route_id, point_type, weather, measure_date)
            VALUES($1, $2, ($3, $4, $5, $6, $7, $8), $9)
            `,
            [ routeId, pointType, sensors.temperature, sensors.humidity, sensors.pressure, weather.icon, weather.description, weather.index, new Date() ],
            callback
        );
    }

    getRouteWeather(routeId, callback) {
        this.pool.query(
            `
            SELECT point_type, weather, measure_date FROM (
                SELECT id, point_type, weather, measure_date, 
                rank() OVER (
                    PARTITION BY point_type ORDER BY measure_date DESC
                ) 
                FROM cycling_routes_weather
                WHERE cycling_route_id = $1
            ) actual_weather
            WHERE rank = 1
            `,
            [ routeId ],
            callback
        );
    }

    testProjection(callback) {
        this.pool.query(
            `
            SELECT st_asgeojson(ST_TRANSFORM(way::geometry, 4326)) AS geo, name FROM planet_osm_polygon 
            WHERE NAME = 'Fakulta informatiky a informačných technológií STU'
            `,
            callback
        );
    }
}

module.exports = Database;