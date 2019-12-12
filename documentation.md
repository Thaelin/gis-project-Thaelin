# Contents

1. Overview
2. Frontend
3. Backend
4. Data
5. Api
6. Queries
7. Application logging
8. Data model of own tables
9. Dependencies
10. Installation

# 1. Overview

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

# 2. Frontend

The frontend application consists of HTML page (`index.html`). HTML file are displaying showing cycling routes geodata on the map via JS Mapbox library. It also displays control panel.

*Control panel* contains 2 interactive parts: control for selecting region and action button initializing shortest path search. Passive part of the control panel is map legend.

*Map* contains all cycling routes and their corresponding weather data. Cycling routes are filtered based on inclusion of route start point with selected region. Selected region is displayed with opaque green color. Shortest route is displayed as orange line.

*Map initialization scripts* are stored in (`js/map.js`) file. *Script file for index file* is stored in (`js/main.js`).

*Route colors* are displayed as black. More information about color's and their meanings are in the Legend part of the UI.

*Weather icons* are obtained from *OpenWeatherMap repository*.

# 3. Backend

The backend application powered by Node.js and is responsible for:

* importing cycling routes data into POSTGIS database from gpx format
* continually gathering weather data relevant to saved routes data
* serving static files
* serving API
* communication with PostgreSQL database
* serving API documentation
* logging application events into log files

# 4. Data
## Cycling routes data
Cycling routes data are imported via an *bash* script that uses *ogr2ogr* tool for importing gpx formated data into POSTGIS database. Before import, script runs DDL commands that create required tables. DDL file is stored in (`backend/data_definition/ddl.sql`). Import script consists of bash file (`backend/data_import/import.sh`) and 2 supporting SQL scripts (`backend/data_import/import1.sql`) and (`backend/data_import/import2.sql`).
## Route topology data
For finding the shortest path from the selected position to nearest cycling route path start, an application needed a route topology that can be provided into Pgrouting extension's Djikstra algorithm. Therefore I used an external tool that can create and populate a topology data table based on .osm input. I stored the data into table named `route_topology`.

Tool is names osm2po and is written in Java. I fed it with osm data and it created an SQL script that creates a topology table with data.
```
java -Xmx1g -jar osm2po-core-5.2.43-signed.jar prefix=route_topology tileSize=x Slovakia.osm.pbf postp.0.class=de.cm.osm2po.plugins.postp.PgRoutingWriter
cd route_topology
psql -U postgres -d pdt_geo < route_topology_2po_4pgr.sql
```

## Weather data
Weather data is obtained from *OpenWeatherMap API*. Count of weather query points for 1 route depends on route's length. Routes with length < 30km are queried only for their starting and finishing points. Routes with length >= 30km and < 100km are queried for starting, finishing points and for middle route point. Routes longer than 100km are queried for start, first quarter, middle, third quarter and finish points.

*Gathering script* runs every X miliseconds - acording to configuration value stored in (`backend/config.json`). It queries every route for actual weather data and stores it into the table `weather_data`.

## Open Street Maps data
I used OSM data to select Slovakia's administrative regions. This data is used for filtering and inclusion of other geo data, such as points or lines.

# 5. Api
*API* is documented interactively through Swagger. When application runs, its interactive docs are accessible via URL: (`localhost:3000/api-docs`). There you can check all parameters needed and response value formats. You can also execute API calls from there as well. 

## Api methods
**GET: /getMapParts**

**Description:** get all Slovakia regions

**Parameters:** none

**Response format:**
application/json


**GET: /cyclingRoutesFilter/{region}/{minTemp}/{maxTemp}**

**Description:** returns cycling routes filtered by region and minimal and maximal average temperature

**Parameters:** 
* region: string
* minTemp: number
* maxTemp: number

**Response format:**
application/json


**GET: /weatherPoints/{routeId}**

**Description:** returns weather data points with actual weather for specific route

