var path = require('path');
var qs = require('querystring');
var async = require('async');
var bcrypt = require('bcryptjs');
var bodyParser = require('body-parser');
var colors = require('colors');
var cors = require('cors');
var express = require('express');
var compression = require('compression');
var logger = require('morgan');
var jwt = require('jwt-simple');
var moment = require('moment');
var mongoose = require('mongoose');
var request = require('request');
var dateFormat = require('dateformat');
var nodemailer = require('nodemailer');
var Memcached = require('memcached');

var config = require('./config');

var https = require('https');
const fs = require('fs');


var memcached = new Memcached('localhost:11211');
var smtpTransport = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: "nishnat.390@gmail.com",
        pass: ""
    }
});

var options = {
    key: fs.readFileSync('./ssl/privatekey.key'),
    cert: fs.readFileSync('./ssl/certificate.crt')
};
var userSchema = new mongoose.Schema({
    email: {type: String, unique: true, lowercase: true},
    password: {type: String, select: false},
    displayName: String,
    picture: String,
    facebook: String,
    google: String,
    lastLoggedTimes: [String],
    lastloggedLocations: [mongoose.Schema.Types.Mixed]
});

var itemSchema = new mongoose.Schema({
    userId: String,
    title: String,
    description: String,
    price: Number,
    bids: [String],
    createdAt: Date,
    expireAt: Date,
    isActive: { type: Boolean, default: true }
});

var bidSchema = new mongoose.Schema({
    userId: String,
    itemId: String,
    description: String,
    price: Number,
    createdAt: Date
});

userSchema.pre('save', function (next) {
    var user = this;
    if (!user.isModified('password')) {
        return next();
    }
    bcrypt.genSalt(10, function (err, salt) {
        bcrypt.hash(user.password, salt, function (err, hash) {
            user.password = hash;
            next();
        });
    });
});

userSchema.methods.comparePassword = function (password, done) {
    bcrypt.compare(password, this.password, function (err, isMatch) {
        done(err, isMatch);
    });
};

var User = mongoose.model('User', userSchema);
var Item = mongoose.model('Item', itemSchema);
var Bid = mongoose.model('Bid', bidSchema);

mongoose.connect(config.MONGO_URI);
mongoose.connection.on('error', function (err) {
    console.log('Error: Could not connect to MongoDB. Did you forget to run `mongod`?'.red);
});

var app = express();

app.use(compression(
    {
        threshold: 0,
        filter: function (req, res) {
            return true;
        }
    })
);
app.set('port', process.env.NODE_PORT || 3000);
app.set('host', process.env.NODE_IP || 'localhost');
app.use(cors());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// Force HTTPS on Heroku
if (app.get('env') === 'production') {
    app.use(function (req, res, next) {
        var protocol = req.get('x-forwarded-proto');
        protocol == 'https' ? next() : res.redirect('https://' + req.hostname + req.url);
    });
}
app.use(express.static(path.join(__dirname, '../../client')));
/*

 |--------------------------------------------------------------------------
 | Generate JSON Web Token
 |--------------------------------------------------------------------------
*/

function createJWT(user) {
    var payload = {
        sub: user._id,
        iat: moment().unix(),
        exp: moment().add(15, 'days').unix()
    };
    return jwt.encode(payload, config.TOKEN_SECRET);
}

var sendMail = function (sub, txt, mailId) {
    var options = {
        subject:sub,
        text:txt,
        to:mailId
    };
    smtpTransport.sendMail(options,function(err,info){
        if(err)
            return console.log(err);
        console.log("Message Sent: " + info.response);

    });
};

//////////////////////////////////////////////////////////////////////////////////////////////
 // Login Required Middleware

function ensureAuthenticated(req, res, next) {
    if (!req.header('Authorization')) {
        return res.status(401).send({message: 'Please make sure your request has an Authorization header'});
    }
    var token = req.header('Authorization').split(' ')[1];

    var payload = null;
    try {
        payload = jwt.decode(token, config.TOKEN_SECRET);
    }
    catch (err) {
        return res.status(401).send({message: err.message});
    }

    if (payload.exp <= moment().unix()) {
        return res.status(401).send({message: 'Token has expired'});
    }
    req.user = payload.sub;
    next();
}
var setmemcachedO = { flags: 0, exptime: 0};

var setmemcached = function(key,val){
    memcached.set(key,val,0,function(err){
        if(err){
            console.log("Error Adding to memcache".bgRed);
        }
        else{
            console.log("Successfully added to memcache".bgBlue);
        }
    });
}; 

////////////////////////////////////////////////////////////////////////////////////////////
/* This api is used to singin  using user email id and password */
// Log in with Email
//MICRPSERVICE
var authlogin = function(req, res){
    console.log("~~MICROSERVICE FOR LOG IN USED~~".bgBluw);
    User.findOne({email: req.body.email}, '+password', function (err, user) {
        console.log('mongoose ODM(ORM) is used to look for the email in User model'.bgBlue);
        if (!user) {
            return res.status(401).send({message: 'Invalid email and/or password'});
        }
        user.comparePassword(req.body.password, function (err, isMatch) {
            if (!isMatch) {
                return res.status(401).send({message: 'Invalid email and/or password'});
            }
            // var now = new Date();
            user.lastloggedLocations.push(req.body.locationInfo);
            // user.lastLoggedTimes.push(dateFormat(now, "dddd, mmmm dS, yyyy, h:MM:ss TT"));
            user.lastLoggedTimes.push(new Date());
            user.save(function (err) {
                setmemcached(user._id.toString(),user._doc);
                res.send({token: createJWT(user)});
            });

        });
    });
};

