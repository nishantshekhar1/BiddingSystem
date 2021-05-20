angular.module('app')
    .controller('MyBidsCtrl', function ($scope, $auth, toastr, $timeout, BidService, NgTableParams,$location) {
        var getbids = function() {
            BidService.getMyBids().then(function (data) {
                // params.total(data); // recal. page nav controls
                $scope.dataSet = data.data;
                $timeout(function () {
                    $scope.tableParams = new NgTableParams({
                        // initial sort order
                        sorting: {createdAt: "desc"}
                    }, {
                        dataset: $scope.dataSet
                    });
                });
            });
        };

        $scope.delete = function (data) {
            BidService.deleteBidbyId(data._id)
                .then(function () {
                    toastr.success("The post has been successfully deleted");
                    // $scope.view(datar);
                    document.location.reload();
                    $timeout(function(){
                        getbids();
                    });

                }, function (error) {
                    toastr.error(error.data.message, error.status);

                });
        };

      getbids();
    });