**Parameters:** 
* routeId: number

**Response format:**
application/json


**GET: /shortestPath/{lat}/{lon}/{region}/{minTemp}/{maxTemp}**

**Description:** returns shortest path from selected position to nearest filtered cycling route start point

**Parameters:** 
* lat
* lon
* region: string
* minTemp: number
* maxTemp: number

**Response format:**
application/json

# 6. Queries
All database communication is stored in *Database component*. It is located in (`Backend/components/database/database.js`).

**Notes**: 
- Ogr2ogr tool caused my lines to be of type MultiLineString => I needed to use ST_LineMerge everytime I wanted to use simple LineString methods.
- cycling_routes_weather table contained weather data for all cycling_routes with historic data and more data point types => that's why I needed to use window function to prefilter them


## Querying cycling routes filtered by average temperature and region

This query covers first basic Use case. Showcase and filtering of cycling routes based on average temperature of all checkpoints and selected region. `WITH` part selects a row with region - there can be 2 types of administrative types - 4 for subregions and 2 for countries. We can select whole Slovakia region that's why we need to use this `OR` condition. 

Query selects only routes that pass `IN` condition - average temperature is in range specified by user's input. Next condition part is `AND ST_Contains` that ensures that query will return only cycling routes with start point inside selected region.

This query simulates Use case when user wants to see cycling routes that belong to region "Nitriansky kraj" and their average temperature si between -2.4 to 30.0 Celsius degree.

```SQL
WITH kraj AS (
    SELECT osm_id, name, 
    ST_Transform(way, 4326) geo
    FROM planet_osm_polygon
    WHERE (admin_level = '4' AND name = 'Nitriansky kraj') OR (admin_level = '2' AND name = 'Nitriansky kraj')
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
    HAVING AVG((weather).temperature) >= -4.2 AND AVG((weather).temperature) <= 30.0
)
AND ST_Contains(kraj.geo, ST_StartPoint(ST_LineMerge(cr.route)))
```

**Example result**
```
4;"5118 - Machulince - Topoľčianky - Zubria Obora - Zlaté Moravce";"{"type":"LineString","coordinates":[[18.4297865442932,48.4130989853293],[18.4283393248916,48.4137638378888],[18.4281733632088,48.4138518478721],[18.4268509503454,48.4142039716244],[18.42414367944,48.414924480021],[18.4229192510247,48.4152819681913],[18.422 (...)";24.6997083760805
```

