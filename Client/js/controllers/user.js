angular.module('app')
    .controller('UserCtrl', function($scope, $auth,Account,toastr,$timeout,BidService) {
        $scope.title = " Post a request";
        $scope.disabled = false;

        $scope.isAuthenticated = function() {
            return $auth.isAuthenticated();
        };

        var promise = Account.lastLoginInfo();
        promise.then(function (res) {
            $scope.lastLoginInfo = res.data;
            if(!$.isEmptyObject($scope.lastLoginInfo))
                $scope.loginTemplate="" +
                    // "Login Location : "+$scope.lastLoginInfo.lastLocation.city+", "+$scope.lastLoginInfo.lastLocation.region +
                    // "<br/>Login Time : "+$scope.lastLoginInfo.lastLoggedTime;
                    "Login Info : "+$scope.lastLoginInfo.lastLocation.city+", "+$scope.lastLoginInfo.lastLocation.region + ", " +
                     $scope.lastLoginInfo.lastLoggedTime;
            else{
                $scope.loginTemplate="This is your first login";
            }
        },function (error) {
            toastr.error(error.data.message, error.status);
        });

        $scope.openPopover = function(){
            $('.popovers').popover('show');
        };

        $scope.closePopover = function(){
            $('.popovers').popover('hide');
        };

    });
