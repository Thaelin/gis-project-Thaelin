const SwaggerUI  = require('swagger-ui-express');

module.exports = (app, logger) => {
    if (app && logger) {
        const swaggerDoc = require('./swagger.json');

        if (swaggerDoc) {
            app.use('/api-docs', SwaggerUI.serve, SwaggerUI.setup(swaggerDoc));
            logger.info('Swagger UI has been initialised. Live API doc available /api-docs URL');
        }
        else {
            logger.error('Could not load swagger.json API documentation');
        }
    }
    else {
        logger.error('Express app object or logger was not provided for Swagger');
    }
}