**Analyze**
```
"Merge Join  (cost=8337.36..8342.76 rows=1 width=362) (actual time=247.469..247.472 rows=1 loops=1)"
"  Merge Cond: (cr.fid = weather.cycling_route_id)"
"  CTE kraj"
"    ->  Index Scan using name on planet_osm_polygon  (cost=0.43..12.47 rows=1 width=58) (actual time=6.287..6.290 rows=1 loops=1)"
"          Index Cond: (name = 'Nitriansky kraj'::text)"
"          Filter: ((admin_level = '4'::text) OR (admin_level = '2'::text))"
"  ->  Sort  (cost=8.55..8.55 rows=1 width=354) (actual time=28.910..28.911 rows=1 loops=1)"
"        Sort Key: cr.fid"
"        Sort Method: quicksort  Memory: 25kB"
"        ->  Nested Loop  (cost=0.00..8.54 rows=1 width=354) (actual time=17.126..28.895 rows=1 loops=1)"
"              Join Filter: ((kraj.geo ~ st_startpoint(st_linemerge(cr.route))) AND _st_contains(kraj.geo, st_startpoint(st_linemerge(cr.route))))"
"              Rows Removed by Join Filter: 15"
"              ->  CTE Scan on kraj  (cost=0.00..0.02 rows=1 width=32) (actual time=6.469..6.474 rows=1 loops=1)"
"              ->  Seq Scan on cycling_routes cr  (cost=0.00..4.16 rows=16 width=354) (actual time=0.019..0.053 rows=16 loops=1)"
"  ->  GroupAggregate  (cost=8316.33..8318.76 rows=16 width=4) (actual time=207.337..207.342 rows=4 loops=1)"
"        Group Key: weather.cycling_route_id"
"        Filter: ((avg((weather.weather).temperature) >= '-4.2'::double precision) AND (avg((weather.weather).temperature) <= '30'::double precision))"
"        ->  Sort  (cost=8316.33..8316.88 rows=219 width=57) (actual time=207.319..207.321 rows=10 loops=1)"
"              Sort Key: weather.cycling_route_id"
"              Sort Method: quicksort  Memory: 31kB"
"              ->  Subquery Scan on weather  (cost=6771.67..8307.82 rows=219 width=57) (actual time=144.447..207.268 rows=47 loops=1)"
"                    Filter: (weather.rank = 1)"
"                    Rows Removed by Filter: 42689"
"                    ->  WindowAgg  (cost=6771.67..7759.20 rows=43890 width=80) (actual time=144.445..203.177 rows=42736 loops=1)"
"                          ->  Sort  (cost=6771.67..6881.40 rows=43890 width=72) (actual time=144.431..155.838 rows=42736 loops=1)"
"                                Sort Key: cycling_routes_weather.point_type, cycling_routes_weather.cycling_route_id, cycling_routes_weather.measure_date DESC"
"                                Sort Method: external merge  Disk: 3728kB"
"                                ->  Seq Scan on cycling_routes_weather  (cost=0.00..1584.90 rows=43890 width=72) (actual time=0.011..10.809 rows=42736 loops=1)"
"Planning time: 0.546 ms"
"Execution time: 248.542 ms"
```

**Optimize**

I saw that most of the computation time is in the `weather_data` aggregations. There is a sort condition based on average temperature. However, weather is a composite type and I tried many indices but none of these improved my solution. Only thing I managed to optimize was non critical part of the query - selecting startpoint of route data.

```SQL
CREATE INDEX
ON cycling_routes
USING gist
(ST_StartPoint(ST_LineMerge(route)))
WITH (FILLFACTOR=100);
```

```
"Merge Join  (cost=6409.72..6415.09 rows=1 width=362) (actual time=230.597..230.599 rows=1 loops=1)"
"  Merge Cond: (cr.fid = weather.cycling_route_id)"
"  CTE kraj"
"    ->  Index Scan using name on planet_osm_polygon  (cost=0.43..12.47 rows=1 width=58) (actual time=4.836..4.839 rows=1 loops=1)"
"          Index Cond: (name = 'Nitriansky kraj'::text)"
"          Filter: ((admin_level = '4'::text) OR (admin_level = '2'::text))"
"  ->  Sort  (cost=8.45..8.45 rows=1 width=354) (actual time=12.915..12.916 rows=1 loops=1)"
"        Sort Key: cr.fid"
"        Sort Method: quicksort  Memory: 25kB"
"        ->  Nested Loop  (cost=0.13..8.44 rows=1 width=354) (actual time=10.448..12.902 rows=1 loops=1)"
"              ->  CTE Scan on kraj  (cost=0.00..0.02 rows=1 width=32) (actual time=4.933..4.937 rows=1 loops=1)"
"              ->  Index Scan using cycling_routes_st_startpoint_idx on cycling_routes cr  (cost=0.13..8.41 rows=1 width=354) (actual time=5.507..7.955 rows=1 loops=1)"
"                    Index Cond: (kraj.geo ~ st_startpoint(st_linemerge(route)))"
"                    Filter: _st_contains(kraj.geo, st_startpoint(st_linemerge(route)))"
"                    Rows Removed by Filter: 6"
"  ->  GroupAggregate  (cost=6388.80..6391.19 rows=16 width=4) (actual time=206.454..206.460 rows=4 loops=1)"
"        Group Key: weather.cycling_route_id"
"        Filter: ((avg((weather.weather).temperature) >= '-4.2'::double precision) AND (avg((weather.weather).temperature) <= '30'::double precision))"
"        ->  Sort  (cost=6388.80..6389.34 rows=215 width=57) (actual time=206.437..206.438 rows=10 loops=1)"
"              Sort Key: weather.cycling_route_id"
"              Sort Method: quicksort  Memory: 31kB"
"              ->  Subquery Scan on weather  (cost=4878.13..6380.47 rows=215 width=57) (actual time=144.140..206.383 rows=47 loops=1)"
"                    Filter: (weather.rank = 1)"
"                    Rows Removed by Filter: 42877"
"                    ->  WindowAgg  (cost=4878.13..5843.92 rows=42924 width=80) (actual time=144.138..202.646 rows=42924 loops=1)"
"                          ->  Sort  (cost=4878.13..4985.44 rows=42924 width=72) (actual time=144.127..155.695 rows=42924 loops=1)"
"                                Sort Key: cycling_routes_weather.point_type, cycling_routes_weather.cycling_route_id, cycling_routes_weather.measure_date DESC"
"                                Sort Method: external merge  Disk: 3744kB"
"                                ->  Seq Scan on cycling_routes_weather  (cost=0.00..1575.24 rows=42924 width=72) (actual time=0.012..11.227 rows=42924 loops=1)"
"Planning time: 0.964 ms"
"Execution time: 231.731 ms"
```

