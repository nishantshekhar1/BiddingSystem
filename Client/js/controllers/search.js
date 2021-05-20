angular.module('app')
    .controller('SearchCtrl', function ($scope, $auth, toastr, $timeout, BidService, NgTableParams,$location) {
        BidService.getAllPosts().then(function(data) {
            // params.total(data); // recal. page nav controls
            $scope.dataSet = data.data;
            //document.location.reload();
            $timeout(function(){
                $scope.tableParams = new NgTableParams({
                    // initial sort order
                    sorting: { createdAt: "desc" }
                }, {
                    dataset: $scope.dataSet
                });
            });
        });

        $scope.view= function(data){
            $location.path('/user/bid/'+data._id);
        };

        $scope.convert= function(date){
            return moment(date).fromNow();
        };

    });
