angular.module('app', ['ngResource', 'ngMessages', 'ngAnimate', 'toastr', 'ui.router', 'satellizer', 'ng-currency', 'ngTable'])
    .config(function ($stateProvider, $urlRouterProvider, $authProvider, toastrConfig) {

        $.ajaxSetup({
            async: false
        });

        $.getJSON('config.json', function (data) {
            window.appSettings = {};
            window.appSettings.serviceURL = data.serviceURL;
            $.get("https://ipinfo.io", function (response) {
                window.appSettings.locationInfo = response;
            }, "jsonp");
            $authProvider.baseUrl = appSettings.serviceURL;
            $.ajaxSetup({
                async: true
            });
        });

        /**
         * Helper auth functions
         */
        var skipIfLoggedIn = ['$q', '$auth', function ($q, $auth) {
            var deferred = $q.defer();
            if ($auth.isAuthenticated()) {
                deferred.reject();
            } else {
                deferred.resolve();
            }
            return deferred.promise;
        }];

        var loginRequired = ['$q', '$location', '$auth', function ($q, $location, $auth) {
            var deferred = $q.defer();
            if ($auth.isAuthenticated()) {
                deferred.resolve();
            } else {
                $location.path('/login');
            }
            return deferred.promise;
        }];

        /**
         * Configure toastr messages
         */
        toastrConfig.closeButton = true;
        toastrConfig.progressBar = true;
        toastrConfig.tapToDismiss = false;
        toastrConfig.timeOut = 1500;

        /**
         * App routes
         */
        $stateProvider
            .state('home', {
                abstract: true,
                url: '/home',
                templateUrl: 'views/home.html'
            })
            .state('login', {
                parent: 'home',
                url: '/login',
                templateUrl: 'views/login.html',
                controller: 'LoginCtrl'
            })
            .state('signup', {
                parent: 'home',
                url: '/signup',
                templateUrl: 'views/signup.html',
                controller: 'SignupCtrl'
            })
            .state('logout', {
                url: '/logout',
                template: null,
                controller: 'LogoutCtrl'
            })
            .state('user', {
                abstract: true,
                url: '/user',
                controller: 'UserCtrl',
                templateUrl: 'views/user.html',
                resolve: {
                    loginRequired: loginRequired
                }
            })
            .state('main', {
                parent: 'user',
                url: '/main',
                controller: 'MainCtrl',
                templateUrl: 'views/post.html'
            })
            .state('search', {
                parent: 'user',
                url: '/search',
                controller: 'SearchCtrl',
                templateUrl: 'views/search.html'
            })
            .state('profile', {
                parent: 'user',
                url: '/profile',
                templateUrl: 'views/profile.html',
                controller: 'ProfileCtrl',
                resolve: {
                    loginRequired: loginRequired
                }
            })
            .state('myposts', {
                parent: 'user',
                url: '/myposts',
                templateUrl: 'views/viewposts.html',
                controller: 'MyPostsCtrl',
                resolve: {
                    loginRequired: loginRequired
                }
            })
            .state('mybids', {
                parent: 'user',
                url: '/mybids',
                templateUrl: 'views/viewbids.html',
                controller: 'MyBidsCtrl',
                resolve: {
                    loginRequired: loginRequired
                }
            })
            .state('bid', {
                parent: 'user',
                url: '/bid/:postId',
                templateUrl: 'views/post.html',
                controller: 'BidCtrl',
                resolve: {
                    loginRequired: loginRequired
                }
            })
            .state('change', {
                parent: 'user',
                url: '/change',
                templateUrl: 'views/pwdchange.html',
                controller: 'ChangePwdCtrl',
                resolve: {
                    loginRequired: loginRequired
                }
            });

        $urlRouterProvider.otherwise('/home/login');

        /**
         *  Satellizer config
         */
        $authProvider.facebook({
            clientId: '714997598648630'
        });

        $authProvider.google({
            clientId: '319979290727-q8ha2imo9eoqrr2clmlovlco9dese09b'
        });

    })
    .run(['$rootScope', '$state', 'ngTableDefaults', 'BidService', function ($rootScope, $state, ngTableDefaults, BidService) {
        $rootScope.$on('$stateChangeError', function (event) {
            $state.go('404');
        });

        $state.transitionTo('login');
        ngTableDefaults.params.count = 10;
        ngTableDefaults.settings.counts = [];
    }
]);
