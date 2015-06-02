'use strict';
var DataSource = require('loopback-datasource-juggler').DataSource;

var config = {
    host: 'localhost',
    port: 28015,
    db: 'test'
};

global.getDataSource = global.getSchema = function(customConfig) {
    var db = new DataSource(require('../'), customConfig || config);
    db.log = function(a) {
        console.log(a); //eslint-disable-line no-console
    };

    return db;
};
