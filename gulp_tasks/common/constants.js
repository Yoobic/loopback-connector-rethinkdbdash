/*eslint no-empty:0*/
'use strict';

var path = require('path');

var getRepository = function() {
    var repository = 'https://github.com/user/repo';
    try {
        var helper = require('./helper');
        var packageJson = helper.readJsonFile('./package.json');
        var _ = require('lodash');
        if(_.isString(packageJson.repository)) {
            repository = packageJson.repository.replace('.git', '');
        } else {
            repository = packageJson.repository.url.replace('.git', '');
        }
    } catch(err) {}
    return repository;
};

var getAppname = function() {
    var appname;
    try {
        var helper = require('./helper');
        var packageJson = helper.readJsonFile('./package.json');
        appname = packageJson.name;
    } catch(err) {}
    return appname;
};

module.exports = function() {
    var cwd = process.env.INIT_CWD || '';
    var clientFolder = 'client'; // the source file folder
    var defaultTarget = 'app'; // the name of the app that corresponds to index.html
    var constants = {
        cwd: cwd,
        defaultTarget: defaultTarget,
        appname: getAppname(),
        targetName: '{{targetName}}',
        targetSuffix: '{{targetSuffix}}',
        mode: '{{mode}}',
        clientFolder: clientFolder,
        repository: getRepository(),
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
