var map;

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
    let type, id;

    switch (featureType) {
        case 'Polygon':
            type = 'fill';
            id = 'polygon_' + data.name;
            break;
        case 'Line':
            type = 'line';
            break;
    }

    let layerObject = {
        "id": id,
        "type": type,
        "source": {
            "type": "geojson",
            "data": {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": JSON.parse(data.geo).coordinates
                }
            }
        },
        "layout": {
        },
        "paint": {
            'fill-color': randomColor({ luminosity: 'dark' }),
            'fill-opacity': 0.8
        }
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
        console.log(pos);
    });
}

function loadMapData(data) {

    data.forEach((route) => {

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
                "line-color": randomColor({ luminosity: 'dark' }),
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