//WEBSERVICE
app.post('/auth/login', function (req, res) {
    console.log("~~WEBSERVICE FOR LOG IN USED~~".bgBlue);
    authlogin(req,res);
});

////////////////////////////////////////////////////////////////////////////////////////////

//This  api is  used to create user account using user email id  and password.

// MICRO SERVICES AND WEB SERVICES FOR SINGUP WITH EMAIL ID AND PASSWORD
var singup0 = function(req, res){
    console.log("~~MICROSERVICE FOR SINGUP WITH EMAIL ID IN USED~~".bgBlue);  
   User.findOne({email: req.body.email}, function (err, existingUser) {
        console.log('mongoose ODM(ORM) is used to find email in User model'.bgBlue);
        if (existingUser) {
            return res.status(409).send({message: 'Email is no longer available'});
        }
        var user = new User({
            displayName: req.body.displayName,
            email: req.body.email,
            password: req.body.password
        });
        console.log('mongoose ODM(ORM) is used to create USER document'.bgBlue);
        user.lastLoggedTimes.push(new Date());
        user.lastloggedLocations.push(req.body.locationInfo);
        user.save(function (err, result) {
            if (err) {
                res.status(500).send({message: err.message});
            }
            res.send({token: createJWT(result)});
        });
    });
};


//b.) WEBSERVICE FOR SINGUP
app.post('/auth/signup', function (req, res) {
    console.log("MICROSERVICE FOR SINGUP WITH EMAIL ID IN USED".bgBlue);
    singup0(req, res);
});

////////////////////////////////////////////////////////////////////////////////

 // Single Signup  with Google

var one = function(profile, req, res){
    console.log("First Microservice for google login called".bgBlue);
User.findOne({google: profile.sub}, function (err, existingUser) {
    console.log('mongoose ODM(ORM) from  first google sing in microservice'.bgBlue);
                    if (existingUser) {
                        return res.status(409).send({message: 'Google account already exists'});
                    }
                    var token = req.header('Authorization').split(' ')[1];
                    var payload = jwt.decode(token, config.TOKEN_SECRET);
                    User.findById(payload.sub, function (err, user) {
                        if (!user) {
                            return res.status(400).send({message: 'User  doesnt seem to be present '});
                        }
                        user.google = profile.sub;
                        user.picture = user.picture || profile.picture.replace('sz=50', 'sz=200');
                        user.displayName = user.displayName || profile.name;
                        user.lastLoggedTimes.push(new Date());
                        user.lastloggedLocations.push(req.body.locationInfo);
                        user.save(function () {
                            var token = createJWT(user);
                            res.send({token: token});
                        });
                    });
                });
};


var two = function(profile,req, res){
    console.log("Second Microservice for google login called".bgBlue);
      User.findOne({google: profile.sub}, function (err, existingUser) {
          console.log('mongoose ODM(ORM) from second google sing in microservice'.bgBlue);
                    if (existingUser) {
                        existingUser.lastLoggedTimes.push(new Date());
                        existingUser.lastloggedLocations.push(req.body.locationInfo);
                        existingUser.save(function () {
                            var token = createJWT(existingUser);
                            res.send({token: token});
                        });
                    }
                    else{
                        var user = new User();
                        user.google = profile.sub;
                        user.picture = profile.picture.replace('sz=50', 'sz=200');
                        user.displayName = profile.name;
                        user.lastLoggedTimes.push(new Date());
                        user.lastloggedLocations.push(req.body.locationInfo);
                        user.save(function (err) {
                            var token = createJWT(user);
                            res.send({token: token});
                        });
                    }

                });
};

