
// utilities module
var utilities = require(__dirname + '/../shared/utilities-0.0.3');

var https = require('https');

var querystring = require('querystring');

// load the jamendo api wrapper module
var jamendoModule = require('jamendo');

var oauthConnect = function(options) {
    
    var configuration = options.configuration;

    // create a new jamendo api instance
    this.jamendo = new jamendoModule({ client_id: configuration.jamendoApi.clientId });

};

oauthConnect.prototype.connect = function(request, response, next, models, configuration) {

    var that = this;

    // get the request parameters
    var rawCode = request.param('code');
    var rawState = request.param('state');

    // filter parameters only keep alpha numeric characters
    // TODO: put this filter into utilities file
    if (typeof(rawCode) === 'string' && rawCode.length > 0) {
    
        var code = rawCode.replace(/\W/g, '');

        var data = querystring.stringify({
            code: code,
            client_id: configuration.jamendoApi.clientId,
            client_secret: configuration.jamendoApi.clientSecret,
            grant_type: configuration.jamendoApi.grantType,
            redirect_uri: configuration.jamendoApi.redirectUri
        });

        utilities.log(data);

        var options = {
            hostname: configuration.jamendoApi.apiHost,
            port: configuration.jamendoApi.apiPort,
            path: configuration.jamendoApi.apiVersionPath + configuration.jamendoApi.resources.grant,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': data.length
            }
        };
        
        utilities.log(options);

        var oauthRequest = https.request(options, function(oauthResponse) {

            utilities.log('status: ' + oauthResponse.statusCode);
            utilities.log('header: ' + JSON.stringify(oauthResponse.headers));

            oauthResponse.setEncoding('utf8');
            
            var result = '';

            oauthResponse.on('data', function(chunk) {

                utilities.log('body: ' + chunk);
                
                if (oauthResponse.statusCode === 200) {
                    
                    var result;

                    try {
                        
                        // try to parse response if it fails the response is not json
                        result = JSON.parse(chunk);
                        
                    } catch(e) {

                        // facebook responds with querystring in the body
                        result = querystring.parse(chunk);
                        
                    }
                    
                    utilities.log(result);

                    // get user infos through jamendo api (username / id)
                    that.jamendo.users({
                        access_token: result.access_token
                    },
                    function(error, data) {

                        if (!error) {
                            
                            var user = { 
                                nickname: data.results[0].name,
                                id: data.results[0].id,
                                createdAt: data.results[0].creationdate,
                                language: data.results[0].lang,
                                avatar: data.results[0].image
                            };

                            user.oauth = result;

                            // put user object in session
                            request.session.user = user;

                            // save user in mongodb database
                            models.user.saveOne(user);

                            response.render('oauth', { message: 'oauth connect success' });
                            
                        } else {
                            
                            utilities.log('oauth request failed, status: ' + error);
                            
                            error = { status: oauthResponse.statusCode, stack: '', message: result.error };

                            next(error, request, response, next);
                            
                        }

                    });
                    
                } else {

                    var result;

                    try {
                        
                        // try to parse response if it fails the response is not json
                        result = JSON.parse(chunk);
                        
                    } catch(e) {
                        
                        var matchesArray = chunk.match('<h1[^>]*>(.*?)<\/h1>', 'g');

                        // if there are matches the response might be an error page
                        if (matchesArray !== null) {

                            result = {};

                            result.error = matchesArray[1];

                        } else {

                            // facebook responds with querystring in the body
                            result = querystring.parse(chunk);

                        }
                        
                    }
                
                    utilities.log('oauth request failed, status: ' + oauthResponse.statusCode + ', message: ' + result.error);

                    error = { status: oauthResponse.statusCode, stack: '', message: result.error };

                    next(error, request, response, next);
                    
                }
                
            });

        });

        oauthRequest.on('error', function(e) {

            utilities.log('oauth request failed: ' + e.message);
            
            error = { status: 500, stack: '', message: e.message };
                    
            next(error, request, response, next);

        });

        // write data to request body
        oauthRequest.write(data);
        oauthRequest.end();

    } else {
        
        error = { status: 500, stack: '', message: 'Missing required code' };
                    
        next(error, request, response, next);
        
    }

};

module.exports = oauthConnect;