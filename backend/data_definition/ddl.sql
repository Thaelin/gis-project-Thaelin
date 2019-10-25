DROP TABLE IF EXISTS cycling_routes;
DROP TABLE IF EXISTS cycling_routes_weather;

CREATE TYPE WEATHER_TYPE AS (
    temperature REAL,
    humidity REAL,
    pressure REAL,
    icon VARCHAR(150),
    description VARCHAR(255),
    weather_index REAL
);

CREATE TABLE cycling_routes (
    fid SERIAL,
    name VARCHAR(150),
    route GEOMETRY(MultiLineString,4326),
    CONSTRAINT cycling_routes_pkey PRIMARY KEY (fid)
);

CREATE TABLE cycling_routes_weather (
    id SERIAL,
    cycling_route_id INTEGER,
    point_type VARCHAR(50),
    weather WEATHER_TYPE,
    measure_date TIMESTAMP,
    CONSTRAINT cycling_routes_weather_pkey PRIMARY KEY (id),
    CONSTRAINT cycling_routes_fkey FOREIGN KEY(cycling_route_id) REFERENCES cycling_routes (fid)
);

CREATE INDEX ON cycling_routes_weather (measure_date);

CREATE OR REPLACE FUNCTION import_data() RETURNS VOID AS $$
DECLARE 
    route tracks%ROWTYPE;
BEGIN
    FOR route IN
        SELECT * FROM tracks
    LOOP
        INSERT INTO cycling_routes(name, route) VALUES(route.name, route.wkb_geometry);
    END LOOP;        
END
$$
LANGUAGE plpgsql;