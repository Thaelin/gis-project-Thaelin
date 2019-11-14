

## Hubert's cycling app

**Application description**: 
Application will show cycling routes with correspondent weather data and allow finding shortest route to nearest cycling route from chosen point. User's can also filter different parts of Slovakia.

**Data source**: 
Cycling routes will be downloaded from [Cykloportal.sk](http://http://www.cykloportal.sk/). Weather data will be downloaded through OpenWeatherMap API (there is one limitation - max. 60 API requests per minute - should be fine).

**Technologies used**: 
- Node.js for business logic and communication with DB
- PostgreSQL as a RDBMS
- HTML, CSS, JS for frontend representation
- Mapbox
