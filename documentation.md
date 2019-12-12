# Overview

Application works with cycling routes data on the map and it's most important features are:

* show cycling routes and their data - name and length
* show cycling route's weather data
* filter routes based on region - default is whole Slovakia
* find shortest path from selected position to nearest cycling route

This is it in action:

## Default view
![Screenshot 1](./doc-images/1.png?raw=true "")
## Route point's detail
![Screenshot 2](./doc-images/5.png?raw=true)
## Legend display
![Screenshot 3](./doc-images/2.png?raw=true)
## Filtering region's and average temperature range
![Screenshot 4](./doc-images/3.png?raw=true)
## Shortest path from selected point to nearest filtered route start
![Screenshot 5](./doc-images/4.png?raw=true)

The application has 2 separate parts, the client which is a [frontend web application](#frontend) using mapbox API and mapbox.js and the [backend application](#backend) written in [Node.js](https://nodejs.org/en/), backed by PostGIS. The frontend application communicates with backend using an [API](#api). API is documented in interactive form with Swagger tool.

# Frontend

The frontend application consists of HTML page (`index.html`). HTML file are displaying showing cycling routes geodata on the map via JS Mapbox library. It also displays control panel.

*Control panel* contains 2 interactive parts: control for selecting region and action button initializing shortest path search. Passive part of the control panel is map legend.

*Map* contains all cycling routes and their corresponding weather data. Cycling routes are filtered based on inclusion of route start point with selected region. Selected region is displayed with opaque green color. Shortest route is displayed as orange line.

*Map initialization scripts* are stored in (`js/map.js`) file. *Script file for index file* is stored in (`js/main.js`).

*Route colors* are displayed as black. More information about color's and their meanings are in the Legend part of the UI.

*Weather icons* are obtained from *OpenWeatherMap repository*.

# Backend

The backend application powered by Node.js and is responsible for:

* importing cycling routes data into POSTGIS database from gpx format
* continually gathering weather data relevant to saved routes data
* serving static files
* serving API
* communication with PostgreSQL database
* serving API documentation
* logging application events into log files

## Data
### Cycling routes data
Cycling routes data are imported via an *bash* script that uses *ogr2ogr* tool for importing gpx formated data into POSTGIS database. Before import, script runs DDL commands that create required tables. DDL file is stored in (`backend/data_definition/ddl.sql`). Import script consists of bash file (`backend/data_import/import.sh`) and 2 supporting SQL scripts (`backend/data_import/import1.sql`) and (`backend/data_import/import2.sql`).
### Route topology data
For finding the shortest path from the selected position to nearest cycling route path start, an application needed a route topology that can be provided into Pgrouting extension's Djikstra algorithm. Therefore I used an external tool that can create and populate a topology data table based on .osm input. I stored the data into table named `route_topology`.

### Weather data
Weather data is obtained from *OpenWeatherMap API*. Count of weather query points for 1 route depends on route's length. Routes with length < 30km are queried only for their starting and finishing points. Routes with length >= 30km and < 100km are queried for starting, finishing points and for middle route point. Routes longer than 100km are queried for start, first quarter, middle, third quarter and finish points.

*Gathering script* runs every X miliseconds - acording to configuration value stored in (`backend/config.json`). It queries every route for actual weather data and stores it into the table `weather_data`.

### Open Street Maps data
I used OSM data to select Slovakia's administrative regions. This data is used for filtering and inclusion of other geo data, such as points or lines.

## Api
*API* is documented interactively through Swagger. When application runs, its interactive docs are accessible via URL: (`localhost:3000/api-docs`). There you can check all parameters needed and response value formats. You can also execute API calls from there as well. 
![Screenshot 4](http://i65.tinypic.com/2zf5rep.png)

### Api methods
**GET: /cyclingRoutes**

**Description:** get all cycling routes

**Parameters:** none

**Response format:**
[
  {
    "fid": 0,
    "name": "string",
    "route": [
      {
        "lat": 0,
        "lon": 0
      }
    ],
    "length": 0
  }
]

**POST: cyclingRoutes/weather**

**Description:** get cycling routes filtered by temperature and humidity

**Parameters:**

  * minTemp
  * maxTemp

**Response format:**
[
  {
    "fid": 0,
    "name": "string",
    "route": [
      {
        "lat": 0,
        "lon": 0
      }
    ],
    "length": 0
  }
]

## Communication with database
All database communication is stored in *Database component*. It is located in (`Backend/components/database/database.js`).

### Queries
**Notes**: 
- Ogr2ogr tool caused my lines to be of type MultiLineString => I needed to use ST_LineMerge everytime I wanted to use simple LineString methods.
- cycling_routes_weather table contained weather data for all cycling_routes with historic data and more data point types => that's why I needed to use window function to prefilter them


**Querying cycling routes filtered by average temperature and region**

This query covers first basic Use case. Showcase and filtering of cycling routes based on average temperature of all checkpoints and selected region. `WITH` part selects a row with region - there can be 2 types of administrative types - 4 for subregions and 2 for countries. We can select whole Slovakia region that's why we need to use this `OR` condition. 

Query selects only routes that pass `IN` condition - average temperature is in range specified by user's input. Next condition part is `AND ST_Contains` that ensures that query will return only cycling routes with start point inside selected region.

This query simulates Use case when user wants to see cycling routes that belong to region "Nitriansky kraj" and their average temperature si between -2.4 to 30.0 Celsius degree.

```SQL
WITH kraj AS (
    SELECT osm_id, name, 
    ST_Transform(way, 4326) geo
    FROM planet_osm_polygon
    WHERE (admin_level = '4' AND name = "Nitriansky kraj") OR (admin_level = '2' AND name = "Nitriansky kraj")
)
SELECT cr.fid, cr.name, ST_AsGeoJSON(ST_LineMerge(cr.route)) AS route, ST_Length(cr.route::geography)/1000 as length 
FROM cycling_routes cr
CROSS JOIN kraj
WHERE cr.fid IN (
    SELECT cycling_route_id FROM (
        SELECT cycling_route_id, point_type, weather, measure_date, 
        rank() OVER (
            PARTITION BY point_type, cycling_route_id ORDER BY measure_date DESC
        ) 
        FROM cycling_routes_weather
    ) weather
    WHERE rank = 1
    GROUP BY cycling_route_id
    HAVING AVG((weather).temperature) >= -2.4 AND AVG((weather).temperature) <= 30.0
)
AND ST_Contains(kraj.geo, ST_StartPoint(ST_LineMerge(cr.route)))
```

**Querying shortest path from selected position to nearest cycling route**

This query is used for the second main Use case of the application. It find the shortest path from selected position to nearest cycling route. The most important part of the query is the `pgr_dijkstra` part where the actual shortest path from point A to B is computed. Point A is in our case selected position and point B is the start of the nearest cycling route that conforms the region and temperature conditions.

The inner `WITH` clause is standard as in filtering Use case. Just selects all cycling routes conforming region and temperature conditions. The outer `WITH` clause orders them by distance to selected point and selects the closes one. Closest route's start point is then used as a target point in Dijsktra algorithm.

```SQL
WITH closest AS(
  WITH kraj AS (
      SELECT ST_Transform(way, 4326) geo
      FROM planet_osm_polygon
      WHERE admin_level IN('2','4') AND name = $3
      LIMIT 1
  )
  SELECT ST_StartPoint(ST_LineMerge(route)) sp
  FROM cycling_routes cr
  CROSS JOIN kraj
  WHERE cr.fid IN (
      SELECT cycling_route_id FROM (
          SELECT cycling_route_id, point_type, weather, measure_date, 
          rank() OVER (
              PARTITION BY point_type, cycling_route_id ORDER BY measure_date DESC
          ) 
          FROM cycling_routes_weather
      ) weather
      WHERE rank = 1
      GROUP BY cycling_route_id
      HAVING AVG((weather).temperature) >= $4 AND AVG((weather).temperature) <= $5
  )
  AND ST_Contains(kraj.geo, ST_StartPoint(ST_LineMerge(cr.route)))
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
```

**Querying milestones of specific cycling route**

This query is used to select checkpoints for specific route. It creates Point types from Line type by interpolation - `ST_Line_Interpolate_Point` and other functions. Function also returns the length of whole cycling route by using `ST_Length` function.

Example query returns interpolation points and length of the cycling route "Vážska cyklomagistrála".
```SQL
SELECT 
    fid,
    ST_Length(route::geography)/1000 as length,
    ST_AsGeoJSON(ST_StartPoint(ST_LineMerge(route))) AS route_start,
    ST_AsGeoJSON(ST_Line_Interpolate_Point(ST_LineMerge(route), 0.25)) AS route_first_quarter,
    ST_AsGeoJSON(ST_Line_Interpolate_Point(ST_LineMerge(route), 0.5)) AS route_middle,
    ST_AsGeoJSON(ST_Line_Interpolate_Point(ST_LineMerge(route), 0.75)) AS route_third_quarter,
    ST_AsGeoJSON(ST_EndPoint(ST_LineMerge(route))) AS route_finish
FROM cycling_routes
WHERE fid = 10
```

**Querying most actual weather data of cycling route**

This query is used for selecting most actual weather data of a specific route. Interesting thing is, that we defined own composite data type to store weather data. More information about this in installation section - DDL.

```SQL
SELECT point_type, weather, measure_date FROM (
    SELECT id, point_type, weather, measure_date, 
    rank() OVER (
        PARTITION BY point_type ORDER BY measure_date DESC
    ) 
    FROM cycling_routes_weather
    WHERE cycling_route_id = 10
) actual_weather
WHERE rank = 1
```

**Querying all available filtering regions and their center position**

This query is used in populating region select box and also in region filtering and map centering. Application uses region geodata to colorize selected region and center the map relative to selected region's position. `ST_Centroid` function returns the centroid point for every region row.

```SQL
SELECT osm_id, name, 
  ST_AsGeoJSON(ST_Transform(way::geometry, 4326)) geo, 
  ST_AsGeoJSON(ST_Transform(ST_Centroid(way::geometry), 4326)) center 
  FROM planet_osm_polygon
WHERE admin_level = '4' OR name = 'Slovensko'
```

# Installation
1. Install node.js
```
sudo apt-get install curl
curl -sL https://deb.nodesource.com/setup_13.x | sudo -E bash -
sudo apt-get install nodejs
```
2. Clone `https://github.com/fiit-pdt-2019/gis-project-Thaelin` repo.
3. Navigate into `/backend` folder in the cloned repository and install dependencies.
```
npm install
```
4. Install PostgreSQL database.
5. 
