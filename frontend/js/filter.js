$(document).ready(function() {
    $('#loading').hide();

    $('#filterLengthSubmit').click(function() {
        // Filter data to be sent
        var filterData = {};
        var validationErrors = 0;
        // Raw input values
        var minLengthInput = $('#minLengthInput').val();
        var maxLengthInput = $('#maxLengthInput').val();

        // Route length validations
        if (minLengthInput) {
            if (isNaN(minLengthInput)) {
                validationErrors++;
                $('#lengthMustBeNumber').show();
            }
            else {
                $('#lengthMustBeNumber').hide();
                var minLength = Number(minLengthInput);
            }
        }
        if (maxLengthInput) {
            if (isNaN(maxLengthInput)) {
                validationErrors++;
                $('#lengthMustBeNumber').show();
            }
            else {
                $('#lengthMustBeNumber').hide();
                var maxLength = Number(maxLengthInput);
            }
        }
        if (minLength && maxLength) {
            if (minLength > maxLength) {
                validationErrors++;
                $('#minOverlapsMaxWarning').show();
            }
            else {
                $('#minOverlapsMaxWarning').hide();
            }
        }
        filterData.minLength = minLength;
        filterData.maxLength = maxLength;

        if (validationErrors === 0) {
            $.post('/api/cyclingRoutes/length', filterData, data => {
                $('#filter-form').hide();
                $('#loading').show();
                $('#map').show();
                $('#filter-list').show();
                // show individual filter list items 
                if (filterData.minLength && filterData.maxLength) {
                    $('#routeLengthFilter').show().append(filterData.minLength + ' km - ' + filterData.maxLength + ' km');
                }
                else if (filterData.minLength) {
                    $('#routeLengthFilter').show().append('>= ' + filterData.minLength + ' km');
                }
                else if (filterData.maxLength) {
                    $('#routeLengthFilter').show().append('<= ' + filterData.maxLength + ' km');
                }
                mapInit(data);
            });
        }
        
    });

    $('#filterWeatherSubmit').click(function() {
        // Filter data to be sent
        var filterData = {};
        var validationErrors = 0;
        // Raw input values
        var minTempInput = $('#minTempInput').val();
        var maxHumidityInput = $('#maxHumidityInput').val();

        // Weather input validations
        if (minTempInput) {
            if (isNaN(minTempInput)) {
                validationErrors++;
                $('#mustBeNumber').show();
            }
            else {
                $('#mustBeNumber').hide();
                var minTemp = Number(minTempInput);
            }
        }
        if (maxHumidityInput) {
            if (isNaN(maxHumidityInput)) {
                validationErrors++;
                $('#mustBeNumber').show();
            }
            else {
                $('#mustBeNumber').hide();
                var maxHumidity = Number(maxHumidityInput);
            }
        }
        filterData.minTemp = minTemp;
        filterData.maxHumidity = maxHumidity;

        if (validationErrors === 0) {
            $.post('/api/cyclingRoutes/weather', filterData, data => {
                $('#filter-form').hide();
                $('#loading').show();
                $('#map').show();
                $('#filter-list').show();
                // show individual filter list items 
                if (filterData.minTemp) {
                    $('#minTempFilter').show().append(filterData.minTemp + ' °C');
                }
                if (filterData.maxHumidity) {
                    $('#maxHumidityFilter').show().append(filterData.maxHumidity + ' %');
                }
                mapInit(data);
            });
        }
        
    });
});