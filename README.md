

## Hubert's cycling app

**Application description**: 
Application will show cycling routes with correspondent weather data and allow finding shortest route to nearest cycling route from chosen point. User's can also filter routes based on different administrative parts of Slovakia and average route temperature. This allows application users to choose routes fit for their position and weather expectations. 

**Data source**: 
Cycling routes will be downloaded from [Cykloportal.sk](http://www.cykloportal.sk/). Weather data will be downloaded through OpenWeatherMap API (there is one limitation - max. 60 API requests per minute).

**Technologies used**: 
- Node.js with Express framework for business logic and communication with DB
- PostgreSQL as a RDBMS with Postgis and Pgrouting extensions
- HTML, CSS, JS for frontend representation
- Mapbox
- Importers of Geo data such as ogr2ogr, osm2po