**Evaluation of optimisation**

Minor optimisation reduced the query execution time by **6.77 %**.


## Querying shortest path from selected position to nearest cycling route

This query is used for the second main Use case of the application. It find the shortest path from selected position to nearest cycling route. The most important part of the query is the `pgr_dijkstra` part where the actual shortest path from point A to B is computed. Point A is in our case selected position and point B is the start of the nearest cycling route that conforms the region and temperature conditions.

The inner `WITH` clause is standard as in filtering Use case. Just selects all cycling routes conforming region and temperature conditions. The outer `WITH` clause orders them by distance to selected point and selects the closes one. Closest route's start point is then used as a target point in Dijsktra algorithm.

```SQL
WITH closest AS(
  WITH kraj AS (
      SELECT ST_Transform(way, 4326) geo
      FROM planet_osm_polygon
      WHERE (admin_level = '4' AND name = 'Bratislavský kraj') OR (admin_level = '2' AND name = 'Bratislavský kraj')
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
      HAVING AVG((weather).temperature) >= -4.2 AND AVG((weather).temperature) <= 30.0
  )
  AND ST_Contains(kraj.geo, ST_StartPoint(ST_LineMerge(cr.route)))
  ORDER BY ST_Distance(
      ST_StartPoint(ST_LineMerge(cr.route)),
      ST_SetSRID(ST_MakePoint(17.5902772, 48.487545), 4326)
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
      ST_SetSRID(ST_MakePoint(17.5902772, 48.487545), 4326)
  ) ASC
  LIMIT 1
),
(
  SELECT source 
  FROM route_topology
  CROSS JOIN closest
  ORDER BY ST_Distance(
      ST_StartPoint(ST_Transform(geom_way, 4326)),
      closest.sp
  ) ASC
  LIMIT 1
)
) as pt
JOIN route_topology rd ON pt.edge = rd.id
```

**Example result**
```
"{"type":"MultiLineString","coordinates":[[[17.0878121,48.1301822],[17.0864193,48.1296253],[17.0840847,48.1286655],[17.0833931,48.1284088],[17.0831136,48.1283115],[17.0829083,48.1282494],[17.0825894,48.1281606]],[[17.0825894,48.1281606],[17.0818622,48.12802 (...)"
```

