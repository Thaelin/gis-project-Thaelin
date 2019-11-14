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

    getShortestPath(lat, lon, mapPart, callback) {
        this.pool.query(
            `
            WITH closest AS(
                WITH kraj AS (
                    SELECT ST_Transform(way, 4326) geo
                    FROM planet_osm_polygon
                    WHERE admin_level IN('2','4') AND name = $3
                )
                SELECT ST_StartPoint(ST_LineMerge(route)) sp
                FROM cycling_routes cr
                CROSS JOIN kraj
                WHERE ST_Intersects(kraj.geo, ST_LineMerge(cr.route))
                ORDER BY ST_Distance(
                    ST_StartPoint(ST_LineMerge(cr.route)),
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)
                ) ASC
                LIMIT 1
            )
            SELECT ST_AsGeoJSON(ST_Union(st_transform(geom_way::geometry, 4326))) geo
            FROM pgr_dijkstra(
               'SELECT id, source, target, cost, reverse_cost FROM route_topology',
              (
                SELECT source 
                FROM route_topology
                ORDER BY ST_Distance(
                    ST_StartPoint(ST_Transform(geom_way, 4326)),
                    ST_SetSRID(ST_MakePoint($1, $2), 4326), true
                ) ASC
                LIMIT 1
            ),
            (
                SELECT source 
                FROM route_topology
                CROSS JOIN closest
                ORDER BY ST_Distance(
                    ST_StartPoint(ST_Transform(geom_way, 4326)),
                    closest.sp, true
                ) ASC
                LIMIT 1
            )
            ) as pt
            JOIN route_topology rd ON pt.edge = rd.id
            `,
            [lat, lon, mapPart],
            callback
        );
        
    }

    getMapParts(callback) {
        this.pool.query(
            `
            SELECT osm_id, name, 
            ST_AsGeoJSON(ST_Transform(way::geometry, 4326)) geo, 
            ST_AsGeoJSON(ST_Transform(ST_Centroid(way::geometry), 4326)) center 
            FROM planet_osm_polygon
	        WHERE admin_level = '4' OR name = 'Slovensko'
            `,
            callback
        );
    }

    cyclingRoutesIntersectingPart(part, callback) {
        this.pool.query(
            `
            WITH kraj AS (
                SELECT osm_id, name, 
                ST_Transform(way, 4326) geo
                FROM planet_osm_polygon
                WHERE admin_level = '4' AND name = $1
            )
            SELECT cr.fid, cr.name, ST_AsGeoJSON(ST_LineMerge(cr.route)) AS route, ST_Length(cr.route::geography)/1000 as length 
            FROM cycling_routes cr
            CROSS JOIN kraj
            WHERE ST_Intersects(ST_LineMerge(cr.route), kraj.geo)
            `,
            [part],
            callback
        );
    }
}

module.exports = Database;