app.post('/auth/google', function (req, res) {
    console.log("Webcervice for google singin called".bgBlue);
    var accessTokenUrl = 'https://accounts.google.com/o/oauth2/token';
    var peopleApiUrl = 'https://www.googleapis.com/plus/v1/people/me/openIdConnect';
    var params = {
        code: req.body.code,
        client_id: req.body.clientId,
        client_secret: config.GOOGLE_SECRET,
        redirect_uri: req.body.redirectUri,
        grant_type: 'authorization_code'
    };

    // Step 1. Exchange authorization code for access token.
    request.post(accessTokenUrl, {json: true, form: params}, function (err, response, token) {
        var accessToken = token.access_token;
        var headers = {Authorization: 'Bearer ' + accessToken};

        // Step 2. Retrieve profile information about the current user.
        request.get({url: peopleApiUrl, headers: headers, json: true}, function (err, response, profile) {
            if (profile.error) {
                return res.status(500).send({message: profile.error.message});
            }
            // Step 3a. Link user accounts.
            if (req.header('Authorization')) {
                //
                one(profile, req, res);
            } else {
                // Step 3b. Create a new user account or return an existing one.
                two(profile, req, res);
            }
        });
    });
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////
// Login with Facebook

var facebookone = function(profile, req, res){
    console.log("First Microservice for google login called".bgBlue);
       User.findOne({facebook: profile.id}, function (err, existingUser) {
           console.log('mongoose ODM(ORM) from first google sing in microservice'.bgBlue);
                    
                    if (existingUser) {
                        return res.status(409).send({message: 'There is already a Facebook account that belongs to you'});
                    }
                    var token = req.header('Authorization').split(' ')[1];
                    var payload = jwt.decode(token, config.TOKEN_SECRET);
                    User.findById(payload.sub, function (err, user) {
                        if (!user) {
                            return res.status(400).send({message: 'User not found'});
                        }
                        user.facebook = profile.id;
                        user.picture = user.picture || 'https://graph.facebook.com/v2.3/' + profile.id + '/picture?type=large';
                        user.displayName = user.displayName || profile.name;
                        user.lastLoggedTimes.push(new Date());
                        user.lastloggedLocations.push(req.body.locationInfo);
                        user.save(function () {
                            var token = createJWT(user);
                            res.send({token: token});
                        });
                    });
                });
};

var facebooktwo = function(profile, req, res){
    console.log("Second Microservice for faceboook login called".bgBlue);
     User.findOne({facebook: profile.id}, function (err, existingUser) {
         console.log('mongoose ODM(ORM) from second facebook sing in microservice'.bgBlue);
                    if (existingUser) {
                        existingUser.lastLoggedTimes.push(new Date());
                        existingUser.lastloggedLocations.push(req.body.locationInfo);
                        existingUser.save(function () {
                            var token = createJWT(existingUser);
                            res.send({token: token});
                        });
                    }
                    else{
                        var user = new User();
                        user.facebook = profile.id;
                        user.picture = 'https://graph.facebook.com/' + profile.id + '/picture?type=large';
                        user.displayName = profile.name;
                        user.lastLoggedTimes.push(new Date());
                        user.lastloggedLocations.push(req.body.locationInfo);
                        user.save(function () {
                            var token = createJWT(user);
                            res.send({token: token});
                        });
                    }

                });
};

app.post('/auth/facebook', function (req, res) {
    console.log("Webservice for google login called".bgBlue);
    var fields = ['id', 'email', 'first_name', 'last_name', 'link', 'name'];
    var accessTokenUrl = 'https://graph.facebook.com/v2.5/oauth/access_token';
    var graphApiUrl = 'https://graph.facebook.com/v2.5/me?fields=' + fields.join(',');
    var params = {
        code: req.body.code,
        client_id: req.body.clientId,
        client_secret: config.FACEBOOK_SECRET,
        redirect_uri: req.body.redirectUri
    };

    // Step 1. Exchange authorization code for access token.
    request.get({url: accessTokenUrl, qs: params, json: true}, function (err, response, accessToken) {
        if (response.statusCode !== 200) {
            return res.status(500).send({message: accessToken.error.message});
        }

        // Step 2. Retrieve profile information about the current user.
        request.get({url: graphApiUrl, qs: accessToken, json: true}, function (err, response, profile) {
            if (response.statusCode !== 200) {
                return res.status(500).send({message: profile.error.message});
            }
            if (req.header('Authorization')) {
                facebookone(profile,req, res);
            } else {
                facebooktwo(profile, req, res);
            }
        });
    });
});


///////////////////////////////////////////////////////////////////////////////////////////

//GET /api/me

//MICROSERVICE
var apime =  function(req, res)
{
    console.log("~~MICROSERVICE FOR USER INFO~~".bgBlue);
    User.findById(req.user, function (err, user) {
        console.log('mongoose ODM(ORM) is used to find user in User model'.bgBlue);
        setmemcached(user._id.toString(),user._doc);
        res.send(user);
    });
};

//WEBSERVICE
app.get('/api/me', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE FOR USER INFO~~".bgBlue);
    memcached.get(req.user,function (err,data) {
        if(err || data == undefined){
            console.log('Cache Miss for user info'.bgRed);
            apime(req, res);
        }
        else{
            console.log('Cache Hit for user info'.bgBlue);
            res.send(data);
        }
    });

});

////////////////////////////////////////////////////////////////////////////////////////
// PUT /api/me


//MICROSERVICE
var putapime = function(req, res){
    console.log("~~MICROSERVICE TO EDIT USER INFO~~".bgBlue);
    User.findById(req.user, function (err, user) {
        console.log('mongoose ODM(ORM) is used to find user in User model'.bgBlue);
        if (!user) {
            return res.status(400).send({message: 'User not found'});
        }
        user.displayName = req.body.displayName || user.displayName;
        user.email = req.body.email || user.email;
        user.save(function (err) {
            setmemcached(user._id.toString(),user._doc);
            res.status(200).end();
        });
    });
};



//WEBSERVICE
app.post('/api/me', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO EDIT USER INFO~~".bgBlue)
    putapime(req, res);
});