**Analyze**
```
"Aggregate  (cost=128300.80..128303.31 rows=1 width=32) (actual time=3634.010..3634.010 rows=1 loops=1)"
"  CTE closest"
"    ->  Limit  (cost=6412.41..6412.42 rows=1 width=40) (actual time=203.965..203.970 rows=1 loops=1)"
"          CTE kraj"
"            ->  Limit  (cost=0.43..12.47 rows=1 width=32) (actual time=2.609..2.610 rows=1 loops=1)"
"                  ->  Index Scan using name on planet_osm_polygon  (cost=0.43..12.47 rows=1 width=32) (actual time=2.608..2.608 rows=1 loops=1)"
"                        Index Cond: (name = 'Bratislavský kraj'::text)"
"                        Filter: ((admin_level = '4'::text) OR (admin_level = '2'::text))"
"          ->  Sort  (cost=6399.94..6399.94 rows=1 width=40) (actual time=203.964..203.964 rows=1 loops=1)"
"                Sort Key: (st_distance(st_startpoint(st_linemerge(cr.route)), '0101000020E61000000F9315681C973140062AE3DF673E4840'::geometry))"
"                Sort Method: quicksort  Memory: 25kB"
"                ->  Merge Join  (cost=6397.25..6399.93 rows=1 width=40) (actual time=203.956..203.958 rows=1 loops=1)"
"                      Merge Cond: (cr.fid = weather.cycling_route_id)"
"                      ->  Sort  (cost=8.45..8.45 rows=1 width=36) (actual time=3.001..3.002 rows=1 loops=1)"
"                            Sort Key: cr.fid"
"                            Sort Method: quicksort  Memory: 25kB"
"                            ->  Nested Loop  (cost=0.13..8.44 rows=1 width=36) (actual time=2.990..2.994 rows=1 loops=1)"
"                                  ->  CTE Scan on kraj  (cost=0.00..0.02 rows=1 width=32) (actual time=2.656..2.657 rows=1 loops=1)"
"                                  ->  Index Scan using cycling_routes_st_startpoint_idx on cycling_routes cr  (cost=0.13..8.41 rows=1 width=36) (actual time=0.330..0.331 rows=1 loops=1)"
"                                        Index Cond: (kraj.geo ~ st_startpoint(st_linemerge(route)))"
"                                        Filter: _st_contains(kraj.geo, st_startpoint(st_linemerge(route)))"
"                      ->  GroupAggregate  (cost=6388.80..6391.19 rows=16 width=4) (actual time=200.540..200.563 rows=14 loops=1)"
"                            Group Key: weather.cycling_route_id"
"                            Filter: ((avg((weather.weather).temperature) >= '-4.2'::double precision) AND (avg((weather.weather).temperature) <= '30'::double precision))"
"                            ->  Sort  (cost=6388.80..6389.34 rows=215 width=57) (actual time=200.522..200.526 rows=44 loops=1)"
"                                  Sort Key: weather.cycling_route_id"
"                                  Sort Method: quicksort  Memory: 31kB"
"                                  ->  Subquery Scan on weather  (cost=4878.13..6380.47 rows=215 width=57) (actual time=137.971..200.479 rows=47 loops=1)"
"                                        Filter: (weather.rank = 1)"
"                                        Rows Removed by Filter: 42877"
"                                        ->  WindowAgg  (cost=4878.13..5843.92 rows=42924 width=80) (actual time=137.969..196.699 rows=42924 loops=1)"
"                                              ->  Sort  (cost=4878.13..4985.44 rows=42924 width=72) (actual time=137.954..149.760 rows=42924 loops=1)"
"                                                    Sort Key: cycling_routes_weather.point_type, cycling_routes_weather.cycling_route_id, cycling_routes_weather.measure_date DESC"
"                                                    Sort Method: external merge  Disk: 3744kB"
"                                                    ->  Seq Scan on cycling_routes_weather  (cost=0.00..1575.24 rows=42924 width=72) (actual time=0.010..10.973 rows=42924 loops=1)"
"  InitPlan 3 (returns $3)"
"    ->  Limit  (cost=54947.09..54947.09 rows=1 width=12) (actual time=826.574..826.576 rows=1 loops=1)"
"          ->  Sort  (cost=54947.09..56138.82 rows=476692 width=12) (actual time=826.573..826.573 rows=1 loops=1)"
"                Sort Key: (st_distance(st_startpoint(st_transform(route_topology.geom_way, 4326)), '0101000020E61000000F9315681C973140062AE3DF673E4840'::geometry))"
"                Sort Method: top-N heapsort  Memory: 25kB"
"                ->  Seq Scan on route_topology  (cost=0.00..52563.63 rows=476692 width=12) (actual time=0.041..727.649 rows=476692 loops=1)"
"  InitPlan 4 (returns $4)"
"    ->  Limit  (cost=59714.03..59714.03 rows=1 width=12) (actual time=1101.860..1101.861 rows=1 loops=1)"
"          ->  Sort  (cost=59714.03..60905.76 rows=476692 width=12) (actual time=1101.859..1101.859 rows=1 loops=1)"
"                Sort Key: (st_distance(st_startpoint(st_transform(route_topology_1.geom_way, 4326)), closest.sp))"
"                Sort Method: top-N heapsort  Memory: 25kB"
"                ->  Nested Loop  (cost=0.00..57330.57 rows=476692 width=12) (actual time=203.986..1006.453 rows=476692 loops=1)"
"                      ->  CTE Scan on closest  (cost=0.00..0.02 rows=1 width=32) (actual time=203.968..203.975 rows=1 loops=1)"
"                      ->  Seq Scan on route_topology route_topology_1  (cost=0.00..20386.92 rows=476692 width=111) (actual time=0.011..108.929 rows=476692 loops=1)"
"  ->  Nested Loop  (cost=0.68..7222.26 rows=1000 width=107) (actual time=3613.971..3614.717 rows=167 loops=1)"
"        ->  Function Scan on pgr_dijkstra pt  (cost=0.26..10.26 rows=1000 width=8) (actual time=3613.940..3613.964 rows=168 loops=1)"
"        ->  Index Scan using pkey_hh_2po_4pgr on route_topology rd  (cost=0.42..7.21 rows=1 width=111) (actual time=0.004..0.004 rows=1 loops=168)"
"              Index Cond: (id = pt.edge)"
"Planning time: 1.713 ms"
"Execution time: 3635.318 ms"

```

