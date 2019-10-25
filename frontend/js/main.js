$(document).ready(function() {
    // Initialize map
    mapInit();

    map.on('load', function() {
        // load cycling routes
        $.get('/api/cyclingRoutes', data => {
            loadMapData(data);
        });

        console.log('here');

        // test projection
        $.get('/api/test', data => {
            if (data[0])
                addMapItem(data[0], JSON.parse(data[0].geo).type);
        });
    });
    
});