/*

 |--------------------------------------------------------------------------
 | POST /api/change
 |--------------------------------------------------------------------------
*/

app.post('/api/updatepwd', ensureAuthenticated, function (req, res) {
    User.findOne({"_id": req.user}, '+password', function (err, user) {
        if (!user) {
            return res.status(400).send({message: 'User not found'});
        }
        user.comparePassword(req.body.old, function (err, isMatch) {
            if (!isMatch) {
                return res.status(401).send({message: 'Invalid email and/or password'});
            }
            user.password = req.body.new || user.password;
            user.save(function (err) {
                res.status(200).end();
            });
        });
    });
});
////////////////////////////////////////////////////////////////////////////////////////////
// GET /api/prevloginInfo

//MICROSERVICE
var prevloginInfo = function(req, res){
    console.log("~~MICROSERVICE TO PREVIOUS LOGIN INFO CALLED~~".bgBlue);
    User.findOne({"_id": req.user}, function (err, user) {
        console.log('mongoose ODM(ORM) is used to find id in User model'.bgBlue);
        if (!user) {
            return res.status(400).send({message: 'User not found'});
        }
        var returnInfo = {};
        var locationInfo = user.lastloggedLocations;
        var timeInfo = user.lastLoggedTimes;
        if (locationInfo.length > 1 && timeInfo.length > 1) {
            returnInfo.lastLocation = locationInfo[locationInfo.length - 2];
            returnInfo.lastLoggedTime = dateFormat(timeInfo[timeInfo.length - 2], "dddd, mmmm dS, yyyy, h:MM:ss TT");
        }
        res.send(returnInfo);
    });
};


//WEBSERVICE
app.get('/api/prevloginInfo', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO PREVIOUS LOGIN INFO CALLED~~".bgBlue);
    memcached.get(req.user,function(err,data){
        if(err || data == undefined){
            console.log('Cache Miss for previous login info'.bgRed);
            prevloginInfo(req, res);
        }
        else{
            console.log('Cache Hit for previous login info'.bgBlue);
            var returnInfo = {};
            var locationInfo = data.lastloggedLocations;
            var timeInfo = data.lastLoggedTimes;
            if (locationInfo.length > 1 && timeInfo.length > 1) {
                returnInfo.lastLocation = locationInfo[locationInfo.length - 2];
                returnInfo.lastLoggedTime = dateFormat(timeInfo[timeInfo.length - 2], "dddd, mmmm dS, yyyy, h:MM:ss TT");
            }
            res.send(returnInfo);
        }
    });
});

//////////////////////////////////////////////////////////////////////////////////

//POST /api/post


//MICROSERVICE
var postapipost = function(req, res){
    console.log("~~MICROSERVICE TO PREVIOUS INFO CALLED~~".bgBlue);
   var item = new Item({
        title: req.body.title,
        description: req.body.description,
        price: req.body.price,
        createdAt:  new Date(),
        expireAt: new Date((new Date()).setTime((new Date()).getTime()+ 60000)),//1000 * 300
        bids: [],
        userId: req.user
    });
    item.save(function (err, result) {
 	//console.log(moment.duration(result.createdAt.diff(result.expireAt)));
        //  console.log(result.createdAt.getMinutes());
        // console.log(result.expireAt.getMinutes());
        //console.log(result.expireAt.getMinutes() - result.createdAt.getMinutes());
        console.log('mongoose ODM(ORM) is used to save in ITEM model'.bgBlue);
        if (err) {
            res.status(500).send({message: err.message});
        }
        res.status(200).end();
    });
};

//WEBSERVICE
app.post('/api/post', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO POST ITEMS USED ~~".bgBlue);
    postapipost(req, res);
});

/////////////////////////////////////////////////////////////////////////////////////
//  GET /api/post

//MICROSERVIVE
var getapipost = function(req, res){
    console.log("~~MICROSERVICE TO ADD POSTS CALLED~~".bgBlue);
    Item.find({"userId": {$ne: req.user}}, function (err, posts) {
        console.log('mongoose ODM(ORM) is used to find  in ITEM model'.bgBlue);
        if (!posts || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        var postsObj = [];
        var j=0;
        for(var i=0;i<posts.length;i++){
            var query = User.findOne({"_id":posts[i].userId});
            var promise = query.exec();
            promise.then(function(user){
                var currPost = posts[j]._doc;
                currPost.displayName = user._doc.displayName;
                postsObj.push(currPost);
                j++;
                if(j === posts.length)
                    res.send(postsObj);

            });
        }
    });
};

//WEBSERVICE
app.get('/api/post', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO ADD POSTS CALLED~~".bgBlue);
    getapipost(req, res);
});


/////////////////////////////////////////////////////////////////////////////////////

//GET /api/myposts