## Querying milestones of specific cycling route

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

**Example result**
```
10;166.256255642543;"{"type":"Point","coordinates":[17.793178986758,48.4294130187482]}";"{"type":"Point","coordinates":[17.8929706069304,48.7892133131268]}";"{"type":"Point","coordinates":[18.210459140606,49.0255235594301]}";"{"type":"Point","coordinates":[18.5119922443831,49.1996782265638]}";"{"type":"Point","coordinates":[18.8636630214751,49.1796110384166]}"
```

**Analyze**
```
"Seq Scan on cycling_routes  (cost=0.00..17.72 rows=1 width=172) (actual time=17.705..17.717 rows=1 loops=1)"
"  Filter: (fid = 10)"
"  Rows Removed by Filter: 15"
"Planning time: 0.226 ms"
"Execution time: 17.777 ms"
```

## Querying most actual weather data of cycling route

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

**Example result**
```
"FINISH";"(0.36,86,1007,13d,"light snow",1)";"2019-12-12 14:43:06.958"
"FIRSTQUARTER";"(1.3,99,1007,10d,"light rain",1)";"2019-12-12 14:43:06.99"
"MIDDLE";"(1.06,86,1007,13d,"light snow",1)";"2019-12-12 14:43:07.216"
"START";"(1.09,98,1007,50d,mist,1)";"2019-12-12 14:43:07.196"
"THIRDQUARTER";"(0.87,86,1007,13d,"light snow",1)";"2019-12-12 14:43:07.978"
```

