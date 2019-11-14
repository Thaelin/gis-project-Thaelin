var map;
var canvas;
var currentPos;
var coordinates = document.getElementById('coordinates');
var collectionId = 0;
// coordinates geojson
var geojson;
var shortestPathLayerId = undefined;
var lineId = 0;
var displayedRoutes = [];
var displayedMarkers = [];
var mapParts = [];

function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [day, month, year].join('.') + ' ' + d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds();
}

function addFeatureCollection(data, color) {
    let id = collectionId++;

    console.log(id);

    let layerObject = {
        "id": "collection_" + id,
        "type": "line",
        "source": {
            "type": "geojson",
            "data": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties":{},
                        "geometry": JSON.parse(data.geo)
                    }
                    
                ]
                
            }
        },
        "paint": {
            "line-color": color ? color : 'black',//randomColor({ luminosity: 'dark' }),
            "line-width": 3
        }
    }

    map.addLayer(layerObject);
    return layerObject.id;
}

function mapInit(data) {
    // Initialize map
    mapboxgl.accessToken = 'pk.eyJ1IjoiZmxheXRydWUiLCJhIjoiY2pud3V2b2k0MDFybDNxcWw0cm13dmwwZiJ9.96Hi1GHh8GNtHaiMoRkq0w';

    map = new mapboxgl.Map({
        container: 'map',
        center: [19.696058, 48.6737532],
        zoom: 7.15,
        style: 'mapbox://styles/flaytrue/cjpcl12fo22xq2snw85xbzsm3?optimize=true'
    });

    canvas = map.getCanvasContainer();

    if (data) {
        map.on('style.load', function() {
            loadMapData(data);
        });
    }

    map.addControl(new mapboxgl.GeolocateControl({
        positionOptions: {
            enableHighAccuracy: true
        },
        trackUserLocation: true
    }));

    map.addControl(new mapboxgl.NavigationControl);

    navigator.geolocation.getCurrentPosition(pos => {
        geojson = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [pos.coords.longitude, pos.coords.latitude]
                }
            }]
        };
        currentPos = pos;
    });
    
}

function loadMapData(data) {

    data.forEach((route) => {

        //console.log('route.route: ', route.route);

        console.log(map.layers);

        map.addLayer({
            "id": "route_" + route.name,
            "type": "line",
            "source": {
                "type": "geojson",
                "data": {
                    "type": "Feature",
                    "properties": {},
                    "geometry": route.route
                }
            },
            "layout": {
                "line-join": "round",
                "line-cap": "round"
            },
            "paint": {
                "line-color": 'black',//randomColor({ luminosity: 'dark' }),
                "line-width": 3
            }
        });
        
        displayedRoutes.push("route_" + route.name);

        // get actual weather points for each route
        
        $.get('/api/weatherPoints/' + route.fid, data => {
            
            data.forEach(point => {
                var element = document.createElement('div');

                switch(point.type) {
                    case 'START':
                        element.className = 'marker-start';
                        break;
                    case 'FINISH':
                        element.className = 'marker-finish';
                        break;
                    default:
                        element.className = 'marker-weather';
                }

                let marker = new mapboxgl.Marker(element).
                setLngLat(point.data.coordinates)
                .setPopup(
                    new mapboxgl.Popup({ offset: 25 })
                        .setHTML(
                            `<h4>${point.type.toLowerCase().replace(/^./, str => str.toUpperCase())} milestone</h4><p><b>Route:</b> ${route.name}</p>
                            <p><b>Length:</b> ${route.length.toFixed(2)} km</p>
                            <img alt="weather-icon" src="/assets/icons/${point.data.weather.icon}.png"/>
                            <p><b>Description:</b> ${point.data.weather.description}</p>
                            <p><b>Temperature:</b> ${point.data.weather.temperature} °C</p>
                            <p><b>Humidity:</b> ${point.data.weather.humidity} %</p>
                            <p><b>Pressure:</b> ${point.data.weather.pressure} HpA</p>
                            <p><b>Last weather update:</b> ${formatDate(point.data.measureDate)}</p>
                            `
                        )
                )
                .addTo(map);
                displayedMarkers.push(marker);
                
            });
            

            $('#loading').hide();
        });
    });
    

    if (data.length === 0 ) {
        $('#loading').hide();
    }
}

function onMove(e) {
    var coords = e.lngLat;
     
    // Set a UI indicator for dragging.
    canvas.style.cursor = 'grabbing';
     
    // Update the Point feature in `geojson` coordinates
    // and call setData to the source layer `point` on it.
    geojson.features[0].geometry.coordinates = [coords.lng, coords.lat];
    map.getSource('point').setData(geojson);
}
     
function onUp(e) {
    var coords = e.lngLat;
     
    // Print the coordinates of where the point had
    // finished being dragged to on the map.
    coordinates.style.display = 'block';
    coordinates.innerHTML = 'Longitude: ' + coords.lng + '<br />Latitude: ' + coords.lat;
    canvas.style.cursor = '';
     
    // Unbind mouse/touch events
    map.off('mousemove', onMove);
    map.off('touchmove', onMove);
}
     

function shortestPath() {
    $('#loading').show();
    blockInputs();
    let mapPart = $('#parts').val();
    if (map.getLayer(shortestPathLayerId)) {
        map.removeLayer(shortestPathLayerId);
    }
    $.get('/api/shortestPath/'+geojson.features[0].geometry.coordinates[0]+'/'+geojson.features[0].geometry.coordinates[1]+'/'+mapPart, data => {
        $('#loading').hide();
        enableInputs();
        if (data[0].geo !== null) {
            shortestPathLayerId = addFeatureCollection(data[0], 'orange');
        }
        else {
            alert('No path');
        }
        
    });
}

function filterRoutes(partName) {
    blockInputs();
    clearDisplayedRoutes();
    if (map.getLayer(shortestPathLayerId)) {
        map.removeLayer(shortestPathLayerId);
    }
    if (partName === 'Slovensko') {
        $.get('/api/cyclingRoutes', data => {
            loadMapData(data);
        });
    }
    else {
        $.get('/api/cyclingRoutesIntersectingPart/' + partName, data => {
            loadMapData(data);
        });
    }
    enableInputs();
}

function clearDisplayedRoutes() {
    displayedRoutes.forEach(route => {
        if (map.getLayer(route)) {
            map.removeLayer(route);
        }
        if (map.getSource(route)) {
            map.removeSource(route);
        }
    });
    displayedRoutes = [];

    displayedMarkers.forEach(marker => {
        marker.remove();
    });
    displayedMarkers = [];
}

function blockInputs() {
    $('#parts').prop('disabled', true);
    $('#shortest-path-button').prop('disabled', true);
}

function enableInputs() {
    $('#parts').prop('disabled', false);
    $('#shortest-path-button').prop('disabled', false);
}

function displayMapPartSelection() {
    if (map.getLayer('mapPartSelection')) {
        map.removeLayer('mapPartSelection');
    }
    if (map.getSource('mapPartSelection')) {
        map.removeSource('mapPartSelection');
    }

    let partName = $('#parts').val();
    let part = mapParts.find(part => {
        return part.name === partName;
    });

    console.log(part);
    map.setCenter(JSON.parse(part.center).coordinates);

    let layerObject = {
        "id": "mapPartSelection",
        "type": "fill",
        "source": {
            "type": "geojson",
            "data": {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": JSON.parse(part.geo).coordinates   
                }
            }
        },
        "layout": {},
        "paint": {
            "fill-color": "green",
            "fill-opacity": 0.45
        }
    }

    map.addLayer(layerObject);

    
}