//MICROSERVICE
var getapimyposts = function(req, res){
    console.log("~~MICROSERVICE TO GET USER'S PREVIOUS POSTS CALLED~~".bgBlue);
    Item.find({userId: req.user}, function (err, posts) {
        console.log('mongoose ODM(ORM) is used to find in ITEM model'.bgBlue);
        if (!posts || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        var postsObj = [];
        var j=0;
        for(var i=0;i<posts.length;i++){
            var query = User.findOne({"_id":posts[i].userId});
            var promise = query.exec();
            promise.then(function(user){
                var currPost = posts[j]._doc;
                currPost.displayName = user._doc.displayName;
                postsObj.push(currPost);
                j++;
                if(j === posts.length)
                    res.send(postsObj);

            });
        }
    });
};


//WEBSERVICE
app.get('/api/myposts', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO GET USER'S POSTS CALLED~~".bgBlue);
    getapimyposts(req, res);
});



/////////////////////////////////////////////////////////////////////////////////////

//GET /api/mybids


//MICROSERVICE
var getapimybids = function(req, res){
    console.log("~~MICROSERVICE TO GET USER'S PREVIOUS BIDS CALLED~~".bgBlue);
    Bid.find({userId: req.user}, function (err, bids) {
        console.log('mongoose ODM(ORM) is used to find in ITEM model'.bgBlue);
        if (!bids || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        var bidsObj = [];
        var j=0;
        for(var i=0;i<bids.length;i++){
            var query = User.findOne({"_id":bids[i].userId});
            var promise = query.exec();
            promise.then(function(user){
                var currPost = bids[j]._doc;
                currPost.displayName = user._doc.displayName;
                postsObj.push(currPost);
                j++;
                if(j === bids.length)
                    res.send(bidsObj);

            });
        }
    });
};


//WEBSERVICE
app.get('/api/mybids', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO GET USER'S BIDS CALLED~~".bgBlue);
    getapimybids(req, res);
});

///////////////////////////////////////////////////////////////////////////////////
// GET /api/post/:id


//MICROSERVICE
var apipostid = function(req, res){
    console.log("~~MICROSERVICE TO GET VIEW  ONE POS CALLED~~".bgBlue);
    Item.findOne({"_id": req.params.id}, function (err, post) {
        console.log('mongoose ODM(ORM) is used to find  in ITEM model'.bgBlue);
        if (!post) {
            return res.status(400).send({message: 'Post not found'});
        }
        res.send(post);
    });
};


//WEBSERVICE
app.get('/api/post/:id', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO GET VIEW  ONE POST CALLED~~".bgBlue);
    memcached.get(req.params.id,function(err,data){
        if(err || data == undefined){
            console.log('Cache Miss'.bgRed);
            //apipostid(req, res);
        }
        else{
            console.log('Cache Hit'.bgBlue);
            res.send(data);
        }
    });
});






//////////////////////////////////////////////////////////////////////////////////

// POST /api/bid

var   apipostidbidpost   = function(req, res){
     console.log("~~MICROSERVICE Post  /api/:postId/bid called ~".bgBlue);
      var bid = new Bid({
            userId:req.user,
            itemId:req.params.postId,
            description: req.body.additionalDesc,
          //  quantity:req.body.quantity,
            price:req.body.bidPrice,
            createdAt: new Date()
        });
        bid.save(function (err, result) {
            if (err) {
                res.status(500).send({message: err.message});
            }
            console.log('mongoose ODM(ORM) called'.bgBlue);
            Item.findOne({_id:req.params.postId},function(err,post){
                if(err)
                    res.status(500).send({message: err.message});
                post.bids.push(result._id);
                post.save(function(err,result){
                    if(err)
                        res.status(500).send({message: err.message});
                    res.status(200).end();
                });
            });
        });
};


app.post('/api/:postId/bid', ensureAuthenticated, function (req, res) {
     console.log("~~WEBSERVICE Post  /api/:postId/bid called ~".bgBlue);
    if(req.params.postId){
        apipostidbidpost(req, res);
    }
    else{
        res.status(500).send({message: "Invalid Information"});
    }
});

//////////////////////////////////////////////////////////////////////////////////

// GET /api/post/:id

//MICROSERVICE
var getapipostId= function(req, res){
    console.log("~~MICROSERVICE TO GET BID CALLED~~".bgBlue);
    Bid.find({itemId: req.params.postId}, function (err, bids) {
        console.log('mongoose ODM(ORM) is used to find bid in BID model'.bgBlue);
        if (!bids || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        var bidsObj = [];
        var j=0;
        for(var i=0;i<bids.length;i++){

            var query = User.findOne({"_id":bids[i].userId});
            var promise = query.exec();
            promise.then(function(user){
                // var currBid = bids[i]._doc;
                var currBid = bids[j]._doc;
                currBid.displayName = user._doc.displayName;
                bidsObj.push(currBid);
                j++;
                if(j === bids.length)
                    res.send(bidsObj);

            });

        }
    });
};


//WEBSERVICE
app.get('/api/bids/:postId', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO GET BID CALLED~~".bgBlue);
    getapipostId(req, res);
});



//////////////////////////////////////////////////////////////////////////////////
// GET /api/myposts/delete/:id