**Analyze**
```
"Subquery Scan on actual_weather  (cost=1953.43..2099.49 rows=22 width=68) (actual time=16.342..22.270 rows=5 loops=1)"
"  Filter: (actual_weather.rank = 1)"
"  Rows Removed by Filter: 4496"
"  ->  WindowAgg  (cost=1953.43..2043.31 rows=4494 width=80) (actual time=16.340..21.880 rows=4501 loops=1)"
"        ->  Sort  (cost=1953.43..1964.67 rows=4494 width=68) (actual time=16.327..16.970 rows=4501 loops=1)"
"              Sort Key: cycling_routes_weather.point_type, cycling_routes_weather.measure_date DESC"
"              Sort Method: quicksort  Memory: 825kB"
"              ->  Seq Scan on cycling_routes_weather  (cost=0.00..1680.79 rows=4494 width=68) (actual time=0.023..8.752 rows=4501 loops=1)"
"                    Filter: (cycling_route_id = 10)"
"                    Rows Removed by Filter: 38376"
"Planning time: 0.208 ms"
"Execution time: 22.332 ms"
```

**Optimize**

I see a Seq Scan on `cycling_routes_weather` table. We can change this easily to Index Scan by creating an index on `cycling_route_id` column. Index on `measure_date` in descending order can also be useful.

```SQL
CREATE INDEX ON cycling_routes_weather(cycling_route_id);

CREATE INDEX ON cycling_routes_weather(measure_date DESC);
```

```
"Subquery Scan on actual_weather  (cost=1566.79..1714.63 rows=23 width=68) (actual time=9.999..15.985 rows=5 loops=1)"
"  Filter: (actual_weather.rank = 1)"
"  Rows Removed by Filter: 4501"
"  ->  WindowAgg  (cost=1566.79..1657.77 rows=4549 width=80) (actual time=9.997..15.598 rows=4506 loops=1)"
"        ->  Sort  (cost=1566.79..1578.16 rows=4549 width=68) (actual time=9.983..10.722 rows=4506 loops=1)"
"              Sort Key: cycling_routes_weather.point_type, cycling_routes_weather.measure_date DESC"
"              Sort Method: quicksort  Memory: 826kB"
"              ->  Bitmap Heap Scan on cycling_routes_weather  (cost=87.54..1290.41 rows=4549 width=68) (actual time=0.589..2.783 rows=4506 loops=1)"
"                    Recheck Cond: (cycling_route_id = 10)"
"                    Heap Blocks: exact=738"
"                    ->  Bitmap Index Scan on cycling_routes_weather_cycling_route_id_idx  (cost=0.00..86.41 rows=4549 width=0) (actual time=0.402..0.402 rows=4506 loops=1)"
"                          Index Cond: (cycling_route_id = 10)"
"Planning time: 0.187 ms"
"Execution time: 16.046 ms"
```

**Evaluation of optimisation**

Optimisation reduced the query execution time by **28.15 %** on average.


## Querying all available filtering regions and their center position

This query is used in populating region select box and also in region filtering and map centering. Application uses region geodata to colorize selected region and center the map relative to selected region's position. `ST_Centroid` function returns the centroid point for every region row.

```SQL
SELECT osm_id, name, 
  ST_AsGeoJSON(ST_Transform(way::geometry, 4326)) geo, 
  ST_AsGeoJSON(ST_Transform(ST_Centroid(way::geometry), 4326)) center 
  FROM planet_osm_polygon
WHERE admin_level = '4' OR name = 'Slovensko'
```

