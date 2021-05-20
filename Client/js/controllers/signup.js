angular.module('app')
    .controller('SignupCtrl', function ($scope, $location, $auth, toastr) {
        $scope.signup = function () {
            $scope.user.locationInfo = appSettings.locationInfo;
            $auth.signup($scope.user)
                .then(function (response) {
                    $auth.setToken(response);
                    $location.path('/');
                    toastr.info('','You have successfully created a new account and have been signed-in');
                })
                .catch(function (response) {
                    toastr.error(response.data.message);
                });
        };

        if ($auth.isAuthenticated()) {
            $location.path('#/user/main');
        }

    });