//MICROSERVICE
var apimypostsdeleteid = function(req, res){
    console.log("~~MICROSERVICE TO POST BID CALLED~~".bgBlue);
    Item.remove({"_id": req.params.id}, function (err, posts) {
        console.log('mongoose ODM(ORM) is used to remove posts from ITEM model'.bgBlue);
        if(err){
            res.status(500).send({message: err.message});
        }
        res.send(posts);
    });
};

//WEBSERVICE
app.get('/api/myposts/delete/:id', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO POST BID CALLED~~".bgBlue);
    apimypostsdeleteid(req, res);
});

//////////////////////////////////////////////////////////////////////////////////
// GET /api/myposts/delete/:id


//MICROSERVICE
var apimybidsdeleteid = function(req, res){
    console.log("~~MICROSERVICE TO DELETE BID CALLED~~".bgBlue);
    Bid.remove({"_id": req.params.id}, function (err, bids) {
        console.log('mongoose ODM(ORM) is used to remove bid from ITEM model'.bgBlue);
        if(err){
            res.status(500).send({message: err.message});
        }
        res.send(bids);
    });
};

//WEBSERVICE
app.get('/api/mybids/delete/:id', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO DELETE BID CALLED~~".bgBlue);
    apimybidsdeleteid(req, res);
});
///////////////////////////////////////////////////////////////////////////////////

// GET /api/post/:id

//MICROSERVICE
var getapismyposts = function(req, res){
    console.log("~~MICROSERVICE TO USERS PARTICUR POST~~".bgBlue);
    Item.findOne({_id: req.params.postId}, function (err, post) {
        console.log('mongoose ODM(ORM) is used to find item in ITEM  model'.bgBlue);
        setmemcached(post._id.toString(),post._doc);
        if (!post || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        if (post.userId === req.user)
            res.send({isMyPost: true});
        else
            res.send({isMyPost: false});
    });
};

//WEBSERVICE
app.get('/api/isMyPost/:postId', ensureAuthenticated, function (req, res)
{
    console.log("~~WEBSERVICE TO  USERS PARTICUR POST~~".bgBlue);
    memcached.get(req.params.postId,function(err,data){
        if(err || data == undefined){
            console.log('Cache Miss');
            getapismyposts(req, res);
        }
        else{
            console.log('Cache Hit');
            if (data.userId === req.user)
                res.send({isMyPost: true});
            else
                res.send({isMyPost: false});
        }
    });

});

//*
///////////////////////////////////////////////////////////////////////////////
// PoST logintt
app.post('/logintt', function(req, res){
    failureRedirect: '/login',
    failureFlash= true }), function(req, res) {
    if (req.body.remember) {
        req.session.cookie.maxAge = 1000 * 60 * 3;
    } else {
        req.session.cookie.expires = false;
    }
    res.redirect("/admin#/blogs");
};
/////////////////////////////////////////////////////////////////////////////////
// GET /api/bids

//MICROSERVICE
var apibid = function(req, res){
    console.log("~~MICROSERVICE TO GET USERS PARTICUR POST~~".bgBluem);
    Bid.find({"userId": req.user}, function (err, bids) {
        console.log('mongoose ODM(ORM) is used to find bid in  BID model'.bgBlue);
        if (!bids || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        res.send(bids);
    });
};

//WEBSERVICE
app.get('/api/mybids', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO GET  USERS PARTICUR POST~~".bgBlue);
    apibid(req, res);
});

//*
//////////////////////////////////////////////////////////////////////////////////////////
//GET /api/ss

app.post('/api/ss', function (req, res) {
    // register using api to maintain clean separation between layers
    request.post({
        url: config.apiUrl + '/users/register',
        form: req.body,
        json: true
    }, function (error, response, body) {
        if (error) {
            return res.render('register', { error: 'An error occurred' });
        }
 
        if (response.statusCode !== 200) {
            return res.render('register', {
                error: response.body,
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                username: req.body.username
            });
        }
 
        // return to login page with success message
        req.session.success = 'Registration successful';
        return res.redirect('/login');
    });
});
////////////////////////////////////////////////////////////////////////////////////
// GET /api/post/:id

//MICROSERVICE
getapibidd = function(req, res){
    console.log("~~MICROSERVICE TO GET USERS PARTICUR BID~~".bgBlue);
    Bid.findOne({"_id": req.params.id}, function (err, bid) {
        console.log('mongoose ODM(ORM) is used to find bid in  BID model'.bgBlue);
        if (!bid) {
            return res.status(400).send({message: 'Post not found'});
        }
        res.send(bid);
    });
};

//WEBSERVICE
app.get('/api/bid/:id', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO GET USERS PARTICUR BID~~".bgBlue);
    memcached.get(req.params.id,function(err,data){
        if(err || data == undefined){
            console.log('Cache Miss'.bgRed);
            getapibidd(req, res);
        }
        else{
            console.log('Cache Hit'.bgBlue);
            res.send(data);
        }
    });
});

//*
/////////////////////////////////////////////////////////////////////////////////


// GET contactlist
 app.get('/contactlist/:id', function (req, res) {
  var id = req.params.id;
  console.log(id);
  db.contactlist.findOne({_id: mongojs.ObjectId(id)}, function (err, doc) {
    res.json(doc);
  });
});