**Example result**
```
-388265;"Bratislavský kraj";"{"type":"Polygon","coordinates":[[[16.8331891,48.3805240998456],[16.8332193,48.3802084998456],[16.8332914,48.3799262998457],[16.8334366,48.3796188998458],[16.8344514,48.3782181998461],[16.8374269,48.3749881998469],[16.8382026,48.374497999847],[16.8392309,4 (...)";"{"type":"Point","coordinates":[17.1789898492853,48.31800148271]}"
-388266;"Trnavský kraj";"{"type":"Polygon","coordinates":[[[16.933595,48.6006259997913],[16.933599,48.6001909997914],[16.933633,48.5997359997915],[16.933687,48.5993429997916],[16.933809,48.5989349997917],[16.933974,48.5985149997919],[16.934186,48.598095999792],[16.93441,48.5977759 (...)";"{"type":"Point","coordinates":[17.5342221807029,48.355443952533]}"
-388267;"Trenčiansky kraj";"{"type":"Polygon","coordinates":[[[17.3530357,48.7775265997475],[17.353104,48.7774660997475],[17.3539395,48.7767713997477],[17.3543562,48.7764177997478],[17.3555703,48.775404499748],[17.3563613,48.7747463997482],[17.3566281,48.7745196997482],[17.3568324,48 (...)";"{"type":"Point","coordinates":[18.2135247597412,48.8594450308348]}"
-388268;"Nitriansky kraj";"{"type":"Polygon","coordinates":[[[17.705419,47.7589849999945],[17.7055077,47.7588990999945],[17.707338,47.7573599999948],[17.708579,47.756677999995],[17.709914,47.7560819999951],[17.711332,47.7555799999952],[17.712816,47.7551749999953],[17.718313,47.75418 (...)";"{"type":"Point","coordinates":[18.3107233160792,48.1435965316258]}"
```

**Analyze**
```
"Bitmap Heap Scan on planet_osm_polygon  (cost=8.88..26.90 rows=2 width=90) (actual time=29.989..588.695 rows=9 loops=1)"
"  Recheck Cond: ((admin_level = '4'::text) OR (name = 'Slovensko'::text))"
"  Heap Blocks: exact=9"
"  ->  BitmapOr  (cost=8.88..8.88 rows=2 width=0) (actual time=0.043..0.043 rows=0 loops=1)"
"        ->  Bitmap Index Scan on planet_osm_polygon_admin_level_idx  (cost=0.00..4.44 rows=1 width=0) (actual time=0.028..0.028 rows=8 loops=1)"
"              Index Cond: (admin_level = '4'::text)"
"        ->  Bitmap Index Scan on name  (cost=0.00..4.44 rows=2 width=0) (actual time=0.014..0.014 rows=1 loops=1)"
"              Index Cond: (name = 'Slovensko'::text)"
"Planning time: 0.144 ms"
"Execution time: 588.761 ms"
```

# 7. Application logging

Application logging is implemented with Bunyan library for Node.js. To view logs, you need to install bunyan with npm globally.

```
npm install -g bunyan
```

Logs are separated on daily basis. Format is: yyyy-mm-dd.log .
Example: to show a log auditions from 12. 12. 2019 use this command
```
bunyan 2019-12-12.log
```

![Screenshot 7](./doc-images/logs.png?raw=true)

# 8. Data model of own tables

![Screenshot 6](./doc-images/db_design.png?raw=true)

# 9. Dependencies
1. Node.js
```
sudo apt-get install curl
curl -sL https://deb.nodesource.com/setup_13.x | sudo -E bash -
sudo apt-get install nodejs
```
2. PostgreSQL 10
3. Postgis and Pgrouting extensions

# 10. Installation
1. Clone `https://github.com/fiit-pdt-2019/gis-project-Thaelin` repo.
2. Navigate into `/backend` folder in the cloned repository and install dependencies.
```
npm install
```
4. Extract data zip in `/backend/data_import/pg_dump.zip`.
5. Import data from dump into your database.
```SQL
cd gis-project-Thaelin/backend/data_import
psql -v ON_ERROR_STOP=1 -U postgres -d pdt_geo < pg_dump.sql
```
6. Run the app.
```
cd gis-project-Thaelin/backend
node app.js
```
7. Open the app in the browser. Default URL is http://localhost:3000.
