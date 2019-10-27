$(document).ready(function() {
    // Initialize map
    mapInit();

    map.on('load', function() {
        //addDraggableMarker();

        // load cycling routes
        $.get('/api/cyclingRoutes', data => {
            loadMapData(data);
        });

        console.log('here');

        // test projection
        // $.get('/api/test', data => {
        //     if (data[0])
        //         addMapItem(data[0], JSON.parse(data[0].geo).type);
        // });

        // test all roads
        // $.get('/api/allRoads', data => {
        //     console.log('data: ', data);
        //     //addMapItem(data, 'Polygon');
        //     data.forEach((line, i) => {
        //         if (line)
        //             addFeatureColleciton(line, i);
        //     });
            
        // });

        // Add a single point to the map
        map.addSource('point', {
            "type": "geojson",
            "data": geojson
        });
            
        map.addLayer({
            "id": "point",
            "type": "circle",
            "source": "point",
            "paint": {
                "circle-radius": 10,
                "circle-color": "#3887be"
            }
        });
        
            // When the cursor enters a feature in the point layer, prepare for dragging.
        map.on('mouseenter', 'point', function() {
            map.setPaintProperty('point', 'circle-color', '#3bb2d0');
            canvas.style.cursor = 'move';
        });
            
        map.on('mouseleave', 'point', function() {
            map.setPaintProperty('point', 'circle-color', '#3887be');
            canvas.style.cursor = '';
        });
            
        map.on('mousedown', 'point', function(e) {
            // Prevent the default map drag behavior.
            e.preventDefault();
            
            canvas.style.cursor = 'grab';
            
            map.on('mousemove', onMove);
            map.once('mouseup', onUp);
        });
            
        map.on('touchstart', 'point', function(e) {
            if (e.points.length !== 1) return;
            
            // Prevent the default map drag behavior.
            e.preventDefault();
            
            map.on('touchmove', onMove);
            map.once('touchend', onUp);
        });
    });
    
});