///////////////////////////////////////////////////////////////////////////////////
// PUT contactlist id
app.put('/contactlist/:id', function (req, res) {
  var id = req.params.id;
  console.log(req.body.name);
  db.contactlist.findAndModify({
    query: {_id: mongojs.ObjectId(id)},
    update: {$set: {name: req.body.name, email: req.body.email, number: req.body.number}},
    new: true}, function (err, doc) {
      res.json(doc);
    }
  );
});

/////////////////////////////////////////////////////////////////////////////
//GET /api/post/:id

//MICROSERVICE
var apimybids = function(req, res){
    console.log("~~WEBSERVICE TO  POST USERS PARTICULAR BID ~~".bgBlue);
    Bid.find({userId: req.user}, function (err, bids) {
        console.log('mongoose ODM(ORM) is used to find bid in  BID model'.bgBlue);
        if (err) {
            res.status(500).send({message: err.message});
        }
        posts = [];
        for (var bid in bids) {
            posts.push(bids.postId);
        }
        res.status(200).send(posts);
    });
};


//WEBSERVICE
app.get('/api/mybids/posts', ensureAuthenticated, function (req, res) {
    console.log("~~WEBSERVICE TO POST  USERS PARTICULAR BID ~~".bgBlue);
    apimybids(req, res);
});




////////////////////////////////////////////////////////////////////////////////////
// GET /api/post/:id



