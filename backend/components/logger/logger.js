const Bunyan = require('bunyan');

class Logger {
    constructor() {
        var date = new Date();
        let month = '' + (date.getMonth() + 1);
        let day = '' + date.getDate();
        let year = date.getFullYear();

        month = month.length < 2 ? '0' + month : month;
        day = day.length < 2 ? '0' + day : day;

        return Bunyan.createLogger({
            name: 'Smart cycling app logger',
            streams: [
                {
                    level: 'info',
                    path: './logs/'+year+'-'+month+'-'+day+'.log'
                }
            ]
        });
    }
}

module.exports = Logger;