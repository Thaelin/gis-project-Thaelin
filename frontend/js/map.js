var map;
var canvas;
var currentPos;
var coordinates = document.getElementById('coordinates');
// coordinates geojson
var geojson;

var lineId = 0;

function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [day, month, year].join('.') + ' ' + d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds();
}

function addMapItem(data, featureType) {
    let type, id, layout, geometry, paint;

    switch (featureType) {
        case 'Polygon':
            type = 'fill';
            id = 'polygon_' + data.name;
            layout = {};
            geometry = {
                "type": "Polygon",
                "coordinates": JSON.parse(data.geo).coordinates
            };
            paint = {
                'fill-color': randomColor({ luminosity: 'dark' }),
                'fill-opacity': 0.8
            };
            break;
        case 'Line':
            type = 'line';
            id = 'line_' + lineId++;
            layout = {
                "line-join": "round",
                "line-cap": "round"
            };
            geometry = JSON.parse(data.geo);
            paint = {
                "line-color": 'black',
                "line-width": 1
            };
            break;
    }

    let layerObject = {
        "id": id,
        "type": type,
        "source": {
            "type": "geojson",
            "data": {
                "type": "Feature",
                "geometry": geometry
            }
        },
        "layout": layout,
        "paint": paint
    }

    //console.log(layerObject);

    map.addLayer(layerObject);
}

function addFeatureColleciton(data, i) {
    let id = lineId++;

    console.log(id);

    let layerObject = {
        "id": "" + i,
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
    }

    map.addLayer(layerObject);
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

                new mapboxgl.Marker(element)
                    .setLngLat(point.data.coordinates)
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
     