var apimybidsget = function(req, res){
     console.log("~MICROSERVICE TO GET ALL THE USER BIDS CALLED".bgBlue);
     Bid.find({"userId": req.user}, function (err, bids) {
        if (!bids || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        res.send(bids);
    });
};


app.get('/api/mybids', ensureAuthenticated, function (req, res) {
     console.log("~WEBSERVICE TO GET ALL THE USER BIDS CALLED".bgBlue);
   apimybidsget(req, res);
});


//////////////////////////////////////////////////////////////////////////////

// GET /api/post/:id

var apibididget = function(req, res){
     console.log("~MICROSERVICE TO GET PARTICULAR USER BID CALLED".bgBlue);
  Bid.findOne({"_id": req.params.id}, function (err, bid) {
       console.log('mongoose ODM(ORM) called'.bgBlue);
        if (!bid) {
            return res.status(400).send({message: 'Post not found'});
        }
        res.send(bid);
    });  
};

app.get('/api/bid/:id', ensureAuthenticated, function (req, res) {
    console.log("~WEBSERVICE TO GET PARTICULAR USER BID CALLED".bgBlue);
    apibididget(req, res);
});

//*
//////////////////////////////////////////////////////////////////////////////////////////
//GET /api/ss

app.post('/api/ss', function (req, res) {
    // register using api to maintain clean separation between layers
    request.post({
        url: config.apiUrl + '/users/register',
        form: req.body,
        json: true
    }, function (error, response, body) {
        if (error) {
            return res.render('register', { error: 'An error occurred' });
        }
 
        if (response.statusCode !== 200) {
            return res.render('register', {
                error: response.body,
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                username: req.body.username
            });
        }
 
        // return to login page with success message
        req.session.success = 'Registration successful';
        return res.redirect('/login');
    });
});


///////////////////////////////////////////////////////////////////////////////
 //GET /api/post/:id
 

var apigetmybidsposts = function(req, res){
    console.log("~MICROSERVICE TO GET ALL THE USER BIDS CALLED".bgBlue);
  Bid.find({userId:req.user},function(err,bids){
       console.log('mongoose ODM(ORM) called'.bgBlue);
        if(err){
            res.status(500).send({message: err.message});
        }
        posts = [];
        for(var bid in bids){
            posts.push(bids.postId);
        }
        res.status(200).send(posts);
    });  
};


app.get('/api/mybids/posts', ensureAuthenticated, function (req, res) {
    console.log("~MICROSERVICE TO GET ALL THE USER BIDS CALLED".bgBlue);
    apigetmybidsposts(req, res);
});



//*
////////////////////////////////////////////////////////////////////////////////////

//GET contactlist

app.post('/contactlist', function (req, res) {
  console.log(req.body);
  db.contactlist.insert(req.body, function(err, doc) {
    res.json(doc);
  });
});
////////////////////////////////////////////////////////////////////////////////////
// GET /api/allbids
 //MICROSERVICE 

var apiallbids =function(req, res){
      console.log("~MICROSERVICE TO GET ALL THE BIDS CALLED".bgBlue);
    User.findOne({"_id": req.user}, function (err, user) {
         console.log('mongoose ODM(ORM) called'.bgBlue);
        if (!user) {
            return res.status(400).send({message: 'User not found'});
        }
        Bid.find({userId:req.user},function(err,bids){
            if (err) {
                return res.status(500).send({message: err.message});
            }

            for (i=0; i<bids.length;i++){
                (function(i) {
                    Item.findOne({"_id":bids[i].itemId},function(err,post) {
                        if (err) {
                            //res.status(500).send({message: err.message});
                            bids[i]._doc["isActive"] ="Inactive";
                        }
                        //console.log(post.isActive);
                        else
                        bids[i]._doc["isActive"] = "Active";
                        // console.log(bids);
                        if (i === bids.length - 1){
                            return res.status(200).send(bids);
                        }
                    });
                })(i);
            }
        })
    });
};


//*
////////////////////////////////////////////////////////////////////////////////////////////

//DELETE contactlist
app.delete('/contactlist/:id', function (req, res) {
  var id = req.params.id;
  console.log(id);
  db.contactlist.remove({_id: mongojs.ObjectId(id)}, function (err, doc) {
    res.json(doc);
  });
});



 //WEBSERVICE 
app.get('/api/allbids', ensureAuthenticated, function (req, res) {
    console.log("~WEBSERIVE TO GET ALL THE BIDS CALLED".bgBlue);
  apiallbids(req, res);
});
///////////////////////////////////////////////////////////////////////////////////////////////////

var anothersearch = function(usrid, description){
    User.findOne({_id: usrid},function (err, bidsbyuser) {
                    if(err){
                     console.log(err);
                     }else{
                     //console.log(resultbids);
                     sendMail('Congrats! You wont the bid','you won:'+description,bidsbyuser.email);
                     }
                   });
                    
};

//////////////////////////////////////////////////////////////////////////////////////////////////
var getResult  = function(resultbids,description){ 
    var max = 0;     
    var id = '';
    for(var i = 0 ; i< resultbids.length ;i++){
        if(max <= resultbids[i].price){
            max = resultbids[i].price;
            id = resultbids[i].userId;
        }
    }
     User.findOne({_id: usrid},function (err, bidsbyuser) {
                    if(err){
                     console.log(err);
                     }else{
                     //console.log(resultbids);
                     sendMail('Congrats! You wont the bid','you won:'+description,bidsbyuser.email);
                     }
                   });
    
   
};
/////////////////////////////////////////////////////////////////////////////////////////////////////

// ON THE SHELF TIME OUT
// var getScore = function(){
//     var desc ='';
//     var sellerid = '';
//     var selleridtemp = '';
//     console.log("getScore called");
//      Item.find(function (err, results) {
//         if(err){
//             console.log(err);
//         }else{
//                for(var i = 0 ; i< results.length;i++){
//                   var a = results[i].createdAt.getMinutes();
//                   desc = results[i].description;
//                   sellerid = results[i].userId;
//                   console.log(sellerid);
//                   var b = (new Date()).getMinutes();
//                   if(b - a >= 0)
//                   {
//                       Bid.find({itemId:results[i]._id},function (err, resultbids) {
//                     if(err){
//                      console.log(err);
//                      }else{
//                       var max = 0;     
//                     var id = '';
//                     for(var i = 0 ; i< resultbids.length ;i++){
//                         if(max <= resultbids[i].price){
//                             max = resultbids[i].price;
//                             id = resultbids[i].userId;
//                             selleridtemp= sellerid;//
//                         }
//                     }
//                     //console.log(selleridtemp);
//                   User.findOne({_id: id},function (err, bidsbyuser) {
//                        console.log('mongoose ODM(ORM) used to find greatest bidder'.bgBlue);
//                     if(err){
//                      console.log(err);
//                     }else{
//                         console.log(bidsbyuser.email);
//                         //console.log(selleridtemp);
//                      sendMail('purchase order receipt','you won:'+ desc  ,bidsbyuser.email);
//                      }
//                    });
//                    console.log(selleridtemp);
//                    User.findOne({_id: selleridtemp},function (err, bidsbyseller) {
//                         console.log('mongoose ODM(ORM) called to find the seller'.bgBlue);
//                      if(err){
//                      console.log(err);
//                       }else{
//                       sendMail('purchase order receipt','item  removed from shelf:'+ desc  ,bidsbyseller.email);
//                       }
//                     });
//                    }
//                    });
//                 //   Item.remove({_id: results[i]._id}, function (err, posts) {
//                 //   if(err){
//                 //          console.log('ERROR');
//                 //          }
//                 //    console.log("ITEMS REMOVES AFTER RUNNING ON THE SHELF FUNCTION".bgRed);
//                 //   });
//                   }
//                 }
//                }
//         }); 
//           //  console.log("YOOOY");
//             //   console.log(selleridtemp);
//         //    User.findOne({_id: selleridtemp},function (err, bidsbyseller) {
//         //              if(err){
//         //              console.log(err);
//         //               }else{
//         //               sendMail('purchase order receipt','item  removed from shelf:'+ desc  ,bidsbyseller.email);
//         //               }
//         //             });
//     };

// setInterval(function(){ 
//     console.log("ON THE SHELF CHECHING IS RUNNING".bgBlue);
//     getScore();
// }, 1*60000);


var server = https.createServer(options, app).listen(app.get('port'), app.get('host'), function () {
  console.log('https Express server listening on port https ' + app.get('port'));
});
app.on('connection',function(socket){
   socket.setTimeout(5 * 60 * 1000);
    socket.once('timeout', function() {
       process.nextTick(socket.destroy);
    });
});

