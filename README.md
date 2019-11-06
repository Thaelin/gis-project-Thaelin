# General course assignment

Build a map-based application, which lets the user see geo-based data on a map and filter/search through it in a meaningfull way. Specify the details and build it in your language of choice. The application should have 3 components:

1. Custom-styled background map, ideally built with [mapbox](http://mapbox.com). Hard-core mode: you can also serve the map tiles yourself using [mapnik](http://mapnik.org/) or similar tool.
2. Local server with [PostGIS](http://postgis.net/) and an API layer that exposes data in a [geojson format](http://geojson.org/).
3. The user-facing application (web, android, ios, your choice..) which calls the API and lets the user see and navigate in the map and shows the geodata. You can (and should) use existing components, such as the Mapbox SDK, or [Leaflet](http://leafletjs.com/).

## My project

Hubert's cycling app

**Application description**: 
Application will show cycling routes with correspondent weather data. It will help it's users decide which cycling routes to choose based on weather conditions. Application will support filtering cycling routes by route length or weather conditions.

Next use case will be to find shortest path to a nearest cycling route. User can either automatically find his location, or select any point on the map. 

**Data source**: 
Cycling routes will be downloaded from [Cykloportal.sk](http://www.cykloportal.sk/). Weather data will be downloaded through OpenWeatherMap API (there is one limitation - max. 60 API requests per minute - should be fine).

**Technologies used**: 
- Node.js for business logic and communication with DB
- PostgreSQL as a RDBMS
- HTML, CSS, JS for frontend representation
- Mapbox
