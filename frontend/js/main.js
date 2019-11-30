$(document).ready(function() {
    $('#temp-range').slider({});
    blockInputs();
    // Initialize map
    mapInit();

    initializeInputs();

    map.on('load', function() {
        // load cycling routes
        $.get('/api/cyclingRoutes', data => {
            loadMapData(data);

            // Add a single point to the map - draggable marker
            map.addSource('point', {
                "type": "geojson",
                "data": geojson
            });
                
            map.addLayer({
                "id": "point",
                "type": "circle",
                "source": "point",
                "paint": {
                    "circle-radius": 8,
                    "circle-color": "#3887be"
                }
            });
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

        enableInputs();
    });
    
});

function initializeInputs() {
    // Fill select box
    $.get('/api/getMapParts', (data) => {
        mapParts = data;
        data.forEach(part => {
            $('#parts').append($('<option>', {
                value: data.osm_id,
                text: part.name
            }));
        });

        $('#parts').val('Slovensko'); 
        displayMapPartSelection();
        
    });
}