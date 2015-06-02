'use strict';

var path = require('path');

module.exports = function() {
    var cwd = process.env.INIT_CWD || '';
    var clientFolder = 'client'; // the source file folder
    var defaultTarget = 'app'; // the name of the app that corresponds to index.html
    var constants = {
        appname: 'loopback-connector-rethinkdbdash',
        cwd: cwd,
        defaultTarget: defaultTarget,
        targetName: '{{targetName}}',
        targetSuffix: '{{targetSuffix}}',
        mode: '{{mode}}',
        clientFolder: clientFolder,
        repository: 'https://github.com/Yoobic/loopback-connector-rethinkdbdash',
        versionFiles: ['./package.json', './bower.json', './' + clientFolder + '/config*.xml'],
        growly: {
            notify: false,
            successIcon: path.join(cwd, 'node_modules/karma-growl-reporter/images/success.png'),
            failedIcon: path.join(cwd, 'node_modules/karma-growl-reporter/images/failed.png')
        },
        lint: [
            './*.js', 'gulpfile.js', './gulp_tasks/**/*.js', './test/**/*.js', './lib/**/*.js'
        ],
        mocha: {
            libs: ['./*.js', '!gulpfile.js'],
            tests: ['./test/**/*.js'],
            globals: 'test/helpers/globals.js',
            timeout: 5000
        },
        dist: {
            distFolder: './dist/{{targetName}}/{{mode}}'
        }
    };

    return constants;
};
